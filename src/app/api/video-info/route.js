import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

// Path to yt-dlp binary bundled with youtube-dl-exec
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

    if (!url) {
      return Response.json(
        { error: "กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง" },
        { status: 400 }
      );
    }

    // Call yt-dlp --dump-json to get video metadata (no download)
    const { stdout } = await execFileAsync(YTDLP_PATH, [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url,
    ]);

    const info = JSON.parse(stdout);

    // Format duration from seconds to MM:SS
    const durationSec = parseInt(info.duration, 10) || 0;
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    const formattedDuration =
      durationSec > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : null;

    const thumbnail =
      info.thumbnail ||
      (info.thumbnails &&
        info.thumbnails[info.thumbnails.length - 1]?.url) ||
      "";

    return Response.json({
      title: info.title,
      thumbnail,
      channel: info.uploader || info.channel || "Unknown",
      duration: formattedDuration,
      url,
    });
  } catch (error) {
    console.error("Error fetching video info:", error.message || error);
    return Response.json(
      { error: "ไม่สามารถดึงข้อมูลวิดีโอได้ กรุณาตรวจสอบลิงก์อีกครั้ง" },
      { status: 500 }
    );
  }
}
