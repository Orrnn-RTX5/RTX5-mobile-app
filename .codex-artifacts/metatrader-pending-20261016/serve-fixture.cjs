const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.RTX5_FIXTURE_PORT || 8768);
http.createServer((request, response) => {
  let requested;
  try { requested = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(root + path.sep) || !['.html', '.png', '.mp4'].includes(path.extname(file))) {
    response.writeHead(404); response.end(); return;
  }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4' }[path.extname(file)], 'Cache-Control': 'no-store' });
    response.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`Seeded visual fixture: http://127.0.0.1:${port}/`));
