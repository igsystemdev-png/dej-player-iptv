import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

try {
  const envFile = await readFile(resolve(root, '.env.local'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
} catch {
  // Local environment file is optional; Vercel variables are configured in the dashboard.
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Invalid URL');
    return;
  }

  if (pathname === '/api/config') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
    return json(res, 200, { whatsappNumber: (process.env.WHATSAPP_NUMBER || '558192878412').replace(/\D/g, '') });
  }

  if (pathname === '/api/chat') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        res.writeHead(413);
        res.end('Request too large');
        req.destroy();
      }
    });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(raw);
        const response = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          setHeader(name, value) { res.setHeader(name, value); return this; },
          json(data) {
            res.writeHead(this.statusCode, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(data));
          },
        };
        const { default: handler } = await import('./api/chat.js');
        await handler(req, response);
      } catch {
        if (!res.headersSent) json(res, 400, { error: 'Envie uma mensagem válida.' });
      }
    });
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const contents = await readFile(filePath);
    res.writeHead(200, { 'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(process.env.PORT || 4173, () => console.log(`Local site: http://localhost:${process.env.PORT || 4173}`));
