// Jobs, environments and change notices for the fake core (the core's 6g part 1 API), over the
// synthetic library in fake-library.mjs. Jobs advance on a timer (FAKE_JOB_STEP_MS, default 120 ms
// a step), so the UI sees progress, can stop them, and waits for them by version as against the
// real core. Detection reads the folder's subfolders: a name with "daz" is a Daz library, "mo2" an
// MO2 instance, anything else loose files. Change notices: write a JSON array of environment ids to
// changes.json in the fake core's folder and they are noticed (the file is then deleted).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { configure, environment, environments, registerRoot, rootOwner, scanned } from './fake-library.mjs';

const STEP_MS = Number(process.env.FAKE_JOB_STEP_MS) || 120;
const MAX_WAIT = 25;
const STOPPED = { scan: 'Stopped; everything finished before that is saved.', rescan: 'Stopped; everything finished before that is saved.',
  classify: 'Stopped; the classification was not saved.', detect: 'Stopped.' };
const types = [
  { id: 'daz_studio', name: 'Daz Studio', handler: 'daz', multi_root: true, fallback: false, ignore_globs: ['*.tmp'], variants: [] },
  { id: 'loose_files', name: 'Loose files', handler: 'folder', multi_root: false, fallback: true, ignore_globs: [], variants: [] },
  { id: 'skyrim_se', name: 'Skyrim Special Edition', handler: 'mo2', multi_root: false, fallback: false, ignore_globs: ['*.esp'], variants: [{ id: 'se', name: 'Special Edition' }] },
  { id: 'unreal_project', name: 'Unreal project', handler: 'unreal', multi_root: false, fallback: false, ignore_globs: [], variants: [] },
];
const found = path.join(process.cwd(), 'found', 'Personal Library');
mkdirSync(found, { recursive: true });

class Refused extends Error { constructor(status, message) { super(message); this.status = status; } }
const jobs = new Map();
export const excluded = []; // folders the wizard said never to index (GET test/excluded)
let ids = 0, version = 0;
const waiters = new Set();
const changed = () => { for (const wake of [...waiters]) wake(); };
const bump = job => { job.version++; version++; changed(); };
const view = (job, full = true) => ({ id: job.id, kind: job.kind, label: job.label, state: job.state, writes: job.writes, environments: job.environments,
  started_at: job.started_at, finished_at: job.finished_at, progress: job.progress, error: job.error, version: job.version,
  report: full && job.kind !== 'classify' ? job.out : null, result: full && job.kind === 'classify' ? job.out : null });

function start(kind, label, { writes, steps, finish, environments: envIds = [] }) {
  const running = [...jobs.values()].find(j => j.writes && j.state === 'running');
  if (writes && running) throw new Refused(409, `${running.label} is running; wait for it to finish, or stop it`);
  const job = { id: ++ids, kind, label, writes, environments: envIds, state: 'running', started_at: new Date().toISOString(), finished_at: null,
    progress: null, error: null, version: 0, out: null };
  let next = 0;
  job.timer = setInterval(() => {
    if (next < steps.length) { job.progress = steps[next++]; bump(job); return; }
    clearInterval(job.timer);
    job.out = finish();
    job.state = 'done'; job.finished_at = new Date().toISOString();
    bump(job);
  }, STEP_MS);
  jobs.set(job.id, job);
  bump(job);
  return job;
}

const progress = (phase, environment, step, done = 0, total = 0) => ({ phase, environment, step, done, total });
const typeOf = name => /daz/i.test(name) ? 'daz_studio' : /mo2/i.test(name) ? 'skyrim_se' : 'loose_files';
const typeName = id => types.find(t => t.id === id)?.name || id;

function folderOf(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !existsSync(value) || !statSync(value).isDirectory()) throw new Refused(400, `not a folder: ${value}`);
  return path.resolve(value);
}

// The environments a folder holds: its subfolders by name (or the folder itself).
function detect(folder) {
  const subfolders = readdirSync(folder, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(folder, e.name));
  const roots = subfolders.length ? subfolders : [folder];
  return roots.map(root => {
    const type_id = typeOf(path.basename(root));
    const owner = rootOwner(root);
    return { id: owner?.id ?? null, name: owner?.name ?? `${typeName(type_id)} (${path.basename(root)})`, type_id, enrichment: null,
      roots: [{ path: root, confidence: type_id === 'loose_files' ? 0.3 : 0.92, signals: [type_id === 'loose_files' ? 'fallback' : `signature ${type_id}`],
        variant: type_id === 'skyrim_se' ? 'se' : null, registered: !!owner, status: 'detected', files: 12 + root.length % 7 }] };
  });
}

