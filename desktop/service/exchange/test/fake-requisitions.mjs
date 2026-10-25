// Requisitions, process packages, tools, presets and endpoints for the fake core (the core's 6g
// part 2 API), over the synthetic library (fake-library.mjs) and its jobs (fake-jobs.mjs).
//   Processes: Copy (built in, ready), Convert mesh (built in; needs a Blender path) and Stamp
//   images (installed from a folder whose name has "stamp", then trusted).
//   Static meshes convert (Convert mesh) into any environment; any asset copies within its own.
//   A requisition whose note option is "review" stops at a checkpoint (needs attention).
import { detail, environment, environments } from './fake-library.mjs';
import { Refused, refuseWhileWriting, start, view, whenStopped } from './fake-jobs.mjs';

const param = (id, type, default_, label, extra = {}) => ({ id, type, default: default_, label, help: '', choices: [], min: null, max: null, ...extra });
const PACKAGES = {
  copy_entry: { id: 'copy_entry', name: 'Copy to another container', version: '1.0', author: 'Exchange', description: 'Copies an asset as it is.',
    builtin: true, trusted: true, installed: true, input_types: [], input_tags: [], output_environment: 'same', output_dossier_type: '', parameters: [], tools: [] },
  convert_mesh: { id: 'convert_mesh', name: 'Convert mesh (Blender)', version: '1.2', author: 'Exchange', description: 'Converts a mesh with Blender.',
    builtin: true, trusted: true, installed: true, input_types: ['static_mesh'], input_tags: [], output_environment: 'any', output_dossier_type: 'static_mesh',
    tools: ['blender'], parameters: [param('format', 'choice', 'glb', 'Format', { choices: ['glb', 'obj', 'fbx'] }), param('scale', 'float', 1, 'Scale', { min: 0.01, max: 100 }),
      param('apply_modifiers', 'bool', true, 'Apply modifiers'), param('note', 'str', '', 'Note')] },
  stamp_images: { id: 'stamp_images', name: 'Stamp images', version: '0.1', author: 'Test', description: 'Stamps the textures.', builtin: false, trusted: false, installed: false,
    input_types: ['static_mesh'], input_tags: [], output_environment: 'same', output_dossier_type: 'static_mesh', tools: [], parameters: [param('size', 'int', 64, 'Size', { min: 1, max: 4096 })] },
};
const tools = {};
const presets = [{ name: 'Shipped OBJ', description: 'OBJ at full scale', environment: null, shipped: true, processes: ['convert_mesh'], options: { convert_mesh: { format: 'obj', scale: 1 } } }];
let lastUsed = {};
const requisitions = [];
let made = 0;

const ready = p => p.installed && p.trusted && p.tools.every(t => tools[t]);
function processView(p) {
  const prerequisites = p.tools.map(t => ({ id: t, label: t === 'blender' ? 'Blender' : t, ok: !!tools[t], detail: tools[t] || `not found; set it with: exchange tools set ${t} PATH`, tool: t }));
  return { id: p.id, name: p.name, version: p.version, author: p.author, description: p.description, builtin: p.builtin, trusted: p.trusted,
    state: !p.trusted ? 'not trusted' : ready(p) ? 'ready' : 'needs setup', path: `C:/Exchange/processes/${p.id}`, input_types: p.input_types, input_tags: p.input_tags,
    output_environment: p.output_environment, output_dossier_type: p.output_dossier_type, prerequisites, problems: [],
    trust: [`${p.name} ${p.version} by ${p.author}`, `Runs: ${p.tools.join(', ') || 'Python only (no external apps)'}`, 'Writes to: the endpoint you choose'],
    parameters: p.parameters };
}

function endpointOf(envId, folder = null) {
  const env = environment(envId);
  if (!env) throw new Refused(404, `no environment ${envId}`);
  const online = env.roots.filter(r => r.status === 'online');
  if (!online.length) throw new Refused(409, `${env.name} has no online folder to write to`);
  const chosen = folder || (typeof env.user_config.endpoint === 'string' ? env.user_config.endpoint : null);
  const visibility = env.user_config.visibility || 'personal';
  if (chosen) return { folder: chosen, root: online[0].path, visibility, label: chosen };
  const label = env.type_id === 'daz_studio' ? 'Exchange Conversions content directory' : 'Exchange Conversions folder';
  return { folder: `${online[0].path}/Exchange Conversions`, root: online[0].path, visibility, label };
}

// The routes an asset has into an environment.
function routesOf(d, envId) {
  const home = d.ledgers[0]?.environment.id;
  const out = [];
  if (d.type_id === 'static_mesh' && ready(PACKAGES.convert_mesh)) out.push({ processes: ['convert_mesh'], route: 'convert' });
  if (d.type_id === 'static_mesh' && ready(PACKAGES.stamp_images) && home === envId) out.push({ processes: ['stamp_images'], route: 'convert' });
  if (home === envId) out.push({ processes: ['copy_entry'], route: 'copy' });
  return out;
}

