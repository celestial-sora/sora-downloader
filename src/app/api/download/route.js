import { execFile, spawn } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

const YTDLP_PATH = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const formatType = searchParams.get("format") || "video";

    if (!url) {
      return new Response("Invalid URL", { status: 400 });
    }

    // Get video title for filename
    const { stdout: infoOut } = await execFileAsync(YTDLP_PATH, [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url,
    ]);
    const info = JSON.parse(infoOut);
    const title = (info.title || "video").replace(/[<>:"/\\|?*]/g, "").trim();

    let args;
    let ext;
    let contentType;

    if (formatType === "audio") {
      args = [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", "-",
        "--no-playlist",
        "--no-warnings",
        url,
      ];
      ext = "mp3";
      contentType = "audio/mpeg";
    } else {
      args = [
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", "-",
        "--no-playlist",
        "--no-warnings",
        url,
      ];
      ext = "mp4";
      contentType = "video/mp4";
    }

    const ytdlpProcess = spawn(YTDLP_PATH, args);

    const webStream = new ReadableStream({
      start(controller) {
        ytdlpProcess.stdout.on("data", (chunk) => {
          controller.enqueue(chunk);
        });
        ytdlpProcess.stdout.on("end", () => {
          controller.close();
        });
        ytdlpProcess.stdout.on("error", (err) => {
          console.error("Stream error:", err);
          controller.error(err);
        });
        ytdlpProcess.stderr.on("data", (data) => {
          console.log("[yt-dlp]", data.toString().trim());
        });
      },
      cancel() {
        ytdlpProcess.kill();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(title)}.${ext}`,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Error downloading video:", error.message || error);
    return new Response("Failed to download video", { status: 500 });
  }
}
