#!/usr/bin/env python3
"""Simple HTTP server with correct MIME types for ES modules."""
import http.server
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map.update({
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
})

print("Serving CAD at http://localhost:8080 with correct MIME types")
http.server.HTTPServer(('', 8080), handler).serve_forever()
