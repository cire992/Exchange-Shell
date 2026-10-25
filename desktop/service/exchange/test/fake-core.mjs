// A stand-in for `python -m exchange serve --exit-with-stdin` in tests: the same ready line, token
// check and read routes, with canned data (FAKE_CORE_LIBRARY=1: the synthetic library in
// fake-library.mjs). FAKE_CORE_MODE changes its behaviour:
//   crash-once   exits with code 3 shortly after its first ready line (a marker file remembers)
//   no-ready     never prints the ready line
//   api2         announces API version 2
import http from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { choices, desk, detail, hasThumbnail, history, lexicons, list, listCollections, post, remove, sessionState, sidebar, suggestions } from './fake-library.mjs';

const token = process.env.EXCHANGE_SERVICE_TOKEN;
const mode = process.env.FAKE_CORE_MODE || '';
const library = process.env.FAKE_CORE_LIBRARY === '1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const environments = [{ id: 1, uid: 'env-1', name: 'Daz Studio', type_id: 'daz_studio', status: 'online', added_at: '2026-10-24', last_scanned_at: null, roots: [] },
  { id: 2, uid: 'env-2', name: 'Loose files', type_id: 'loose_files', status: 'online', added_at: '2026-10-24', last_scanned_at: null, roots: [] }];

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  // Like the core: only thumbnails may be cached.
  const send = (status, body, type = 'application/json') => { response.writeHead(status, { 'content-type': type, ...(type === 'application/json' ? {} : { 'cache-control': 'private, max-age=300' }) }); response.end(type === 'application/json' ? JSON.stringify(body) : body); };
  if (url.pathname === '/health') return send(200, { service: 'exchange', version: 'fake', api: 1, schema_version: 7 });
  if (request.headers.authorization !== `Bearer ${token}`) return send(401, { detail: 'Missing or wrong service token' });
  if (library && request.method === 'POST' && url.pathname.startsWith('/api/v1/')) {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => { const { status, body } = post(url.pathname.slice('/api/v1/'.length), raw ? JSON.parse(raw) : {}); send(status, body); });
    return;
  }
  if (library && request.method === 'DELETE' && url.pathname.startsWith('/api/v1/')) { const { status, body } = remove(url.pathname.slice('/api/v1/'.length)); return send(status, body); }
  if (request.method !== 'GET') return send(405, { detail: 'Method not allowed' });
  if (library) {
    if (url.pathname === '/api/v1/session') return send(200, sessionState());
    if (url.pathname === '/api/v1/choices') return send(200, choices());
    if (url.pathname === '/api/v1/history') return send(200, history());
    if (url.pathname === '/api/v1/sidebar') return send(200, sidebar());
    if (url.pathname === '/api/v1/suggestions') return send(200, suggestions(url.searchParams));
    if (url.pathname === '/api/v1/lexicons') return send(200, lexicons());
    const pile = url.pathname.startsWith('/api/v1/desk/') && desk(url.pathname.slice('/api/v1/'.length), url.searchParams);
    if (pile) return send(pile.status, pile.body);
    if (url.pathname === '/api/v1/collections') return send(200, listCollections());
    if (url.pathname === '/api/v1/dossiers') { const { status, body } = list(url.searchParams); return send(status, body); }
    const thumb = /^\/api\/v1\/dossiers\/([^/]+)\/thumbnail$/.exec(url.pathname);
    if (thumb) return hasThumbnail(decodeURIComponent(thumb[1])) ? send(200, png, 'image/png') : send(404, { detail: 'No thumbnail' });
    const one = /^\/api\/v1\/dossiers\/([^/]+)$/.exec(url.pathname);
    if (one) { const found = detail(decodeURIComponent(one[1])); return found ? send(200, found) : send(404, { detail: 'No such asset' }); }
  }
  if (url.pathname === '/api/v1/sidebar') return send(200, { all: 235043, unidentified_dossiers: 0, unattached_files: 0, environments: [] });
  if (url.pathname === '/api/v1/environments') return send(200, environments);
  if (url.pathname === '/api/v1/dossiers') return send(200, { total: 0, offset: 0, items: [], echo: Object.fromEntries(url.searchParams) });
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
