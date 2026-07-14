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

    const PYTHON_PATH = process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Python311", "python.exe")
      : "python3";

    const SCRIPT_PATH = path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "spotify-info",
      "get_metadata.py"
    );

    console.log(`[Spotify Info API] Executing python script ${SCRIPT_PATH} for URL: ${url}`);

    const { stdout } = await execFileAsync(PYTHON_PATH, [
      SCRIPT_PATH,
      url
    ], {
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      }
    });

    const result = JSON.parse(stdout);

    if (result.error) {
      throw new Error(result.error);
    }

    return Response.json(result);
  } catch (error) {
    console.error("[Spotify Info API] Error fetching info:", error.message || error);
    return Response.json(
      { error: "ไม่สามารถดึงข้อมูล Spotify ได้ กรุณาตรวจสอบลิงก์อีกครั้งหรือลองใหม่ภายหลัง" },
      { status: 500 }
    );
  }
}
