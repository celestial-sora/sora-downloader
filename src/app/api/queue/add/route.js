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
    "yt-dlp-wrap",
    "bin",
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );
}

const YTDLP_PATH = getYtdlpPath();

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
    const { url, type, format, title, totalTracks, thumbnail, audioFormat, embedLyrics, lyricProvider } = body;

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
        runYoutubeDownload(taskId, url, format, title, audioFormat, embedLyrics);
      } else if (type === "youtube_playlist") {
        runYoutubePlaylistDownload(taskId, url, format, title, totalTracks || 10, audioFormat, embedLyrics);
      } else {
        runSpotifyDownload(taskId, url, totalTracks || 1, title, audioFormat, embedLyrics, lyricProvider);
      }
    }, 0);

    return Response.json({ taskId });
  } catch (error) {
    console.error("[Queue Add] Error creating task:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Background YouTube Download Worker
async function runYoutubeDownload(taskId, url, format, title, audioFormat, embedLyrics) {
  updateQueueItem(taskId, { status: "downloading", progress: 5 });
  addLog(taskId, "[YouTube System] Starting download...");

  const uniqueId = taskId.replace("task-", "");
  const cleanTitle = (title || "video").replace(/[<>:"/\\|?*]/g, "").trim();

  if (format !== "audio") {
    // Video download (MP4)
    const ext = "mp4";
    const tempFilePath = path.join(os.tmpdir(), `ytdl-${uniqueId}.${ext}`);
    const args = [
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--ffmpeg-location", FFMPEG_PATH,
      "--merge-output-format", "mp4",
      "-o", tempFilePath,
      "--no-playlist",
      url,
    ];

    const ffmpegDir = path.dirname(FFMPEG_PATH);
    const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
    const existingPath = process.env[pathEnvKey] || "";
    const customEnv = {
      ...process.env,
      [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    };

    addLog(taskId, `[YouTube System] Spawning yt-dlp process for video...`);
    const processSpawn = spawn(YTDLP_PATH, args, { env: customEnv });

    processSpawn.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        addLog(taskId, line);

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
          contentType: "video/mp4"
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
    return;
  }

  // Audio download with fallback loop depending on preferred format
  const allFormats = [
    { ext: "flac", ytFormat: "flac", contentType: "audio/flac", label: "FLAC" },
    { ext: "m4a", ytFormat: "m4a", contentType: "audio/m4a", label: "M4A" },
    { ext: "mp3", ytFormat: "mp3", contentType: "audio/mpeg", label: "MP3" }
  ];

  let audioFormats = [];
  if (audioFormat === "mp3") {
    audioFormats = [allFormats[2]];
  } else if (audioFormat === "m4a") {
    audioFormats = [allFormats[1], allFormats[2]];
  } else {
    audioFormats = allFormats;
  }

  for (let i = 0; i < audioFormats.length; i++) {
    const target = audioFormats[i];
    const tempFilePath = path.join(os.tmpdir(), `ytdl-${uniqueId}.${target.ext}`);
    
    addLog(taskId, `[YouTube System] Attempting audio download in ${target.label} format (Attempt ${i + 1}/${audioFormats.length})...`);
    
    const args = [
      "-x",
      "--audio-format", target.ytFormat,
      "--audio-quality", "0",
      "--embed-thumbnail",
      "--add-metadata",
      "--ffmpeg-location", FFMPEG_PATH,
      "-o", tempFilePath,
      "--no-playlist",
      url,
    ];

    const ffmpegDir = path.dirname(FFMPEG_PATH);
    const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
    const existingPath = process.env[pathEnvKey] || "";
    const customEnv = {
      ...process.env,
      [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    };

    try {
      const code = await new Promise((resolve, reject) => {
        const processSpawn = spawn(YTDLP_PATH, args, { env: customEnv });
        
        processSpawn.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            addLog(taskId, line);

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
          resolve(code);
        });

        processSpawn.on("error", (err) => {
          reject(err);
        });
      });

      if (code === 0 && fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
        updateQueueItem(taskId, {
          status: "completed",
          progress: 100,
          filePath: tempFilePath,
          fileName: `${cleanTitle}.${target.ext}`,
          contentType: target.contentType,
          downloadedFormat: target.label
        });
        addLog(taskId, `[YouTube System] Download completed! Successfully downloaded as ${target.label}.`);
        return; // Success!
      } else {
        throw new Error(`yt-dlp exited with code ${code}`);
      }
    } catch (err) {
      addLog(taskId, `[YouTube System] Failed to download as ${target.label}: ${err.message}`);
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
      
      if (i === audioFormats.length - 1) {
        const errorMsg = `All audio formats failed. Last error: ${err.message}`;
        updateQueueItem(taskId, { status: "failed", error: errorMsg });
        addLog(taskId, `[YouTube System] Download failed: ${errorMsg}`);
      } else {
        addLog(taskId, `[YouTube System] Retrying with fallback format...`);
      }
    }
  }
}

// Background YouTube Playlist Download Worker
async function runYoutubePlaylistDownload(taskId, url, format, title, totalTracks, audioFormat, embedLyrics) {
  updateQueueItem(taskId, { status: "downloading", progress: 5 });
  addLog(taskId, "[YouTube Playlist System] Starting download...");

  const uniqueId = taskId.replace("task-", "");
  const cleanTitle = (title || "youtube-playlist").replace(/[<>:"/\\|?*]/g, "").trim();

  if (format !== "audio") {
    // Video playlist download (MP4)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `ytdl-playlist-${uniqueId}`));
    const args = [
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--ffmpeg-location", FFMPEG_PATH,
      "--merge-output-format", "mp4",
      "-o", path.join(tempDir, "%(title)s.%(ext)s"),
      url,
    ];

    const ffmpegDir = path.dirname(FFMPEG_PATH);
    const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
    const existingPath = process.env[pathEnvKey] || "";
    const customEnv = {
      ...process.env,
      [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    };

    addLog(taskId, `[YouTube Playlist System] Spawning yt-dlp process for video playlist inside "${tempDir}"...`);
    const processSpawn = spawn(YTDLP_PATH, args, { env: customEnv });

    let downloadedCount = 0;

    processSpawn.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        addLog(taskId, line);

        if (line.includes("[download] 100% of")) {
          downloadedCount++;
          const pct = Math.min(Math.round((downloadedCount / (totalTracks || 10)) * 85), 85);
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
      addLog(taskId, `[YouTube Playlist System] yt-dlp exited with code ${code}`);
      if (code !== 0) {
        const errorMsg = `yt-dlp process exited with code ${code}`;
        updateQueueItem(taskId, { status: "failed", error: errorMsg });
        addLog(taskId, `[YouTube Playlist System] Download failed: ${errorMsg}`);
        cleanupFolder(tempDir);
        return;
      }

      try {
        const files = fs.readdirSync(tempDir).filter(f => f.endsWith(".mp4"));
        addLog(taskId, `[YouTube Playlist System] Found ${files.length} files downloaded.`);

        if (files.length === 0) {
          throw new Error("No files were downloaded");
        }

        if (files.length === 1) {
          const singleFile = files[0];
          const sourcePath = path.join(tempDir, singleFile);
          const destPath = path.join(os.tmpdir(), `ytdl-playlist-${uniqueId}.mp4`);
          fs.renameSync(sourcePath, destPath);
          
          updateQueueItem(taskId, {
            status: "completed",
            progress: 100,
            filePath: destPath,
            fileName: singleFile,
            contentType: "video/mp4"
          });
          addLog(taskId, "[YouTube Playlist System] Download completed! File is ready.");
          cleanupFolder(tempDir);
        } else {
          updateQueueItem(taskId, { status: "zipping", progress: 90 });
          addLog(taskId, "[YouTube Playlist System] Packaging files into ZIP file...");

          const zipPath = path.join(os.tmpdir(), `ytdl-playlist-${uniqueId}.zip`);
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
          addLog(taskId, "[YouTube Playlist System] Download completed and packaged! ZIP file is ready.");
          cleanupFolder(tempDir);
        }
      } catch (error) {
        updateQueueItem(taskId, { status: "failed", error: error.message });
        addLog(taskId, `[YouTube Playlist System] Post-processing error: ${error.message}`);
        cleanupFolder(tempDir);
      }
    });

    processSpawn.on("error", (err) => {
      updateQueueItem(taskId, { status: "failed", error: err.message });
      addLog(taskId, `[YouTube Playlist System] Process spawn error: ${err.message}`);
      cleanupFolder(tempDir);
    });
    return;
  }

  // Audio Playlist Download with fallback loop depending on preferred format
  const allFormats = [
    { ext: "flac", ytFormat: "flac", contentType: "audio/flac", label: "FLAC" },
    { ext: "m4a", ytFormat: "m4a", contentType: "audio/m4a", label: "M4A" },
    { ext: "mp3", ytFormat: "mp3", contentType: "audio/mpeg", label: "MP3" }
  ];

  let audioFormats = [];
  if (audioFormat === "mp3") {
    audioFormats = [allFormats[2]];
  } else if (audioFormat === "m4a") {
    audioFormats = [allFormats[1], allFormats[2]];
  } else {
    audioFormats = allFormats;
  }

  for (let i = 0; i < audioFormats.length; i++) {
    const target = audioFormats[i];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `ytdl-playlist-${uniqueId}-${target.ext}`));
    
    addLog(taskId, `[YouTube Playlist System] Attempting download in ${target.label} format (Attempt ${i + 1}/${audioFormats.length})...`);

    const args = [
      "-x",
      "--audio-format", target.ytFormat,
      "--audio-quality", "0",
      "--embed-thumbnail",
      "--add-metadata",
      "--ffmpeg-location", FFMPEG_PATH,
      "-o", path.join(tempDir, "%(title)s.%(ext)s"),
      url,
    ];

    const ffmpegDir = path.dirname(FFMPEG_PATH);
    const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
    const existingPath = process.env[pathEnvKey] || "";
    const customEnv = {
      ...process.env,
      [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
    };

    let downloadedCount = 0;

    try {
      const code = await new Promise((resolve, reject) => {
        const processSpawn = spawn(YTDLP_PATH, args, { env: customEnv });
        
        processSpawn.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            addLog(taskId, line);

            if (line.includes("[download] 100% of")) {
              downloadedCount++;
              const pct = Math.min(Math.round((downloadedCount / (totalTracks || 10)) * 85), 85);
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

        processSpawn.on("close", (code) => {
          resolve(code);
        });

        processSpawn.on("error", (err) => {
          reject(err);
        });
      });

      if (code !== 0) {
        throw new Error(`yt-dlp exited with code ${code}`);
      }

      const files = fs.readdirSync(tempDir).filter(f => f.endsWith(`.${target.ext}`));
      addLog(taskId, `[YouTube Playlist System] Found ${files.length} ${target.label} files downloaded.`);

      if (files.length === 0) {
        throw new Error(`No ${target.label} files were downloaded`);
      }

      if (files.length === 1) {
        const singleFile = files[0];
        const sourcePath = path.join(tempDir, singleFile);
        const destPath = path.join(os.tmpdir(), `ytdl-playlist-${uniqueId}.${target.ext}`);
        fs.renameSync(sourcePath, destPath);
        
        updateQueueItem(taskId, {
          status: "completed",
          progress: 100,
          filePath: destPath,
          fileName: singleFile,
          contentType: target.contentType,
          downloadedFormat: target.label
        });
        addLog(taskId, `[YouTube Playlist System] Download completed! Successfully downloaded single track as ${target.label}.`);
        cleanupFolder(tempDir);
        return; // Success!
      } else {
        updateQueueItem(taskId, { status: "zipping", progress: 90 });
        addLog(taskId, `[YouTube Playlist System] Packaging ${target.label} files into ZIP...`);

        const zipPath = path.join(os.tmpdir(), `ytdl-playlist-${uniqueId}.zip`);
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
          contentType: "application/zip",
          downloadedFormat: `${target.label} ZIP`
        });
        addLog(taskId, `[YouTube Playlist System] Download completed and packaged! ${target.label} ZIP file is ready.`);
        cleanupFolder(tempDir);
        return; // Success!
      }
    } catch (err) {
      addLog(taskId, `[YouTube Playlist System] Failed to download as ${target.label}: ${err.message}`);
      cleanupFolder(tempDir);
      
      if (i === audioFormats.length - 1) {
        const errorMsg = `All audio formats failed. Last error: ${err.message}`;
        updateQueueItem(taskId, { status: "failed", error: errorMsg });
        addLog(taskId, `[YouTube Playlist System] Download failed: ${errorMsg}`);
      } else {
        addLog(taskId, `[YouTube Playlist System] Retrying with fallback format...`);
      }
    }
  }
}

// Background Spotify Download Worker
async function runSpotifyDownload(taskId, url, totalTracks, title, audioFormat, embedLyrics, lyricProvider) {
  updateQueueItem(taskId, { status: "downloading", progress: 5 });
  addLog(taskId, "[Spotify System] Starting download...");

  const uniqueId = taskId.replace("task-", "");
  const cleanTitle = (title || "spotify-download").replace(/[<>:"/\\|?*]/g, "").trim();

  const allFormats = [
    { ext: "flac", contentType: "audio/flac", label: "FLAC" },
    { ext: "m4a", contentType: "audio/m4a", label: "M4A" },
    { ext: "mp3", contentType: "audio/mpeg", label: "MP3" }
  ];

  let audioFormats = [];
  if (audioFormat === "mp3") {
    audioFormats = [allFormats[2]];
  } else if (audioFormat === "m4a") {
    audioFormats = [allFormats[1], allFormats[2]];
  } else {
    audioFormats = allFormats;
  }

  for (let i = 0; i < audioFormats.length; i++) {
    const target = audioFormats[i];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `spotdl-queue-${uniqueId}-${target.ext}`));
    
    addLog(taskId, `[Spotify System] Attempting download in ${target.label} format (Attempt ${i + 1}/${audioFormats.length})...`);

    let attemptWithCredentials = !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
    let success = false;

    while (true) {
      const args = [
        "download",
        url,
        "--ffmpeg", FFMPEG_PATH,
        "--format", target.ext,
      ];

      if (attemptWithCredentials) {
        args.push(
          "--client-id", process.env.SPOTIFY_CLIENT_ID,
          "--client-secret", process.env.SPOTIFY_CLIENT_SECRET,
          "--use-official-api"
        );
      }

      if (embedLyrics) {
        // Build lyrics provider sequence based on user preference
        const provider = lyricProvider || "auto";
        if (provider === "paxsenix_musixmatch") {
          args.push("--lyrics", "musixmatch", "synced", "genius", "azlyrics");
        } else if (
          provider === "lrclib" ||
          provider === "betterlyrics" ||
          provider === "simpmusic" ||
          provider === "unison"
        ) {
          // These are LRC-based and use synced (lrclib backend)
          args.push("--lyrics", "synced");
        } else if (provider === "paxsenix_netease" || provider === "kugou") {
          // These are Asian/Chinese sources and use synced (NetEase backend in syncedlyrics)
          args.push("--lyrics", "synced");
        } else if (provider === "paxsenix_apple") {
          // Apple Music usually maps to synced/genius
          args.push("--lyrics", "synced", "genius");
        } else if (provider === "paxsenix_spotify") {
          args.push("--lyrics", "synced", "genius");
        } else if (provider === "paxsenix_youtube") {
          args.push("--lyrics", "synced", "genius");
        } else {
          // "auto" or other default - Prioritize Musixmatch and synced
          args.push("--lyrics", "musixmatch", "synced", "genius", "azlyrics");
        }
      } else {
        args.push("--lyrics");
      }

      const ffmpegDir = path.dirname(FFMPEG_PATH);
      const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
      const existingPath = process.env[pathEnvKey] || "";
      const customEnv = {
        ...process.env,
        [pathEnvKey]: `${ffmpegDir}${path.delimiter}${existingPath}`,
        PYTHONIOENCODING: "utf-8"
      };

      let downloadedCount = 0;

      try {
        const code = await new Promise((resolve, reject) => {
          const processSpawn = spawn(SPOTDL_PATH, args, { cwd: tempDir, env: customEnv });
          
          processSpawn.stdout.on("data", (data) => {
            const lines = data.toString().split("\n");
            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line) continue;
              addLog(taskId, line);

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

          processSpawn.on("close", (code) => {
            resolve(code);
          });

          processSpawn.on("error", (err) => {
            reject(err);
          });
        });

        if (code === 0) {
          success = true;
          break; // Exit while loop - successfully downloaded
        } else {
          throw new Error(`spotdl exited with code ${code}`);
        }
      } catch (err) {
        addLog(taskId, `[Spotify System] Download error: ${err.message}`);
        if (attemptWithCredentials) {
          addLog(taskId, `[Spotify System] Download failed with custom credentials. Retrying WITHOUT credentials...`);
          attemptWithCredentials = false; // retry without credentials
          // Clear temp folder files to avoid corrupt state
          cleanupFolder(tempDir);
          fs.mkdirSync(tempDir, { recursive: true });
        } else {
          // Both options failed, exit while loop and fallback to next format
          cleanupFolder(tempDir);
          
          if (i === audioFormats.length - 1) {
            const errorMsg = `All audio formats failed. Last error: ${err.message}`;
            updateQueueItem(taskId, { status: "failed", error: errorMsg });
            addLog(taskId, `[Spotify System] Download failed: ${errorMsg}`);
          } else {
            addLog(taskId, `[Spotify System] Retrying with fallback format...`);
          }
          break;
        }
      }
    }

    if (success) {
      try {
        const files = fs.readdirSync(tempDir).filter(f => f.endsWith(`.${target.ext}`));
        addLog(taskId, `[Spotify System] Found ${files.length} ${target.label} files downloaded.`);

        if (files.length === 0) {
          throw new Error(`No ${target.label} files downloaded`);
        }

        if (files.length === 1) {
          const singleFile = files[0];
          const sourcePath = path.join(tempDir, singleFile);
          const destPath = path.join(os.tmpdir(), `spotify-${uniqueId}.${target.ext}`);
          fs.renameSync(sourcePath, destPath);
          
          updateQueueItem(taskId, {
            status: "completed",
            progress: 100,
            filePath: destPath,
            fileName: singleFile,
            contentType: target.contentType,
            downloadedFormat: target.label
          });
          addLog(taskId, `[Spotify System] Download completed! Successfully downloaded as ${target.label}.`);
          cleanupFolder(tempDir);
          return; // Success!
        } else {
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
            contentType: "application/zip",
            downloadedFormat: `${target.label} ZIP`
          });
          addLog(taskId, `[Spotify System] Download completed and packaged! ${target.label} ZIP file is ready.`);
          cleanupFolder(tempDir);
          return; // Success!
        }
      } catch (error) {
        updateQueueItem(taskId, { status: "failed", error: error.message });
        addLog(taskId, `[Spotify System] Post-processing error: ${error.message}`);
        cleanupFolder(tempDir);
        return;
      }
    }
  }
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
