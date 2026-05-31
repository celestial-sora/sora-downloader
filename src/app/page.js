"use client";

import { useState } from "react";
import { Search, Download, Video, Music, AlertCircle, Loader2 } from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!url) return;

    setIsLoading(true);
    setError("");
    setVideoInfo(null);

    try {
      // We will create this API route next
      const res = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch video information");
      }

      setVideoInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (format) => {
    if (!videoInfo || !url) return;
    
    // Redirect to the download API route
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&format=${format}`;
    window.location.href = downloadUrl;
  };

  return (
    <main className="container">
      <div className="glass-panel">
        <h1>Sora Downloader</h1>
        <p className="subtitle">ดาวน์โหลดวิดีโอ YouTube ในคุณภาพสูงสุดแบบไม่มีโฆษณากวนใจ</p>

        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              className="search-input"
              placeholder="วางลิงก์ YouTube ที่นี่... (เช่น https://www.youtube.com/watch?v=...)"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
                setVideoInfo(null);
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

        {videoInfo && !isLoading && (
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
      </div>
    </main>
  );
}
