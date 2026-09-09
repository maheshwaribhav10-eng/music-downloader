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
        if self.path == "/" or self.path == "/index.html":
            self.serve_file("index.html", "text/html")
        elif self.path == "/style.css":
            self.serve_file("style.css", "text/css")
        elif self.path == "/app.js":
            self.serve_file("app.js", "application/javascript")
        elif self.path.startswith("/api/search"):
            self.handle_search()
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        if self.path == "/api/download-single":
            self.handle_download()
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

    def handle_search(self):
        query = ""
        if "?" in self.path:
            _, query_part = self.path.split("?", 1)
            for param in query_part.split("&"):
                if "=" in param:
                    key, val = param.split("=", 1)
                    if key == "q":
                        query = urllib.parse.unquote_plus(val)

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
            raw_data = self.rfile.read(content_length)
            data = json.loads(raw_data.decode("utf-8"))
            song = data.get("song", "").strip()

            if not song:
                self.send_json({"success": False, "error": "No song provided"}, 400)
                return

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
                with open(mp3_filename, "rb") as f:
                    mp3_data = f.read()
                
                safe_title = os.path.basename(mp3_filename)
                encoded_title = urllib.parse.quote(safe_title)

                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{encoded_title}")
                self.send_header("Content-Length", str(len(mp3_data)))
                self.end_headers()
                self.wfile.write(mp3_data)
            else:
                self.send_json({"success": False, "error": "Conversion failed"}, 500)

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
