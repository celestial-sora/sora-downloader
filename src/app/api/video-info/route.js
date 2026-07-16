import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

function getYtdlpPath() {
  if (process.platform === "win32") {
    const pythonYtdlp = path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Programs",
      "Python",
      "Python311",
      "Scripts",
      "yt-dlp.exe"
    );
    if (fs.existsSync(pythonYtdlp)) {
      return pythonYtdlp;
    }
  }
  return path.join(
    process.cwd(),
    "node_modules",
    "youtube-dl-exec",
    "bin",
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );
}

const YTDLP_PATH = getYtdlpPath();

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

    const isPlaylist = url.includes("list=") && !url.includes("watch?v=");

    if (isPlaylist) {
      console.log(`[YouTube Info API] Fetching playlist info for URL: ${url}`);
      try {
        const { stdout } = await execFileAsync(YTDLP_PATH, [
          "--dump-single-json",
          "--flat-playlist",
          "--no-warnings",
          url,
        ]);
        const info = JSON.parse(stdout);
        const thumbnail =
          info.thumbnails && info.thumbnails.length > 0
            ? info.thumbnails[info.thumbnails.length - 1].url
            : "/default-art.png";
        
        return Response.json({
          title: info.title || "YouTube Playlist",
          thumbnail,
          channel: info.uploader || info.channel || "YouTube",
          tracksCount: info.entries ? info.entries.length : 0,
          type: "youtube_playlist",
          url,
        });
      } catch (err) {
        console.warn("[YouTube Info API] Flat-playlist extraction failed, using fallback:", err.message);
        return Response.json({
          title: "YouTube Playlist",
          thumbnail: "/default-art.png",
          channel: "YouTube",
          tracksCount: 10,
          type: "youtube_playlist",
          url,
        });
      }
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
      type: "video",
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
