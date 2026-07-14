import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { Readable, PassThrough } from "stream";
import { ZipArchive } from "archiver";

const FFMPEG_PATH = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
);

function getSpotdlPath() {
  const defaultPath = process.platform === "win32" ? "spotdl.exe" : "spotdl";
  if (process.platform === "win32") {
    const winPath = path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Programs",
      "Python",
      "Python311",
      "Scripts",
      "spotdl.exe"
    );
    if (fs.existsSync(winPath)) {
      return winPath;
    }
  }
  return defaultPath;
}

const SPOTDL_PATH = getSpotdlPath();

export async function GET(request) {
  let tempDir = null;
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const downloadName = searchParams.get("name") || "spotify-download";

    if (!url) {
      return new Response("Invalid URL", { status: 400 });
    }

    console.log(`[Spotify Download API] Starting download request for URL: ${url}`);

    // Create a unique temp folder for the download session
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `spotdl-download-${uniqueId}`));
    console.log(`[Spotify Download API] Target temp directory: "${tempDir}"`);

    // Prepare custom environment with ffmpeg directory prepended to PATH
    const ffmpegDir = path.dirname(FFMPEG_PATH);
    const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
    const existingPath = process.env[pathEnvKey] || "";
    const customEnv = {
      ...process.env,
      [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    };

    // Spawn spotdl to download as mp3 inside tempDir
    const args = [
      "download",
      url,
      "--ffmpeg", FFMPEG_PATH,
      "--format", "mp3",
    ];

    console.log(`[Spotify Download API] Spawning spotdl with args: ${args.join(" ")}`);
    const spotdlProcess = spawn(SPOTDL_PATH, args, { env: customEnv, cwd: tempDir });

    spotdlProcess.stdout.on("data", (data) => {
      console.log(`[spotdl stdout] ${data.toString().trim()}`);
    });

    spotdlProcess.stderr.on("data", (data) => {
      console.log(`[spotdl stderr] ${data.toString().trim()}`);
    });

    await new Promise((resolve, reject) => {
      spotdlProcess.on("close", (code) => {
        console.log(`[Spotify Download API] spotdl process closed with code: ${code}`);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`spotdl exited with code ${code}`));
        }
      });
      spotdlProcess.on("error", (err) => {
        console.error(`[Spotify Download API] spotdl spawn error:`, err);
        reject(err);
      });
    });

    // Read the temp directory to find downloaded files
    const files = fs.readdirSync(tempDir);
    const mp3Files = files.filter(file => file.endsWith(".mp3"));

    if (mp3Files.length === 0) {
      throw new Error("No files were downloaded by spotdl");
    }

    console.log(`[Spotify Download API] Found ${mp3Files.length} MP3 files in temp directory`);

    // If it's a single track, serve the file directly
    if (mp3Files.length === 1) {
      const singleFileName = mp3Files[0];
      const singleFilePath = path.join(tempDir, singleFileName);
      const fileStream = fs.createReadStream(singleFilePath);

      // Clean up the temp folder on finish
      const cleanup = () => {
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log(`[Spotify Download API] Cleaned up directory: ${tempDir}`);
          }
        } catch (err) {
          console.error("[Spotify Download API] Error cleaning up single track temp dir:", err);
        }
      };

      fileStream.on("close", cleanup);
      fileStream.on("error", cleanup);

      const webStream = Readable.toWeb(fileStream);

      return new Response(webStream, {
        headers: {
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(singleFileName)}`,
          "Content-Type": "audio/mpeg",
        },
      });
    }

    // If there are multiple tracks, compress them into a zip archive
    console.log(`[Spotify Download API] Zipping ${mp3Files.length} tracks...`);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Add directory content to the archive
    archive.directory(tempDir, false);

    // Finalize the archive
    archive.finalize();

    // Clean up temp directory on finish
    const cleanup = () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(`[Spotify Download API] Cleaned up directory: ${tempDir}`);
        }
      } catch (err) {
        console.error("[Spotify Download API] Error cleaning up zip temp dir:", err);
      }
    };

    passthrough.on("close", cleanup);
    passthrough.on("end", cleanup);
    passthrough.on("error", cleanup);

    const webStream = Readable.toWeb(passthrough);
    const sanitizedZipName = downloadName.replace(/[<>:"/\\|?*]/g, "").trim();

    return new Response(webStream, {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(sanitizedZipName)}.zip`,
        "Content-Type": "application/zip",
      },
    });

  } catch (error) {
    console.error("[Spotify Download API] Error downloading content:", error.message || error);
    
    // Clean up temp directory on failure
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[Spotify Download API] Error recovery: Deleted temp directory: ${tempDir}`);
      } catch (err) {
        console.error("[Spotify Download API] Error deleting temp folder on failure:", err);
      }
    }

    return new Response("Failed to download Spotify content", { status: 500 });
  }
}
