import sys
import json
import os
from spotdl.utils.spotify import SpotifyClient

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No URL provided"}))
        return

    url = sys.argv[1]
    try:
        client_id = os.environ.get("SPOTIFY_CLIENT_ID")
        client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
        SpotifyClient.init(client_id=client_id, client_secret=client_secret, user_auth=False)
        client = SpotifyClient()
        
        if "playlist" in url:
            playlist_info = client.playlist(url)
            tracks_info = client.playlist_items(url)
            
            title = playlist_info.get("name", "Playlist")
            artist = playlist_info.get("owner", {}).get("display_name", "Spotify")
            
            images = playlist_info.get("images", [])
            cover_url = images[0]["url"] if images else ""
            
            tracks = []
            items = tracks_info.get("items", []) if isinstance(tracks_info, dict) else tracks_info
            for item in items:
                track = item.get("track", {})
                if not track:
                    continue
                
                duration_ms = track.get("duration_ms", 0)
                minutes = duration_ms // 60000
                seconds = (duration_ms % 60000) // 1000
                duration_str = f"{minutes}:{seconds:02d}"
                
                tracks.append({
                    "title": track.get("name", ""),
                    "artist": ", ".join([a.get("name", "") for a in track.get("artists", [])]),
                    "duration": duration_str,
                    "url": track.get("external_urls", {}).get("spotify", ""),
                    "coverUrl": cover_url
                })
                
            result = {
                "title": title,
                "artist": artist,
                "thumbnail": cover_url,
                "type": "playlist",
                "tracksCount": len(tracks),
                "tracks": tracks,
                "url": url
            }
            
        elif "album" in url:
            album_info = client.album(url)
            tracks_info = client.album_tracks(url)
            
            title = album_info.get("name", "Album")
            artist = ", ".join([a.get("name", "") for a in album_info.get("artists", [])])
            
            images = album_info.get("images", [])
            cover_url = images[0]["url"] if images else ""
            
            tracks = []
            items = tracks_info.get("items", []) if isinstance(tracks_info, dict) else tracks_info
            for track in items:
                duration_ms = track.get("duration_ms", 0)
                minutes = duration_ms // 60000
                seconds = (duration_ms % 60000) // 1000
                duration_str = f"{minutes}:{seconds:02d}"
                
                tracks.append({
                    "title": track.get("name", ""),
                    "artist": ", ".join([a.get("name", "") for a in track.get("artists", [])]),
                    "duration": duration_str,
                    "url": track.get("external_urls", {}).get("spotify", ""),
                    "coverUrl": cover_url
                })
                
            result = {
                "title": title,
                "artist": artist,
                "thumbnail": cover_url,
                "type": "album",
                "tracksCount": len(tracks),
                "tracks": tracks,
                "url": url
            }
            
        else: # track
            track_info = client.track(url)
            
            title = track_info.get("name", "")
            artist = ", ".join([a.get("name", "") for a in track_info.get("artists", [])])
            
            album = track_info.get("album", {})
            images = album.get("images", [])
            cover_url = images[0]["url"] if images else ""
            
            duration_ms = track_info.get("duration_ms", 0)
            minutes = duration_ms // 60000
            seconds = (duration_ms % 60000) // 1000
            duration_str = f"{minutes}:{seconds:02d}"
            
            tracks = [{
                "title": title,
                "artist": artist,
                "duration": duration_str,
                "url": url,
                "coverUrl": cover_url
            }]
            
            result = {
                "title": title,
                "artist": artist,
                "thumbnail": cover_url,
                "type": "track",
                "tracksCount": 1,
                "tracks": tracks,
                "url": url
            }
            
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
