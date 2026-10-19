#!/usr/bin/env node
/* Tiny static file server for previewing a build: node tools/serve.js dist [port] */
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'dist'), port = +process.argv[3] || 8080;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));
