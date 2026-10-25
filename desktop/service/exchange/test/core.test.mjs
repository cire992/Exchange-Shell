// The shell starts the Exchange core's service and proxies it (Roadmap phase 6c). A fake core
// stands in for `python -m exchange serve`; no Python, library or account is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../../server.mjs';
import { ExchangeCore, serveCommand } from '../core.mjs';
import { sleep } from '../../util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const fakeCommand = (mode = '') => ({ core, dataDir }) => ({
  file: process.execPath, args: [path.join(here, 'fake-core.mjs')], cwd: core,
  env: { FAKE_CORE_MODE: mode, ...(dataDir ? { EXCHANGE_DATA_DIR: dataDir } : {}) },
});
async function until(check, what, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out waiting for ${what}`);
}

async function fixture(t, { mode = '', exchangeCore } = {}) {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'exchange-core-test-'));
  const core = path.join(repo, 'core'); await mkdir(core);
  await mkdir(path.join(repo, 'ui')); await writeFile(path.join(repo, 'ui', 'index.html'), '<html></html>');
  await mkdir(path.join(repo, '.mrmak')); await writeFile(path.join(repo, '.mrmak', 'settings.json'), JSON.stringify({ exchangeCore: exchangeCore === undefined ? core : exchangeCore }));
  const exchange = new ExchangeCore({ command: fakeCommand(mode) });
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), exchange, startExchange: true });
  t.after(() => service.close());
  const request = (route, { method = 'GET', data, headers = {} } = {}) => fetch(service.origin + route, {
    method, headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json', ...headers },
    body: data === undefined ? undefined : JSON.stringify(data) });
  return { repo, core, service, exchange, request };
}

test('the core starts with the shell and its API is proxied with its own token', async t => {
  const { service, exchange, request } = await fixture(t);
  await until(() => exchange.state.status === 'ready', 'the core to be ready');
  const status = await (await request('/api/exchange/status')).json();
  assert.equal(status.status, 'ready'); assert.equal(status.version, 'fake-0.1'); assert.equal(status.api, 1);
  assert.equal('url' in status || 'token' in status, false, 'the windows never see the core URL or token');

  const bootstrap = await (await request('/api/bootstrap')).json();
  assert.equal(bootstrap.exchange.status, 'ready');
  assert.match(bootstrap.exchangeImages, /^\/exchange-images\/[\w-]{43}$/);

  assert.equal((await (await request('/api/exchange/sidebar')).json()).all, 235043);
  assert.equal((await request('/api/exchange/environments')).status, 200);
  const page = await (await request('/api/exchange/dossiers?query=tag%3Afood&limit=5')).json();
  assert.deepEqual(page.echo, { query: 'tag:food', limit: '5' });
  assert.equal((await request('/api/exchange/dossiers/missing')).status, 404);
  assert.equal((await request('/api/exchange/sidebar', { headers: { Authorization: '' } })).status, 401, 'the shell token is still required');
  assert.equal((await request('/api/exchange/sidebar', { method: 'POST', data: {} })).status, 405, 'read-only for now');

  // Thumbnails for <img>: the per-launch path stands in for the token.
  const image = await fetch(service.origin + `${bootstrap.exchangeImages}/helmet-1`);
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.ok((await image.arrayBuffer()).byteLength > 0);
  assert.notEqual((await fetch(service.origin + '/exchange-images/not-the-grant/helmet-1')).status, 200);
  assert.equal((await fetch(service.origin + `${bootstrap.exchangeImages}/..%2Fsidebar`)).status, 404);
});

test('closing the shell closes the core; a settings change restarts it', async t => {
  const { service, exchange, request, repo } = await fixture(t);
  await until(() => exchange.state.status === 'ready', 'the core to be ready');
  const first = exchange.child;
  const other = path.join(repo, 'other-core'); await mkdir(other);
  const saved = await (await request('/api/settings', { method: 'POST', data: { exchangeCore: other } })).json();
  assert.equal(saved.exchangeCore, other);
  await until(() => exchange.state.status === 'ready' && exchange.child && exchange.child !== first, 'a restart in the new folder');
  assert.equal(first.exitCode, 0, 'the old core shut down cleanly when its stdin closed');
  assert.equal((await request('/api/exchange/status').then(r => r.json())).core, other);
  assert.equal((await request('/api/settings', { method: 'POST', data: { exchangeCore: 'relative/path' } })).status, 400);
  const last = exchange.child;
  await service.close();
  await until(() => last.exitCode !== null, 'the core to exit with the shell');
  assert.equal(last.exitCode, 0);
});

test('a crash while running is restarted once; startup problems wait for Retry', async t => {
  const { exchange, request } = await fixture(t, { mode: 'crash-once' });
  const seen = []; exchange.on('change', view => seen.push(view.status));
  await until(() => seen.includes('error'), 'the crash to be reported');
  assert.match(exchange.state.message, /exit code 3[\s\S]*Traceback: something broke/);
  await until(() => exchange.state.status === 'ready', 'the automatic restart');
  assert.equal((await request('/api/exchange/sidebar')).status, 200);

  const api2 = await fixture(t, { mode: 'api2' });
  await until(() => api2.exchange.state.status === 'error', 'the API mismatch');
  // The refused core then exits on its own; that must not replace the reason.
  await until(() => !api2.exchange.child, 'the refused core to exit');
  assert.match(api2.exchange.state.message, /speaks API v1; the core offers v2/);
  assert.equal((await api2.request('/api/exchange/sidebar')).status, 503);
});

test('missing folders and environments are explained, and Retry starts it again', async t => {
  const off = await fixture(t, { exchangeCore: null });
  assert.equal(off.exchange.state.status, 'off');
  assert.equal((await off.request('/api/exchange/sidebar')).status, 503);
  const gone = await fixture(t, { exchangeCore: path.join(root, '.cache', 'no-such-core') });
  await until(() => gone.exchange.state.status === 'error', 'the missing folder');
  assert.match(gone.exchange.state.message, /does not exist/);

  // The real command needs the core's .venv; without it the message says how to make one.
  const real = new ExchangeCore({ command: serveCommand });
  const empty = await mkdtemp(path.join(root, '.cache', 'exchange-core-empty-'));
  await real.configure({ core: empty });
  assert.equal(real.state.status, 'error'); assert.match(real.state.message, /No Python environment[\s\S]*pip install -e "\.\[service\]"/);

  const slow = await fixture(t, { mode: 'no-ready' });
  await until(() => slow.exchange.state.status === 'starting', 'starting');
  await slow.exchange.stop();
  assert.equal(slow.exchange.state.status, 'stopped');
  const restarted = await (await slow.request('/api/exchange/restart', { method: 'POST', data: {} })).json();
  assert.equal(restarted.status, 'starting');
});
