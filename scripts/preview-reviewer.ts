import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const types: Record<string, string> = {
  'index.html': 'text/html',
  'style.css': 'text/css',
  'app.js': 'text/javascript',
  'icon.svg': 'image/svg+xml',
};
createServer(async (req, res) => {
  const name = new URL(req.url || '/', 'http://localhost').pathname.slice(1) || 'index.html';
  if (!types[name]) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', types[name]);
  res.end(await readFile(join('reviewer-demo', name)));
}).listen(4174, '127.0.0.1', () => console.log('Interactive reviewer demo: http://127.0.0.1:4174'));
