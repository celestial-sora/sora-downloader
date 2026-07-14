import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

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
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return Response.json(
        { error: "กรุณาใส่ลิงก์ Spotify ที่ถูกต้อง" },
        { status: 400 }
      );
    }

    console.log(`[Spotify Info API] Fetching info for url: ${url}`);

    // Call spotdl save to dump JSON metadata
    const { stdout } = await execFileAsync(SPOTDL_PATH, [
      "save",
      url,
      "--ffmpeg",
      FFMPEG_PATH,
      "--save-file",
      "-",
    ]);

    // Find the JSON block inside stdout (spotdl sometimes prints other status lines)
    const jsonStartIndex = stdout.indexOf("[");
    const jsonEndIndex = stdout.lastIndexOf("]") + 1;
    if (jsonStartIndex === -1 || jsonEndIndex === -1) {
      throw new Error("Could not find valid JSON metadata in spotdl output");
    }
    const jsonStr = stdout.substring(jsonStartIndex, jsonEndIndex);
    const songs = JSON.parse(jsonStr);

    if (!songs || songs.length === 0) {
      return Response.json(
        { error: "ไม่พบข้อมูลเพลงในลิงก์นี้" },
        { status: 404 }
      );
    }

    let title = "";
    let artist = "";
    let thumbnail = "";
    let type = "track";

    const firstSong = songs[0];
    if (firstSong.list_name) {
      title = firstSong.list_name;
      artist = firstSong.album_artist || firstSong.artist || "";
      thumbnail = firstSong.cover_url || "";
      type = firstSong.album_type || "album";
    } else {
      title = firstSong.name;
      artist = firstSong.artist || "";
      thumbnail = firstSong.cover_url || "";
      type = "track";
    }

    const tracks = songs.map((song) => {
      const durationSec = parseInt(song.duration, 10) || 0;
      const minutes = Math.floor(durationSec / 60);
      const seconds = durationSec % 60;
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, "0")}`;

      return {
        title: song.name,
        artist: song.artist || (song.artists && song.artists.join(", ")) || "",
        duration: formattedDuration,
        url: song.url,
        coverUrl: song.cover_url,
      };
    });

    return Response.json({
      title,
      artist,
      thumbnail,
      type,
      tracksCount: tracks.length,
      tracks,
      url,
    });
  } catch (error) {
    console.error("[Spotify Info API] Error fetching info:", error.message || error);
    return Response.json(
      { error: "ไม่สามารถดึงข้อมูล Spotify ได้ กรุณาตรวจสอบลิงก์อีกครั้งหรือลองใหม่ภายหลัง" },
      { status: 500 }
    );
  }
}
