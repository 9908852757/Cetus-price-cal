import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../api/calc.mjs';

try {
  const local = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of local.split(/\r?\n/)) { const match = /^([A-Z_]+)=(.*)$/.exec(line); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
} catch {}
const handler = createHandler();
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/calc') {
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 131072) { res.writeHead(413); return res.end('Request too large'); } chunks.push(chunk); }
      const request = new Request('http://' + req.headers.host + req.url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
      const response = await handler(request); res.writeHead(response.status, Object.fromEntries(response.headers)); return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(await readFile(new URL('../index.html', import.meta.url)));
  } catch { res.writeHead(500); res.end('Development server error'); }
});
server.listen(Number(process.env.PORT || 8767), '127.0.0.1', () => console.log('Calculator: http://127.0.0.1:' + (process.env.PORT || 8767)));
