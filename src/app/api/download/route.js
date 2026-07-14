import { execFile, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { Readable } from "stream";

const execFileAsync = promisify(execFile);

const FFMPEG_PATH = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
);

const YTDLP_PATH = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

export async function GET(request) {
  let tempFilePath = null;
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatType = searchParams.get("format") || "video";

    if (!url) {
      return new Response("Invalid URL", { status: 400 });
    }

    console.log(`[Download API] Starting download request for URL: ${url}, Format: ${formatType}`);

    // Get video title for filename
    const { stdout: infoOut } = await execFileAsync(YTDLP_PATH, [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url,
    ]);
    const info = JSON.parse(infoOut);
    const title = (info.title || "video").replace(/[<>:"/\\|?*]/g, "").trim();
    console.log(`[Download API] Resolved video title: "${title}"`);

    let args;
    let ext;
    let contentType;

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (formatType === "audio") {
      ext = "mp3";
      contentType = "audio/mpeg";
      tempFilePath = path.join(os.tmpdir(), `ytdl-${uniqueId}.${ext}`);
      
      args = [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--ffmpeg-location", FFMPEG_PATH,
        "-o", tempFilePath,
        "--no-playlist",
        url,
      ];
    } else {
      ext = "mp4";
      contentType = "video/mp4";
      tempFilePath = path.join(os.tmpdir(), `ytdl-${uniqueId}.${ext}`);

      args = [
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--ffmpeg-location", FFMPEG_PATH,
        "--merge-output-format", "mp4",
        "-o", tempFilePath,
        "--no-playlist",
        url,
      ];
    }

    console.log(`[Download API] Target temp file path: "${tempFilePath}"`);
    console.log(`[Download API] Spawning yt-dlp with arguments: ${args.join(" ")}`);

    // Prepare custom environment with ffmpeg directory prepended to PATH
    const ffmpegDir = path.dirname(FFMPEG_PATH);
    const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
    const existingPath = process.env[pathEnvKey] || "";
    const customEnv = {
      ...process.env,
      [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    };

    // Spawn yt-dlp with custom environment
    const ytdlpProcess = spawn(YTDLP_PATH, args, { env: customEnv });

    ytdlpProcess.stdout.on("data", (data) => {
      console.log(`[yt-dlp stdout] ${data.toString().trim()}`);
    });

    ytdlpProcess.stderr.on("data", (data) => {
      console.log(`[yt-dlp stderr] ${data.toString().trim()}`);
    });

    await new Promise((resolve, reject) => {
      ytdlpProcess.on("close", (code) => {
        console.log(`[Download API] yt-dlp process closed with code: ${code}`);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      ytdlpProcess.on("error", (err) => {
        console.error(`[Download API] yt-dlp spawn error:`, err);
        reject(err);
      });
    });

    const fileExists = fs.existsSync(tempFilePath);
    console.log(`[Download API] Checking file existence: ${fileExists}`);
    if (fileExists) {
      const fileSize = fs.statSync(tempFilePath).size;
      console.log(`[Download API] File size: ${fileSize} bytes`);
      if (fileSize === 0) {
        throw new Error("Downloaded file is empty");
      }
    } else {
      throw new Error("Downloaded file does not exist at tempFilePath");
    }

    // Create stream from the temp file
    const fileStream = fs.createReadStream(tempFilePath);

    // Register cleanup to delete the temp file once the stream finishes or errors
    const cleanup = () => {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        console.log(`[Download API] Cleaning up temp file: ${tempFilePath}`);
        fs.unlink(tempFilePath, (err) => {
          if (err && err.code !== "ENOENT") {
            console.error("[Download API] Error deleting temp file:", err);
          } else {
            console.log("[Download API] Temp file deleted successfully.");
          }
        });
      }
    };

    fileStream.on("close", cleanup);
    fileStream.on("error", cleanup);

    const webStream = Readable.toWeb(fileStream);

    return new Response(webStream, {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(title)}.${ext}`,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("[Download API] Error downloading video:", error.message || error);
    
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        console.log(`[Download API] Error recovery: deleting temp file ${tempFilePath}`);
        fs.unlinkSync(tempFilePath);
      } catch (err) {
        console.error("[Download API] Error deleting temp file on failure:", err);
      }
    }

    return new Response("Failed to download video", { status: 500 });
  }
}


