"""Serve repo for browser QA with production CSP and a marked test camera route.

Only the ?fixture route injects a public-image MediaStream. Never deployed.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
HEADERS = [line.strip().split(': ', 1) for line in (ROOT/'browser/_headers').read_text().splitlines()[1:] if ': ' in line]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        for name,value in HEADERS:self.send_header(name,value)
        super().end_headers()
    def do_GET(self):
        if self.path.startswith('/browser/index.html?fixture'):
            html=(ROOT/'browser/index.html').read_text().replace('<script type="module" src="./app.js">', '<script type="module" src="/tests/fixture-camera.js"></script><script type="module" src="./app.js">')
            data=html.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        else:super().do_GET()


if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8769),Handler).serve_forever()
