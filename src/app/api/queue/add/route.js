import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { ZipArchive } from "archiver";
import { createQueueItem, updateQueueItem, addLog } from "@/app/utils/queue";

const FFMPEG_PATH = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
);

const YTDLP_PATH = path.join(
  process.cwd(),
  "node_modules",
  "yt-dlp-wrap",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);

function getSpotdlPath() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const defaultSpotdlPath = path.join(
    localAppData,
    "Programs",
    "Python",
    "Python311",
    "Scripts",
    "spotdl.exe"
  );
  if (fs.existsSync(defaultSpotdlPath)) {
    return defaultSpotdlPath;
  }
  const globalSpotdlPath = path.join(
    process.env.USERPROFILE || "C:\\Users\\hutao",
    "AppData",
    "Local",
    "Programs",
    "Python",
    "Python311",
    "Scripts",
    "spotdl.exe"
  );
  return globalSpotdlPath;
}

const SPOTDL_PATH = getSpotdlPath();

export async function POST(request) {
  try {
    const body = await request.json();
    const { url, type, format, title, totalTracks, thumbnail } = body;

    if (!url) {
      return Response.json({ error: "Invalid URL" }, { status: 400 });
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create the queue item in-memory
    createQueueItem(taskId, title || "Download Task", type, url, {
      thumbnail,
      totalTracks: totalTracks || 1,
      format: format || "audio"
    });

    // Start background processing
    setTimeout(() => {
      if (type === "youtube") {
        runYoutubeDownload(taskId, url, format, title);
      } else {
        runSpotifyDownload(taskId, url, totalTracks || 1, title);
      }
    }, 0);

    return Response.json({ taskId });
  } catch (error) {
    console.error("[Queue Add] Error creating task:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Background YouTube Download Worker
function runYoutubeDownload(taskId, url, format, title) {
  updateQueueItem(taskId, { status: "downloading", progress: 5 });
  addLog(taskId, "[YouTube System] Starting download...");

  const uniqueId = taskId.replace("task-", "");
  const ext = format === "audio" ? "mp3" : "mp4";
  const tempFilePath = path.join(os.tmpdir(), `ytdl-${uniqueId}.${ext}`);
  const cleanTitle = (title || "video").replace(/[<>:"/\\|?*]/g, "").trim();

  let args;
  if (format === "audio") {
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
    args = [
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--ffmpeg-location", FFMPEG_PATH,
      "--merge-output-format", "mp4",
      "-o", tempFilePath,
      "--no-playlist",
      url,
    ];
  }

  // Prepend FFMPEG dir to PATH
  const ffmpegDir = path.dirname(FFMPEG_PATH);
  const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
  const existingPath = process.env[pathEnvKey] || "";
  const customEnv = {
    ...process.env,
    [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
  };

  addLog(taskId, `[YouTube System] Spawning yt-dlp process...`);
  const processSpawn = spawn(YTDLP_PATH, args, { env: customEnv });

  processSpawn.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      addLog(taskId, line);

      // Parse progress: "[download]  12.5% of  15.00MiB at..."
      const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        const pct = parseFloat(match[1]);
        updateQueueItem(taskId, { progress: Math.round(pct) });
      }
    }
  });

  processSpawn.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line) addLog(taskId, `[stderr] ${line}`);
    }
  });

  processSpawn.on("close", (code) => {
    addLog(taskId, `[YouTube System] yt-dlp exited with code ${code}`);
    if (code === 0 && fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
      updateQueueItem(taskId, {
        status: "completed",
        progress: 100,
        filePath: tempFilePath,
        fileName: `${cleanTitle}.${ext}`,
        contentType: format === "audio" ? "audio/mpeg" : "video/mp4"
      });
      addLog(taskId, "[YouTube System] Download completed! File is ready.");
    } else {
      const errorMsg = `yt-dlp process exited with code ${code}`;
      updateQueueItem(taskId, { status: "failed", error: errorMsg });
      addLog(taskId, `[YouTube System] Download failed: ${errorMsg}`);
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  });

  processSpawn.on("error", (err) => {
    updateQueueItem(taskId, { status: "failed", error: err.message });
    addLog(taskId, `[YouTube System] Process spawn error: ${err.message}`);
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  });
}

