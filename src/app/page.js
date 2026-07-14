"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Search, 
  Download, 
  Video, 
  Music, 
  AlertCircle, 
  Loader2, 
  Disc, 
  ListMusic, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  FileText 
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("youtube");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [spotifyInfo, setSpotifyInfo] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [activeLogsTaskId, setActiveLogsTaskId] = useState(null);
  
  // Track notifications sound
  const audioContextRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll queue status
  useEffect(() => {
    if (!mounted) return;
    
    let interval;
    const fetchQueue = async () => {
      try {
        const res = await fetch("/api/queue/list");
        const data = await res.json();
        if (res.ok) {
          setQueue(prevQueue => {
            // Check for newly completed items to trigger browser notification
            data.items.forEach(item => {
              const oldItem = prevQueue.find(q => q.id === item.id);
              if (oldItem && oldItem.status !== "completed" && item.status === "completed") {
                triggerDoneNotification(item);
              }
            });
            return data.items;
          });
        }
      } catch (err) {
        console.error("Error polling queue:", err);
      }
    };

    fetchQueue();
    interval = setInterval(fetchQueue, 1500);

    return () => clearInterval(interval);
  }, [mounted]);

  // Try to play notification sound
  const playNotificationSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Sweet 2-tone notification sound (Beep-Boop)
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);

      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain2.gain.setValueAtTime(0.15, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.5);
      }, 150);
    } catch (e) {
      console.warn("Could not play notification audio", e);
    }
  };

  const triggerDoneNotification = (item) => {
    playNotificationSound();
    
    // Attempt browser notification
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("ดาวน์โหลดเสร็จแล้ว! 🎉", {
          body: `ไฟล์ "${item.title}" พร้อมให้คลิกดาวน์โหลดแล้ว`,
          icon: item.thumbnail
        });
        return;
      } catch (e) {
        // Fallback
      }
    }
  };

  // Ask for notification permissions on user interaction
  const requestNotificationPermission = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!url) return;

    requestNotificationPermission();
    setIsLoading(true);
    setError("");
    setVideoInfo(null);
    setSpotifyInfo(null);

    try {
      if (activeTab === "youtube") {
        const res = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch video information");
        }

        setVideoInfo(data);
      } else {
        const res = await fetch(`/api/spotify-info?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch Spotify information");
        }

        setSpotifyInfo(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addToQueue = async (payload) => {
    requestNotificationPermission();
    setError("");
    try {
      const res = await fetch("/api/queue/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add task to download queue");
      }
      setActiveLogsTaskId(data.taskId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownload = (format) => {
    if (!videoInfo || !url) return;
    
    addToQueue({
      url,
      type: "youtube",
      format,
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      totalTracks: 1
    });
  };

  const handleSpotifyDownload = () => {
    if (!spotifyInfo || !url) return;

    addToQueue({
      url,
      type: "spotify",
      title: spotifyInfo.title,
      thumbnail: spotifyInfo.thumbnail,
      totalTracks: spotifyInfo.tracks ? spotifyInfo.tracks.length : 1
    });
  };

  if (!mounted) {
    return (
      <main className="container">
        <div className="glass-panel">
          <div className="loading-placeholder">
            <h1>Sora Downloader</h1>
            <p className="subtitle">ดาวน์โหลดวิดีโอ YouTube หรืออัลบั้ม Spotify ในคุณภาพสูงสุดแบบไม่มีโฆษณา</p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--text-muted)", marginTop: "1rem" }}>
              <Loader2 className="spinner" size={24} />
              <span>กำลังเตรียมหน้าต่างดาวน์โหลด...</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="glass-panel">
        <h1>Sora Downloader</h1>
        <p className="subtitle">ดาวน์โหลดวิดีโอ YouTube หรืออัลบั้ม Spotify ในคุณภาพสูงสุดแบบไม่มีโฆษณา</p>

        {/* Tab Switcher */}
        <div className="tabs">
          <button 
            type="button"
            className={`tab-btn ${activeTab === "youtube" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("youtube");
              setUrl("");
              setError("");
              setVideoInfo(null);
              setSpotifyInfo(null);
            }}
          >
            <Video size={18} />
            YouTube
          </button>
          
          <button 
            type="button"
            className={`tab-btn ${activeTab === "spotify" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("spotify");
              setUrl("");
              setError("");
              setVideoInfo(null);
              setSpotifyInfo(null);
            }}
          >
            <Music size={18} />
            Spotify
          </button>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              className="search-input"
              placeholder={
                activeTab === "spotify"
                  ? "วางลิงก์ Spotify ที่นี่... (เช่น https://open.spotify.com/album/...)"
                  : "วางลิงก์ YouTube ที่นี่... (เช่น https://www.youtube.com/watch?v=...)"
              }
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
                setVideoInfo(null);
                setSpotifyInfo(null);
              }}
              disabled={isLoading}
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isLoading || !url}
          >
            {isLoading ? (
              <>
                <Loader2 className="spinner" size={20} />
                กำลังค้นหา...
              </>
            ) : (
              <>
                <Search size={20} />
                ค้นหา
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="error-message">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* YouTube Result Card */}
        {activeTab === "youtube" && videoInfo && !isLoading && (
          <div className="result-card">
            <div className="video-thumbnail">
              <img src={videoInfo.thumbnail} alt={videoInfo.title} />
              {videoInfo.duration && (
                <span className="video-duration">{videoInfo.duration}</span>
              )}
            </div>
            
            <div className="video-info">
              <h2 className="video-title">{videoInfo.title}</h2>
              <div className="video-channel">
                <span>👤 {videoInfo.channel}</span>
              </div>
            </div>

            <div className="download-options">
              <button 
                className="btn btn-video"
                onClick={() => handleDownload('video')}
              >
                <Video size={20} />
                ดาวน์โหลดวิดีโอ (MP4)
              </button>
              
              <button 
                className="btn btn-audio"
                onClick={() => handleDownload('audio')}
              >
                <Music size={20} />
                ดาวน์โหลดเสียง (MP3)
              </button>
            </div>
          </div>
        )}

        {/* Spotify Result Card */}
        {activeTab === "spotify" && spotifyInfo && !isLoading && (
          <div className="result-card spotify-card">
            <div className="spotify-meta">
              <div className="spotify-album-art">
                <img src={spotifyInfo.thumbnail} alt={spotifyInfo.title} />
              </div>
              <div className="spotify-info-text">
                <h2 className="spotify-title">{spotifyInfo.title}</h2>
                <div className="spotify-artist">
                  <span>👤 {spotifyInfo.artist}</span>
                </div>
                <div className="spotify-tracks-count">
                  <span>🎵 {spotifyInfo.tracksCount} เพลง ({spotifyInfo.type === "track" ? "ซิงเกิล" : "อัลบั้ม/เพลย์ลิสต์"})</span>
                </div>
              </div>
            </div>

            {/* Scrollable Tracks List */}
            {spotifyInfo.tracks && spotifyInfo.tracks.length > 0 && (
              <div className="spotify-tracks-container">
                <h3>รายชื่อเพลง</h3>
                <div className="spotify-tracks-list">
                  {spotifyInfo.tracks.map((track, idx) => (
                    <div key={idx} className="spotify-track-item">
                      <span className="track-number">{idx + 1}</span>
                      <div className="track-details">
                        <span className="track-title">{track.title}</span>
                        <span className="track-artist">{track.artist}</span>
                      </div>
                      <span className="track-duration">{track.duration}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="spotify-download-section">
              <button 
                className="btn btn-spotify-download"
                onClick={handleSpotifyDownload}
              >
                <Download size={20} />
                {spotifyInfo.type === "track" 
                  ? "เพิ่มลงคิวดาวน์โหลด (MP3)" 
                  : "เพิ่มลงคิวดาวน์โหลดทั้งอัลบั้ม (ZIP)"
                }
              </button>
            </div>
          </div>
        )}

        {/* Active Download Queue Manager */}
        {queue.length > 0 && (
          <div className="queue-container">
            <div className="queue-header">
              <h2 className="queue-title">
                <ListMusic size={22} />
                คิวดาวน์โหลด
              </h2>
              <span className="queue-badge">{queue.length} รายการ</span>
            </div>
            
            <div className="queue-list">
              {queue.map((item) => (
                <div key={item.id} className="queue-card">
                  <div className="queue-card-main">
                    <div className="queue-thumbnail">
                      <img src={item.thumbnail || "/default-art.png"} alt={item.title} />
                      <div className="queue-type-badge">
                        {item.type === "spotify" ? (
                          <Music size={12} style={{ color: "var(--sf-green)" }} />
                        ) : (
                          <Video size={12} style={{ color: "var(--yt-red)" }} />
                        )}
                      </div>
                    </div>
                    
                    <div className="queue-info">
                      <h3 className="queue-item-title" title={item.title}>
                        {item.title}
                      </h3>
                      <div className="queue-item-meta">
                        <span className={`queue-status-badge status-${item.status}`}>
                          {item.status === "queued" && "รอดำเนินการ"}
                          {item.status === "downloading" && "กำลังดาวน์โหลด"}
                          {item.status === "zipping" && "กำลังบีบอัดไฟล์"}
                          {item.status === "completed" && "ดาวน์โหลดสำเร็จ"}
                          {item.status === "failed" && "ล้มเหลว"}
                        </span>
                        <span>•</span>
                        <span>{item.type === "spotify" ? "Spotify MP3" : item.format === "audio" ? "YouTube MP3" : "YouTube MP4"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {item.status !== "completed" && item.status !== "failed" && (
                    <div className="queue-progress-container">
                      <div className="queue-progress-bar-bg">
                        <div 
                          className="queue-progress-bar-fill" 
                          style={{ width: `${item.progress}%` }} 
                        />
                      </div>
                      <span className="queue-progress-percent">{item.progress}%</span>
                    </div>
                  )}

                  {/* Action Buttons: Download Completed & Show Logs */}
                  <div className="queue-actions-row">
                    <button 
                      type="button"
                      className="btn btn-queue-small btn-queue-logs"
                      onClick={() => setActiveLogsTaskId(activeLogsTaskId === item.id ? null : item.id)}
                    >
                      {activeLogsTaskId === item.id ? (
                        <>
                          ซ่อน Logs <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          แสดง Logs <ChevronDown size={14} />
                        </>
                      )}
                    </button>

                    {item.status === "completed" && (
                      <a 
                        href={`/api/queue/download?id=${item.id}`}
                        className="btn btn-queue-small btn-queue-download"
                      >
                        <Check size={14} /> ดาวน์โหลดไฟล์
                      </a>
                    )}
                  </div>

                  {/* Collapsible terminal log output box */}
                  {activeLogsTaskId === item.id && (
                    <div className="queue-logs-panel">
                      <pre>
                        {item.logs && item.logs.length > 0 
                          ? item.logs.join("\n") 
                          : "รอข้อความระบบ..."
                        }
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
