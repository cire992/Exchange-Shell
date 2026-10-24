// A stand-in for `python -m exchange serve --exit-with-stdin` in tests: the same ready line, token
// check and read routes, with canned data. FAKE_CORE_MODE changes its behaviour:
//   crash-once   exits with code 3 shortly after its first ready line (a marker file remembers)
//   no-ready     never prints the ready line
//   api2         announces API version 2
import http from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const token = process.env.EXCHANGE_SERVICE_TOKEN;
const mode = process.env.FAKE_CORE_MODE || '';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const environments = [{ id: 1, uid: 'env-1', name: 'Daz Studio', type_id: 'daz_studio', status: 'online', added_at: '2026-10-24', last_scanned_at: null, roots: [] },
  { id: 2, uid: 'env-2', name: 'Loose files', type_id: 'loose_files', status: 'online', added_at: '2026-10-24', last_scanned_at: null, roots: [] }];

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const send = (status, body, type = 'application/json') => { response.writeHead(status, { 'content-type': type, 'cache-control': 'private, max-age=300' }); response.end(type === 'application/json' ? JSON.stringify(body) : body); };
  if (url.pathname === '/health') return send(200, { service: 'exchange', version: 'fake', api: 1, schema_version: 7 });
  if (request.headers.authorization !== `Bearer ${token}`) return send(401, { detail: 'Missing or wrong service token' });
  if (request.method !== 'GET') return send(405, { detail: 'Method not allowed' });
  if (url.pathname === '/api/v1/sidebar') return send(200, { all: 235043, unidentified_dossiers: 0, unattached_files: 0, environments: [] });
  if (url.pathname === '/api/v1/environments') return send(200, environments);
  if (url.pathname === '/api/v1/dossiers') return send(200, { total: 1, offset: 0, items: [], echo: Object.fromEntries(url.searchParams) });
  if (url.pathname === '/api/v1/dossiers/helmet-1/thumbnail') return send(200, png, 'image/png');
  return send(404, { detail: 'Not found' });
});
server.listen(0, '127.0.0.1', () => {
  if (mode === 'no-ready') return;
  console.log('starting up');  // anything before the ready line is ignored
  console.log(JSON.stringify({ event: 'ready', url: `http://127.0.0.1:${server.address().port}`, api: mode === 'api2' ? 2 : 1, version: 'fake-0.1' }));
  const marker = path.join(process.cwd(), 'crashed-once');
  if (mode === 'crash-once' && !existsSync(marker)) { writeFileSync(marker, ''); setTimeout(() => { console.error('Traceback: something broke'); process.exit(3); }, 300); }
});
process.stdin.on('data', () => {});
process.stdin.on('end', () => server.close(() => process.exit(0)));