// Background Spotify Download Worker
function runSpotifyDownload(taskId, url, totalTracks, title) {
  updateQueueItem(taskId, { status: "downloading", progress: 5 });
  addLog(taskId, "[Spotify System] Starting download...");

  const uniqueId = taskId.replace("task-", "");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `spotdl-queue-${uniqueId}`));
  const cleanTitle = (title || "spotify-download").replace(/[<>:"/\\|?*]/g, "").trim();

  const args = [
    "download",
    url,
    "--ffmpeg", FFMPEG_PATH,
    "--format", "mp3",
  ];

  const ffmpegDir = path.dirname(FFMPEG_PATH);
  const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
  const existingPath = process.env[pathEnvKey] || "";
  const customEnv = {
    ...process.env,
    [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    PYTHONIOENCODING: "utf-8"
  };

  addLog(taskId, `[Spotify System] Spawning spotdl process inside "${tempDir}"...`);
  const processSpawn = spawn(SPOTDL_PATH, args, { cwd: tempDir, env: customEnv });

  let downloadedCount = 0;

  processSpawn.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      addLog(taskId, line);

      // Count finished downloads to compute progress
      if (line.includes("Downloaded")) {
        downloadedCount++;
        const pct = Math.min(Math.round((downloadedCount / totalTracks) * 85), 85);
        updateQueueItem(taskId, { progress: pct });
      }
    }
  });

  processSpawn.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line) addLog(taskId, `[stderr] ${line}`);
    }
  });

  processSpawn.on("close", async (code) => {
    addLog(taskId, `[Spotify System] spotdl exited with code ${code}`);
    
    if (code !== 0) {
      const errorMsg = `spotdl process exited with code ${code}`;
      updateQueueItem(taskId, { status: "failed", error: errorMsg });
      addLog(taskId, `[Spotify System] Download failed: ${errorMsg}`);
      cleanupFolder(tempDir);
      return;
    }

    try {
      const files = fs.readdirSync(tempDir).filter(f => f.endsWith(".mp3"));
      addLog(taskId, `[Spotify System] Found ${files.length} MP3 files downloaded.`);

      if (files.length === 0) {
        throw new Error("No MP3 files downloaded");
      }

      if (files.length === 1) {
        // Single track - no need to zip
        const singleFile = files[0];
        const sourcePath = path.join(tempDir, singleFile);
        const destPath = path.join(os.tmpdir(), `spotify-${uniqueId}.mp3`);
        fs.renameSync(sourcePath, destPath);
        
        updateQueueItem(taskId, {
          status: "completed",
          progress: 100,
          filePath: destPath,
          fileName: singleFile,
          contentType: "audio/mpeg"
        });
        addLog(taskId, "[Spotify System] Download completed! File is ready.");
        cleanupFolder(tempDir);
      } else {
        // Multiple tracks - compress to ZIP
        updateQueueItem(taskId, { status: "zipping", progress: 90 });
        addLog(taskId, "[Spotify System] Packaging tracks into ZIP file...");

        const zipPath = path.join(os.tmpdir(), `spotify-${uniqueId}.zip`);
        const archive = new ZipArchive({ zlib: { level: 9 } });
        const outputStream = fs.createWriteStream(zipPath);

        archive.pipe(outputStream);
        archive.directory(tempDir, false);

        await new Promise((resolve, reject) => {
          outputStream.on("close", resolve);
          archive.on("error", reject);
          archive.finalize();
        });

        updateQueueItem(taskId, {
          status: "completed",
          progress: 100,
          filePath: zipPath,
          fileName: `${cleanTitle}.zip`,
          contentType: "application/zip"
        });
        addLog(taskId, "[Spotify System] Download completed and packaged! ZIP file is ready.");
        cleanupFolder(tempDir);
      }
    } catch (error) {
      updateQueueItem(taskId, { status: "failed", error: error.message });
      addLog(taskId, `[Spotify System] Post-processing error: ${error.message}`);
      cleanupFolder(tempDir);
    }
  });

  processSpawn.on("error", (err) => {
    updateQueueItem(taskId, { status: "failed", error: err.message });
    addLog(taskId, `[Spotify System] Process spawn error: ${err.message}`);
    cleanupFolder(tempDir);
  });
}

function cleanupFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
    } catch (err) {
      console.error(`Error deleting temp folder ${folderPath}:`, err);
    }
  }
}
