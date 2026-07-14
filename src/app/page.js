"use client";

import { useState, useEffect } from "react";
import { Search, Download, Video, Music, AlertCircle, Loader2, Disc, ListMusic } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("youtube");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [spotifyInfo, setSpotifyInfo] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!url) return;

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

  const handleDownload = (format) => {
    if (!videoInfo || !url) return;
    
    setIsDownloading(true);
    // Redirect to the download API route
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&format=${format}`;
    window.location.href = downloadUrl;

    setTimeout(() => {
      setIsDownloading(false);
    }, 5000);
  };

  const handleSpotifyDownload = () => {
    if (!spotifyInfo || !url) return;

    setIsDownloading(true);
    // Redirect to the spotify download API route
    const downloadUrl = `/api/spotify-download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(spotifyInfo.title)}`;
    window.location.href = downloadUrl;

    setTimeout(() => {
      setIsDownloading(false);
    }, 8000);
  };

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
                mounted && activeTab === "spotify"
                  ? "วางลิงก์ Spotify ที่นี่... (เช่น https://open.spotify.com/album/... หรือ /track/...)"
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
            disabled={!mounted || isLoading || !url}
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
                disabled={isDownloading}
              >
                <Video size={20} />
                ดาวน์โหลดวิดีโอ (MP4)
              </button>
              
              <button 
                className="btn btn-audio"
                onClick={() => handleDownload('audio')}
                disabled={isDownloading}
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
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="spinner" size={20} />
                    กำลังเตรียมไฟล์ดาวน์โหลด (โปรดรอสักครู่)...
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    {spotifyInfo.type === "track" 
                      ? "ดาวน์โหลดเพลง (MP3)" 
                      : "ดาวน์โหลดอัลบั้ม / เพลย์ลิสต์ (ZIP)"
                    }
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
