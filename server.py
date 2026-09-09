import static_ffmpeg
static_ffmpeg.add_paths()

import os
import json
import tempfile
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import yt_dlp

PORT = int(os.environ.get("PORT", 8000))

class Handler(BaseHTTPRequestHandler):
    def send_error(self, code, message=None):
        if self.path.startswith("/api/"):
            self.send_json({"success": False, "error": message or "API Error"}, code)
        else:
            super().send_error(code, message)

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        query_params = urllib.parse.parse_qs(parsed_path.query)

        if path == "/" or path == "/index.html":
            self.serve_file("index.html", "text/html")
        elif path == "/style.css":
            self.serve_file("style.css", "text/css")
        elif path == "/app.js":
            self.serve_file("app.js", "application/javascript")
        elif path.startswith("/api/search"):
            query = query_params.get("q", [""])[0]
            self.handle_search(query)
        elif path.startswith("/api/status"):
            # Mock or return status expected by your app
            self.send_json({
                "running": False,
                "current": None,
                "current_index": 0,
                "total": 0,
                "progress": 0,
                "status": "",
                "speed": "",
                "eta": "",
                "completed": [],
                "failed": [],
                "history": []
            })
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path

        if path in ["/api/download-single", "/api/download"]:
            self.handle_download()
        elif path == "/api/clear":
            self.send_json({"success": True, "message": "History cleared"})
        else:
            self.send_error(404, "Not Found")

    def serve_file(self, filename, content_type):
        if os.path.exists(filename):
            with open(filename, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_error(404, "File not found")

    def handle_search(self, query):
        if not query:
            self.send_json({"success": False, "error": "No query provided"}, 400)
            return

        try:
            options = {"quiet": True, "no_warnings": True, "extract_flat": True}
            results = []
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(f"ytsearch5:{query}", download=False)
                entries = info.get("entries", []) if info else []
                for entry in entries:
                    if entry:
                        results.append({
                            "title": entry.get("title"),
                            "duration": entry.get("duration"),
                            "channel": entry.get("uploader") or entry.get("channel") or "Unknown",
                            "url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id')}"
                        })
            self.send_json({"success": True, "results": results})
        except Exception as error:
            self.send_json({"success": False, "error": str(error)}, 500)

    def handle_download(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw_data = self.rfile.read(content_length) if content_length > 0 else b""
            
            song_list = []
            
            if raw_data:
                try:
                    data = json.loads(raw_data.decode("utf-8"))
                    if isinstance(data, dict):
                        # Handle the "songs" array sent by your frontend app.js
                        if "songs" in data and isinstance(data["songs"], list):
                            song_list = [str(s).strip() for s in data["songs"] if str(s).strip()]
                        
                        # Fallbacks for single keys if ever sent
                        if not song_list:
                            single = (data.get("song") or data.get("url") or data.get("link") or data.get("query") or "").strip()
                            if single:
                                song_list = [single]
                except json.JSONDecodeError:
                    pass

            if not song_list:
                self.send_json({"success": False, "error": "No songs provided in request payload."}, 400)
                return

            # Process the first song in the batch (or loop through them if you want backend queuing)
            song = song_list[0]

            temp_dir = tempfile.mkdtemp()
            output_template = os.path.join(temp_dir, "%(title)s.%(ext)s")

            options = {
                "format": "bestaudio/best",
                "default_search": "ytsearch1",
                "noplaylist": True,
                "outtmpl": output_template,
                "restrictfilenames": True,
                "quiet": True,
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192"
                }],
            }

            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(song, download=True)
                filename = ydl.prepare_filename(info)
                mp3_filename = os.path.splitext(filename)[0] + ".mp3"

            if os.path.exists(mp3_filename):
                # If your frontend expects a JSON confirmation message on post:
                self.send_json({"success": True, "message": f"Successfully downloaded: {os.path.basename(mp3_filename)}"})
            else:
                self.send_json({"success": False, "error": "Conversion failed to generate MP3 file"}, 500)

        except Exception as error:
            self.send_json({"success": False, "error": str(error)}, 500)

    def send_json(self, data, status=200):
        response = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

app = HTTPServer(("0.0.0.0", PORT), Handler)

if __name__ == "__main__":
    print(f"Server running on port {PORT}")
    app.serve_forever()
