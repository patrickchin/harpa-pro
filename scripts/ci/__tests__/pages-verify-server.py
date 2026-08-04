from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/_cf-pages-deployment.json":
            body = json.dumps(
                {
                    "commit": os.environ["TEST_PAGES_COMMIT"],
                    "branch": os.environ["TEST_PAGES_BRANCH"],
                },
                separators=(",", ":"),
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/":
            body = b"<title>Business activity \xe2\x80\x94 Harpa Pro Admin</title>"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/guides/getting-started":
            self.send_response(301)
            self.send_header("Location", "/docs/guides/getting-started")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args):
        return


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(sys.argv[1], "w", encoding="utf-8") as port_file:
    port_file.write(str(server.server_port))
server.serve_forever()