const report = (folder, dryRun, envs) => ({ folder, dry_run: dryRun, environments: envs, links_skipped: [], excluded: [], errors: [], notes: [], cancelled: false });

function scanSteps(names) {
  return names.flatMap(name => [progress(1, name, 'discovery'), progress(1, name, 'discovery'), progress(2, name, 'identification'),
    progress(3, name, 'hashing', 0, 4), progress(3, name, 'hashing', 2, 4), progress(3, name, 'hashing', 4, 4), progress(3, name, 'thumbnails', 1, 2)]);
}

// The environments' report once scanned.
function scannedReport(envList) {
  return envList.map(env => {
    scanned(env.id);
    notices.delete(env.id);
    return { id: env.id, name: env.name, type_id: env.type_id, enrichment: null,
      roots: env.roots.map(r => ({ path: r.path, confidence: 0.9, signals: [], variant: null, registered: true, status: r.status === 'offline' ? 'offline' : 'scanned',
        files: 12, new: 3, changed: 0, unchanged: 9, gone: 0, offline_days: r.status === 'offline' ? 12 : null,
        identification: { containers: 1, products: 2, dossiers: 3, below_threshold: 0, unattached_files: 0, warnings: [] } })) };
  });
}

// Change notices ---------------------------------------------------------------------------------

const notices = new Set();
let noticeVersion = 0;
const trigger = path.join(process.cwd(), 'changes.json');
setInterval(() => {
  if (!existsSync(trigger)) return;
  try { for (const id of JSON.parse(readFileSync(trigger, 'utf8'))) notices.add(id); } catch { /* half written: next time */ return; }
  unlinkSync(trigger);
  noticeVersion++; changed();
}, 150).unref();
const changesView = () => ({ available: true, environments: [...notices].sort(), version: noticeVersion });
const clearNotices = () => { noticeVersion++; changed(); };

// Waiting by version: answer once `current()` differs from `since`, or after `wait` seconds.
function waitFor(params, current, answer, send) {
  const since = params.get('since'), wait = Math.min(MAX_WAIT, Number(params.get('wait')) || 0);
  if (since === null || String(current()) !== since || !wait) return send(200, answer());
  const done = () => { waiters.delete(check); clearTimeout(timer); send(200, answer()); };
  const check = () => { if (String(current()) !== since) done(); };
  const timer = setTimeout(done, wait * 1000);
  waiters.add(check);
}

export function getJobs(route, params, send) {
  if (route === 'jobs') {
    const list = () => ({ version, jobs: [...jobs.values()].sort((a, b) => (a.state !== 'running') - (b.state !== 'running') || b.id - a.id).map(j => view(j, false)) });
    return waitFor(params, () => version, list, send), true;
  }
  const one = /^jobs\/(\d+)$/.exec(route);
  if (one) {
    const job = jobs.get(Number(one[1]));
    if (!job) return send(404, { detail: `no job ${one[1]}` }), true;
    return waitFor(params, () => job.version, () => view(job), send), true;
  }
  if (route === 'changes') return waitFor(params, () => noticeVersion, changesView, send), true;
  if (route === 'environment-types') return send(200, types), true;
  if (route === 'environments') return send(200, environments()), true;
  if (route === 'environments/discover') {
    return send(200, [{ path: found, name: 'Personal Library', via: 'Daz Studio', type_id: 'daz_studio', confidence: 0.95, signals: ['data', 'runtime'], registered: false },
      { path: 'D:/Library', name: 'My Library', via: 'Daz Studio', type_id: 'daz_studio', confidence: 0.97, signals: [], registered: true },
      { path: 'C:/Games/Half-Life 2', name: 'Half-Life 2', via: 'Steam', type_id: null, confidence: 0, signals: [], registered: false }]), true;
  }
  if (route === 'environments/mo2-profiles') {
    const folder = params.get('folder') || '';
    return send(200, /mo2/i.test(folder) ? { profiles: ['Default', 'Survival'], selected: 'Default' } : { profiles: [], selected: null }), true;
  }
  const env = /^environments\/(\d+)$/.exec(route);
  if (env) { const found = environment(Number(env[1])); return (found ? send(200, found) : send(404, { detail: `no environment ${env[1]}` })), true; }
  return false;
}

const VISIBILITIES = ['personal', 'publishable'];