function checkOption(p, id, value) {
  const spec = p.parameters.find(x => x.id === id);
  if (!spec) return null;
  if (spec.type === 'float' || spec.type === 'int') {
    const n = Number(value);
    if (!Number.isFinite(n)) return `${id} must be a number`;
    if ((spec.min !== null && n < spec.min) || (spec.max !== null && n > spec.max)) return `${id} must be between ${spec.min} and ${spec.max}`;
  }
  if (spec.type === 'choice' && !spec.choices.includes(value)) return `${id} must be one of ${spec.choices.join(', ')}`;
  return null;
}

function planOf(body) {
  if (!environment(body.environment)) throw new Refused(404, `no environment ${body.environment}`);
  let defaults = lastUsed;
  if (body.preset) {
    const preset = presets.find(p => p.name === body.preset);
    if (!preset) throw new Refused(404, `no preset '${body.preset}'`);
    defaults = preset.options;
  }
  const endpoint = endpointOf(body.environment, body.endpoint_folder);
  const plans = [], problems = [];
  for (const uid of body.uids) {
    const d = detail(uid);
    if (!d) { problems.push(`no dossier ${uid}`); continue; }
    const subjects = d.children.length ? d.children.map(c => detail(c.uid)) : [d];
    const items = subjects.map(s => {
      const options = routesOf(s, body.environment).filter(r => !body.processes || r.processes.join() === body.processes.join());
      if (!options.length) return { dossier_uid: s.uid, name: s.name, type_id: s.type_id, source_entry_id: null, source: '', route: 'none', processes: [], process_names: [],
        params: {}, include: false, problems: [body.processes ? `${body.processes.join(' → ')} does not take it there` : 'no ready process takes it there'] };
      const chosen = options[0], itemProblems = [], params = {};
      for (const id of chosen.processes) {
        const p = PACKAGES[id];
        params[id] = Object.fromEntries(p.parameters.map(x => [x.id, body.options?.[id]?.[x.id] ?? defaults[id]?.[x.id] ?? x.default]));
        for (const [key, value] of Object.entries(params[id])) { const why = checkOption(p, key, value); if (why) itemProblems.push(why); }
      }
      return { dossier_uid: s.uid, name: s.name, type_id: s.type_id, source_entry_id: 1, source: `${s.ledgers[0].environment.name} · ${s.ledgers[0].entries[0].container} (origin)`,
        route: chosen.route, processes: chosen.processes, process_names: chosen.processes.map(id => PACKAGES[id].name), params,
        include: !itemProblems.length && !(body.excluded || []).includes(s.uid), problems: itemProblems };
    });
    const warnings = items.some(i => i.include) ? [] : ['nothing here can be requisitioned to this environment with the processes that are ready'];
    plans.push({ name: body.uids.length === 1 && body.name ? body.name : d.name, environment_id: body.environment, on_collision: body.on_collision || 'ask', endpoint, warnings, items });
    problems.push(...warnings);
  }
  return { plans, problems: [...new Set(problems)] };
}

const row = r => { const env = environment(r.environment_id); return { ...r, environment: env?.name || '?', items: r.items_.filter(i => i.include).length, done: r.items_.filter(i => i.state === 'done').length }; };
const detailOf = r => ({ ...row(r), items: r.items_.map(i => ({ ...i, include: i.include ? 1 : 0 })), writes: r.writes });
const active = r => ['queued', 'held', 'running', 'needs_attention'].includes(r.state);
const ordered = () => [...requisitions.filter(active).sort((a, b) => a.position - b.position), ...requisitions.filter(r => !active(r)).sort((a, b) => b.id - a.id)];
const find = id => { const r = requisitions.find(x => x.id === Number(id)); if (!r) throw new Refused(404, `no requisition ${id}`); return r; };
const now = () => new Date().toISOString();

export function getRequisitions(route, params, send) {
  if (route === 'processes') return send(200, { processes: Object.values(PACKAGES).filter(p => p.installed).map(processView), problems: [] }), true;
  if (route === 'tools') return send(200, tools), true;
  if (route === 'presets') return send(200, [...presets].sort((a, b) => a.name.localeCompare(b.name))), true;
  if (route === 'presets/last-used') return send(200, lastUsed), true;
  if (route === 'endpoints') {
    return send(200, environments().map(env => {
      const config = environment(env.id).user_config;
      const row = { environment_id: env.id, environment: env.name, type_id: env.type_id, custom: !!config.endpoint, visibility: config.visibility || 'personal', folder: null, label: null, problem: null };
      try { const e = endpointOf(env.id); row.folder = e.folder; row.label = e.label; } catch (error) { row.problem = error.message; }
      return row;
    })), true;
  }
  if (route === 'requisitions') return send(200, ordered().map(row)), true;
  const one = /^requisitions\/(\d+)$/.exec(route);
  if (one) { try { return send(200, detailOf(find(one[1]))), true; } catch (error) { return send(error.status, { detail: error.message }), true; } }
  return false;
}

