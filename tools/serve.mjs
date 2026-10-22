// Zero-dependency static file server. CLI: node tools/serve.mjs [dir] [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.xml': 'application/xml',
  '.txt': 'text/plain',
};

export function serve(dir, port = 0) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    let path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(root)) return res.writeHead(403).end();
    try {
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(await readFile(join(root, 'NotFound.html')).catch(() => 'Not found'));
    }
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await serve(process.argv[2] || 'dist', Number(process.argv[3] || 8000));
  console.log(`Serving on http://127.0.0.1:${server.address().port}`);
}