export function postJobs(route, body) {
  try {
    const writer = () => [...jobs.values()].find(j => j.writes && j.state === 'running');
    const refuseWhileWriting = () => { const running = writer(); if (running) throw new Refused(409, `${running.label} is running; wait for it to finish, or stop it`); };
    const stop = /^jobs\/(\d+)\/stop$/.exec(route);
    if (stop) {
      const job = jobs.get(Number(stop[1]));
      if (!job) throw new Refused(404, `no job ${stop[1]}`);
      if (job.state === 'running') {
        clearInterval(job.timer);
        job.state = 'stopped'; job.error = STOPPED[job.kind]; job.finished_at = new Date().toISOString();
        bump(job);
      }
      return { status: 200, body: view(job) };
    }
    if (route === 'jobs/detect') {
      const folder = folderOf(body.folder);
      const job = start('detect', `Detecting environments in ${folder}`, { writes: false, steps: [progress(1, folder, 'discovery')], finish: () => report(folder, true, detect(folder)) });
      return { status: 200, body: view(job) };
    }
    if (route === 'jobs/scan') {
      const folder = folderOf(body.folder);
      const found = detect(folder);
      const job = start('scan', `Scanning ${folder}`, { writes: true, steps: scanSteps(found.map(e => e.name)), finish: () => {
        const made = found.map(e => registerRoot(e.type_id, e.roots[0].path, e.name, {}));
        clearNotices();
        return report(folder, false, scannedReport([...new Set(made)]));
      } });
      return { status: 200, body: view(job) };
    }
    if (route === 'jobs/rescan' || route === 'jobs/classify') {
      const all = environments();
      const wanted = [...new Set(body.environments || [])];
      const missing = wanted.filter(id => !all.some(e => e.id === id));
      if (missing.length) throw new Refused(404, `no environment ${missing.join(', ')}`);
      const chosen = wanted.length ? all.filter(e => wanted.includes(e.id)) : all;
      if (route === 'jobs/classify') {
        const label = `Applying lexicon changes${body.regroup ? ' and regrouping Daz products' : ''}`;
        const job = start('classify', label, { writes: true, environments: wanted, steps: [progress(null, null, 'classify'), progress(null, null, 'classify')],
          finish: () => ({ classification: { dossiers: 5303, tagged: 4410, structural: 0, changed_confidence: 2 }, suggestions: { texture_link: 0, variant_group: 1, stale: 0 }, regrouped_roots: body.regroup ? 3 : 0 }) });
        return { status: 200, body: view(job) };
      }
      const label = `Rescanning ${wanted.length ? chosen.map(e => e.name).join(', ') : 'every environment'}`;
      const job = start('rescan', label, { writes: true, environments: wanted, steps: scanSteps(chosen.map(e => e.roots[0]?.path || e.name)),
        finish: () => { const out = report(null, false, scannedReport(chosen)); clearNotices(); return out; } });
      return { status: 200, body: view(job) };
    }
    if (route === 'environments/register') {
      refuseWhileWriting();
      const plans = body.environments || [];
      for (const plan of plans) {
        if (!types.some(t => t.id === plan.type_id)) throw new Refused(400, `unknown environment type '${plan.type_id}'`);
        if (!plan.roots?.length) throw new Refused(400, `${plan.name || plan.type_id} has no folders`);
        if (plan.config?.visibility && !VISIBILITIES.includes(plan.config.visibility)) throw new Refused(400, 'visibility must be one of personal, publishable');
        for (const root of plan.roots) folderOf(root.path);
      }
      const made = plans.map(plan => {
        const config = Object.fromEntries(Object.entries(plan.config || {}).filter(([, v]) => v !== null && v !== undefined));
        let env;
        for (const root of [...plan.roots].sort((a, b) => a.path.length - b.path.length)) env = registerRoot(plan.type_id, root.path, plan.name || `${typeName(plan.type_id)} (${path.basename(root.path)})`, config);
        return { id: env.id, name: env.name, type_id: env.type_id };
      });
      excluded.push(...(body.exclude || []));
      clearNotices();
      return { status: 200, body: { environments: made } };
    }
    const config = /^environments\/(\d+)\/config$/.exec(route);
    if (config) {
      refuseWhileWriting();
      if (body.visibility && !VISIBILITIES.includes(body.visibility)) throw new Refused(400, 'visibility must be one of personal, publishable');
      const unknown = Object.keys(body).filter(k => !['ignore', 'mo2_profile', 'visibility', 'endpoint'].includes(k));
      if (unknown.length) return { status: 422, body: { detail: [{ msg: `Extra inputs are not permitted: ${unknown.join(', ')}` }] } };
      const env = environment(Number(config[1]));
      if (!env) throw new Refused(404, `no environment ${config[1]}`);
      const profiles = env.layer_config.profiles;
      if (body.mo2_profile && profiles && !profiles.includes(body.mo2_profile)) throw new Refused(400, `no MO2 profile '${body.mo2_profile}'; known: ${profiles.join(', ')}`);
      return { status: 200, body: { user_config: configure(env.id, body) } };
    }
    return null;
  } catch (error) {
    if (error instanceof Refused) return { status: error.status, body: { detail: error.message } };
    throw error;
  }
}