export function postRequisitions(route, body) {
  try {
    const trust = /^processes\/([^/]+)\/trust$/.exec(route);
    if (trust) {
      const p = PACKAGES[decodeURIComponent(trust[1])];
      if (!p?.installed) throw new Refused(404, `no process '${trust[1]}'`);
      p.trusted = true;
      return { status: 200, body: processView(p) };
    }
    if (route === 'processes/install') {
      if (!/stamp/i.test(body.folder || '')) throw new Refused(400, `not a folder: ${body.folder}`);
      Object.assign(PACKAGES.stamp_images, { installed: true, trusted: false });
      return { status: 200, body: processView(PACKAGES.stamp_images) };
    }
    if (route === 'tools') {
      if (body.path && !/\.exe$/i.test(body.path)) throw new Refused(400, `not a file: ${body.path}`);
      if (body.path) tools[body.tool] = body.path; else delete tools[body.tool];
      return { status: 200, body: tools };
    }
    if (route === 'presets') {
      if (!body.name?.trim()) throw new Refused(409, 'a preset needs a name');
      const preset = { name: body.name.trim(), description: body.description || '', environment: body.environment || null, shipped: false,
        processes: Object.keys(body.options), options: body.options };
      const at = presets.findIndex(p => p.name === preset.name && !p.shipped);
      if (at >= 0) presets[at] = preset; else presets.push(preset);
      return { status: 200, body: preset };
    }
    if (route === 'requisitions/routes') {
      const seen = new Map();
      for (const uid of body.uids) {
        const d = detail(uid);
        if (!d) continue;
        for (const s of d.children.length ? d.children.map(c => detail(c.uid)) : [d]) {
          for (const r of routesOf(s, body.environment)) {
            seen.set(r.processes.join(), { ...r, label: (r.route === 'copy' ? 'Copy: ' : '') + r.processes.map(id => PACKAGES[id].name).join(' → ') });
          }
        }
      }
      return { status: 200, body: [...seen.values()] };
    }
    if (route === 'requisitions/plan') {
      const { plans, problems } = planOf(body);
      const forms = [];
      for (const plan of plans) for (const item of plan.items) {
        if (!item.include) continue;
        for (const [id, values] of Object.entries(item.params)) {
          if (!forms.some(f => f.process === id)) forms.push({ process: id, name: PACKAGES[id].name, values, parameters: PACKAGES[id].parameters });
        }
      }
      return { status: 200, body: { plans, problems, forms, included: plans.reduce((n, p) => n + p.items.filter(i => i.include).length, 0) } };
    }
    if (route === 'requisitions/queue') {
      refuseWhileWriting();
      const plans = planOf(body).plans.filter(p => p.items.some(i => i.include));
      if (!plans.length) throw new Refused(409, 'nothing in this plan is included');
      const ids = plans.map(plan => {
        const id = ++made;
        requisitions.push({ id, uid: `req-${id}`, name: plan.name, state: 'queued', position: Math.max(0, ...requisitions.map(r => r.position)) + 1,
          environment_id: plan.environment_id, endpoint: plan.endpoint, on_collision: plan.on_collision, message: null, replaces: null,
          created_at: now(), started_at: null, finished_at: null, writes: [],
          items_: plan.items.map((i, n) => ({ id: id * 100 + n, dossier_uid: i.dossier_uid, name: i.name, source_entry_id: i.source_entry_id,
            processes: i.processes.map(p => ({ id: p, version: PACKAGES[p].version })), params: i.params, include: i.include,
            state: i.include ? 'queued' : 'skipped', message: null, outputs: [] })) });
        for (const item of plan.items) if (item.include) Object.assign(lastUsed, item.params);
        return id;
      });
      return { status: 200, body: { ids } };
    }
    if (route === 'requisitions/check-stale') { refuseWhileWriting(); return { status: 200, body: [] }; }
    const action = /^requisitions\/(\d+)\/(hold|move|resume|rebuild)$/.exec(route);
    if (action) {
      const r = find(action[1]);
      refuseWhileWriting();
      if (action[2] === 'hold') {
        if (body.held !== false && r.state !== 'queued') throw new Refused(409, `requisition ${r.id} is ${r.state}`);
        if (body.held === false && r.state !== 'held') throw new Refused(409, `requisition ${r.id} is not held`);
        r.state = body.held === false ? 'queued' : 'held';
      } else if (action[2] === 'move') {
        const waiting = requisitions.filter(x => ['queued', 'held'].includes(x.state) && x !== r).sort((a, b) => a.position - b.position);
        waiting.splice(Math.min(body.position - 1, waiting.length), 0, r);
        waiting.forEach((x, n) => { x.position = n + 1; });
      } else if (action[2] === 'resume') {
        if (!['needs_attention', 'failed', 'partially_fulfilled'].includes(r.state)) throw new Refused(409, `requisition ${r.id} is ${r.state}`);
        r.state = 'queued'; r.message = null; r.resumed = true;
        if (body.on_collision) r.on_collision = body.on_collision;
      } else {
        if (!['stale', 'fulfilled', 'partially_fulfilled'].includes(r.state)) throw new Refused(409, `requisition ${r.id} is ${r.state}; only fulfilled or stale ones are rebuilt`);
        const id = ++made;
        const copy = { ...structuredClone(r), id, uid: `req-${id}`, state: 'queued', replaces: r.id, writes: [], created_at: now(), started_at: null, finished_at: null,
          position: Math.max(0, ...requisitions.map(x => x.position)) + 1, on_collision: 'overwrite' };
        copy.items_.forEach(i => { if (i.include) { i.state = 'queued'; i.outputs = []; } });
        requisitions.push(copy);
        r.state = 'replaced'; r.message = `rebuilt as requisition ${id}`;
        return { status: 200, body: detailOf(copy) };
      }
      return { status: 200, body: detailOf(r) };
    }
    if (route === 'jobs/requisitions') {
      const only = body.ids?.length ? body.ids.map(find) : null;
      const runnable = (only || ordered()).filter(r => r.state === 'queued');
      const steps = runnable.flatMap(r => r.items_.filter(i => i.include).flatMap((i, n, all) =>
        ['source', 'convert', 'write'].map(step => ({ requisition: r.name, item: i.name, step, message: `${step} ${i.name}`, done: n, total: all.length }))));
      const job = start('requisitions', only ? `Running requisition${only.length === 1 ? '' : 's'} ${only.map(r => r.id).join(', ')}` : 'Running the queue', {
        writes: true, steps,
        finish: () => ({ ran: runnable.map(r => {
          const review = !r.resumed && r.items_.some(i => Object.values(i.params).some(v => v.note === 'review'));
          r.state = review ? 'needs_attention' : 'fulfilled';
          r.message = review ? 'Checkpoint: look at the output, then Resume' : null;
          r.started_at = r.started_at || now(); r.finished_at = review ? null : now();
          if (!review) {
            for (const i of r.items_.filter(x => x.include)) {
              i.state = 'done';
              i.outputs = [{ path: `${i.name}/${i.name}.glb`, root: r.endpoint.root }];
              r.writes.push({ id: r.writes.length + 1, item_id: i.id, path: `${r.endpoint.folder}/${i.name}/${i.name}.glb`, action: 'created', recycled_to: null, written_at: now(), removed_at: null });
            }
          }
          return { id: r.id, state: r.state, message: r.message };
        }) }),
      });
      for (const r of runnable) { r.state = 'running'; r.started_at = now(); }
      whenStopped(job, () => { for (const r of runnable) if (r.state === 'running') r.state = 'queued'; });
      return { status: 200, body: view(job) };
    }
    if (route === 'jobs/remove-output') {
      const r = find(body.requisition);
      if (r.state === 'running') throw new Refused(409, `requisition ${r.id} is running`);
      const job = start('remove', `Removing the output of requisition ${r.id}`, { writes: true, steps: [{ step: 'remove', message: 'moving files to the recycle folder' }],
        finish: () => { r.state = 'removed'; r.finished_at = now(); r.writes.forEach(w => { w.removed_at = now(); }); return { moved: r.writes.length }; } });
      return { status: 200, body: view(job) };
    }
    return null;
  } catch (error) {
    if (error instanceof Refused) return { status: error.status, body: { detail: error.message } };
    throw error;
  }
}

export function deleteRequisitions(route) {
  const preset = /^presets\/(.+)$/.exec(route);
  if (!preset) return null;
  const name = decodeURIComponent(preset[1]);
  const at = presets.findIndex(p => p.name === name);
  if (at < 0) return { status: 404, body: { detail: `no preset '${name}'` } };
  if (presets[at].shipped) return { status: 409, body: { detail: `'${name}' ships with a process package; it cannot be deleted` } };
  presets.splice(at, 1);
  return { status: 200, body: [...presets] };
}
