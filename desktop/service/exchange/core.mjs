// The Exchange core's local service, started and proxied by this shell (Roadmap phase 6c).
//
// The core is the Python `exchange` package in its own repository. The shell runs its virtual
// environment's `python -m exchange serve --exit-with-stdin` with a per-launch token, waits for the
// one JSON "ready" line, then forwards requests to it. Closing stdin stops it, so it never outlives
// the shell. The core's token never reaches the windows: they talk to this service, which adds it.
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { secret } from '../util.mjs';

export const API_VERSION = 1;
const READY_TIMEOUT = 60000;
const STDERR_KEEP = 4000;

export function corePython(core) {
  return process.platform === 'win32' ? path.join(core, '.venv', 'Scripts', 'python.exe') : path.join(core, '.venv', 'bin', 'python');
}

// The command that starts the service; tests replace it with a fake core.
export function serveCommand({ core, dataDir }) {
  return {
    file: corePython(core),
    args: ['-m', 'exchange', 'serve', '--exit-with-stdin'],
    cwd: core,
    env: dataDir ? { EXCHANGE_DATA_DIR: dataDir } : {},
  };
}

export class ExchangeCore extends EventEmitter {
  constructor({ command = serveCommand } = {}) {
    super();
    this.command = command;
    this.config = { core: null, dataDir: null };
    this.state = { status: 'off', message: 'Set the Exchange core folder in Settings.' };
    this.child = null; this.url = null; this.token = null;
    this.restarts = 0; this.stopping = null;
  }

  // What the windows may see: never the URL or the token.
  get view() {
    const { status, message, version = null, api = null, core = null, dataDir = null } = this.state;
    return { status, message, version, api, core, dataDir };
  }

  set(state) { this.state = { core: this.config.core, dataDir: this.config.dataDir, ...state }; this.emit('change', this.view); }

  async configure({ core, dataDir }) {
    const next = { core: core || null, dataDir: dataDir || null };
    if (next.core === this.config.core && next.dataDir === this.config.dataDir && this.state.status !== 'off') return this.view;
    this.config = next; this.restarts = 0;
    await this.stop();
    if (!next.core) { this.set({ status: 'off', message: 'Set the Exchange core folder in Settings.' }); return this.view; }
    return this.start();
  }

  // Retry: stop, then start without waiting for the ready line; status events report the rest.
  async restart() {
    this.restarts = 0; await this.stop();
    this.start().catch(error => this.set({ status: 'error', message: error.message }));
    return this.view;
  }

  async start() {
    const { core, dataDir } = this.config;
    if (!core) { this.set({ status: 'off', message: 'Set the Exchange core folder in Settings.' }); return this.view; }
    if (!existsSync(core) || !statSync(core).isDirectory()) { this.set({ status: 'error', message: `The Exchange core folder ${core} does not exist.` }); return this.view; }
    const command = this.command({ core, dataDir });
    if (path.isAbsolute(command.file) && !existsSync(command.file)) {
      this.set({ status: 'error', message: `No Python environment in ${path.join(core, '.venv')}. In the core folder run: py -3.12 -m venv .venv, then .venv\\Scripts\\python -m pip install -e ".[service]"` });
      return this.view;
    }
    this.token = secret(); this.url = null;
    this.set({ status: 'starting', message: 'Starting the Exchange service…' });
    let stderr = '';
    const child = spawn(command.file, command.args, {
      cwd: command.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...command.env, EXCHANGE_SERVICE_TOKEN: this.token, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
    this.child = child;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-STDERR_KEEP); });
    const tail = () => stderr.trim().split(/\r?\n/).slice(-6).join('\n');
    return new Promise(resolve => {
      let settled = false;
      let refused = false; // closed by us for speaking another API: its exit must not replace why
      const settle = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(this.view); } };
      const timer = setTimeout(() => {
        if (settled) return;
        this.set({ status: 'error', message: `The Exchange service did not start within ${READY_TIMEOUT / 1000} s.${tail() ? `\n${tail()}` : ''}` });
        child.kill(); settle();
      }, READY_TIMEOUT);
      createInterface({ input: child.stdout }).on('line', line => {
        if (settled || this.child !== child) return;
        let ready;
        try { ready = JSON.parse(line); } catch { return; }
        if (ready?.event !== 'ready' || typeof ready.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(ready.url)) return;
        if (ready.api !== API_VERSION) {
          this.set({ status: 'error', message: `This shell speaks API v${API_VERSION}; the core offers v${ready.api}. Update the shell or the core.` });
          refused = true; child.stdin.end(); settle(); return;
        }
        this.url = ready.url;
        this.set({ status: 'ready', message: 'Connected', version: ready.version || null, api: ready.api });
        settle();
      });
      child.on('error', error => {
        if (this.child !== child) return;
        this.set({ status: 'error', message: `The Exchange service could not start: ${error.message}` }); settle();
      });
      child.on('exit', code => {
        if (this.child !== child) return;
        this.child = null; this.url = null;
        if (this.stopping || refused) return;
        const wasReady = this.state.status === 'ready';
        // A core from before Roadmap phase 6b has no serve command at all.
        const old = /invalid choice: 'serve'/.test(stderr);
        this.set({ status: 'error', message: old
          ? `This Exchange core has no "exchange serve" yet. Update ${this.config.core} to a version with Roadmap phase 6b, then Retry.`
          : `The Exchange service stopped (exit code ${code}).${tail() ? `\n${tail()}` : ''}` });
        settle();
        // One automatic restart after a crash while running; a failing start waits for Retry.
        if (wasReady && this.restarts < 1) { this.restarts++; setTimeout(() => { if (!this.child && this.state.status === 'error') this.start(); }, 2000); }
      });
    });
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    this.stopping = new Promise(resolve => {
      const timer = setTimeout(() => { child.kill(); }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.stdin.end();  // --exit-with-stdin: the service shuts down cleanly
    });
    await this.stopping;
    this.stopping = null; this.child = null; this.url = null;
    if (this.state.status === 'ready' || this.state.status === 'starting') this.set({ status: 'stopped', message: 'The Exchange service is stopped.' });
  }

  // Forward one request to the core's API, adding its token, and stream the answer back.
  proxy(request, response, target) {
    if (this.state.status !== 'ready' || !this.url) {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: this.state.message || 'The Exchange service is not running.', exchange: this.view }));
      return;
    }
    const url = new URL(target, this.url);
    const headers = { authorization: `Bearer ${this.token}`, host: url.host, accept: request.headers.accept || '*/*' };
    for (const name of ['content-type', 'content-length', 'if-none-match', 'if-modified-since']) if (request.headers[name]) headers[name] = request.headers[name];
    const upstream = http.request(url, { method: request.method, headers }, answer => {
      const passed = {};
      for (const name of ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified']) if (answer.headers[name]) passed[name] = answer.headers[name];
      response.writeHead(answer.statusCode || 502, passed);
      answer.pipe(response);
    });
    upstream.on('error', error => {
      if (!response.headersSent) { response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: `The Exchange service did not answer: ${error.message}` })); }
      else response.destroy(error);
    });
    request.pipe(upstream);
  }
}
