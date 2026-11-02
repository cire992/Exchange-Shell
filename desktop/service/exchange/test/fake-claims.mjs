// Claims for the fake core (the core's R4 API): a few canned claims, one for each kind of turn and
// one closed, a file that can't be read, and change notices. POST test/claims/move stands in for a
// claim moving on its own (a job ending, a hand edit). New claims: a static mesh has a path,
// anywhere, with no role or as a prop, once Convert mesh is ready; anything else has none. They walk
// as real requisitions of fake-requisitions.mjs, and their milestone and turn follow its state.
import { changed, jobEnded, waitFor } from './fake-jobs.mjs';
import { detail, environment } from './fake-library.mjs';
import { meshProcessReady, postRequisitions, requisitionNow } from './fake-requisitions.mjs';

const path = (status, processes = [], problem = null) => ({ status, route: status === 'ready' ? 'convert' : null, processes, process: null, problem, source_entry_id: null });
const claim = (id, thing, thing_name, place_name, milestone, turn, turn_line, extra = {}) => ({
  id, thing, thing_name, as: null, place: `env-${place_name === 'Daz Studio' ? 1 : 2}`, place_name, folder: null, milestone, created: '2026-10-30', closed: null, turn, turn_line,
  already_there: false, path: path('ready', ['convert_mesh']), notes: '', requisitions: [], ...extra });

const requisition = (id, state, message = null) => ({ uid: `req-${id}`, id, state, message });
const claims = [
  claim('2026-10-30-prop-0007', 'mesh-7', 'Prop 0007', 'Daz Studio', 'installed', 'you', 'Close it, or take it into play', { notes: 'For the cantina.\n', requisitions: [requisition(1, 'fulfilled')] }),
  claim('2026-10-30-prop-0014', 'mesh-14', 'Prop 0014', 'Daz Studio', 'acquired', 'exchange', '', { requisitions: [requisition(2, 'running')] }),
  claim('2026-10-30-prop-0020', 'mesh-20', 'Prop 0020', 'Loose files', 'acquired', 'you', 'Walk it'),
  claim('2026-10-30-outfit-004', 'product-4', 'Outfit 004', 'Daz Studio', 'acquired', 'build', 'No path yet: a process has to be built',
    { as: 'g8f_character', path: path('none', [], 'no process takes it to Daz Studio as g8f_character') }),
  claim('2026-10-29-dwarf-helmet', 'helmet-1', 'Dwarf Helmet', 'Loose files', 'installed', 'none', '', { closed: '2026-10-30', requisitions: [requisition(3, 'fulfilled'), { uid: 'req-gone', id: null, state: null, message: null }] }),
];
const problems = ['2026-10-28-broken.md: the front matter does not parse'];
let version = 0;
const bump = () => { version++; changed(); };

const row = ({ notes, requisitions, made, ...rest }) => rest;
jobEnded.add(() => bump());

// A new claim's path and turn, derived on every read as the core does.
function current(found) {
  if (!found.made) return found;
  const d = detail(found.thing), meshes = d.type_id === 'static_mesh' && (!found.as || found.as === 'prop');
  found.path = meshes && meshProcessReady() ? path('ready', ['convert_mesh'])
    : meshes ? { ...path('not_ready', ['convert_mesh'], 'Blender: not found'), process: 'convert_mesh' }
      : path('none', [], `no process takes it to ${found.place_name}${found.as ? ` as ${found.as}` : ''}`);
  const latest = found.requisitions.at(-1), now = latest && requisitionNow(latest.id);
  if (now) Object.assign(latest, now);
  const set = (milestone, turn, turn_line) => Object.assign(found, { milestone, turn, turn_line });
  if (found.closed) return found;
  if (found.path.status === 'none') set('acquired', 'build', 'No path yet: a process has to be built');
  else if (found.path.status === 'not_ready') set('acquired', 'you', 'Set up convert_mesh: fix Blender (not found)');
  else if (!now) set('acquired', 'you', 'Walk it');
  else if (now.state === 'fulfilled') set('installed', 'you', 'Close it, or take it into play');
  else if (now.state === 'held') set('acquired', 'you', `Release requisition ${latest.id}`);
  else if (now.state === 'needs_attention' || now.state === 'failed') set('acquired', 'you', now.message || `Requisition ${latest.id} failed`);
  else set('acquired', 'exchange', '');
  return found;
}
const placeId = found => Number(found.place.slice('env-'.length));
const planBody = (found, body) => ({ uids: [found.thing], environment: placeId(found), processes: null, options: body.options || {}, preset: body.preset || null,
  endpoint_folder: found.folder, on_collision: body.on_collision || 'ask', excluded: body.excluded || [] });
function refusal(found) {
  if (found.closed) return `claim ${found.id} is closed`;
  if (found.path.status !== 'ready') return found.turn_line;
  const state = found.requisitions.at(-1)?.state;
  if (state === 'queued' || state === 'running') return `requisition ${found.requisitions.at(-1).id} is ${state}; it is Exchange's turn`;
  if (state === 'held') return `Release requisition ${found.requisitions.at(-1).id}`;
  return null;
}
const refused = (status, detail) => ({ status, body: { detail } });
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function prepared({ uid, environment: place, as = null, folder = null, note = '' }) {
  const d = detail(uid), env = environment(place);
  if (!d) throw { status: 404, message: `no dossier '${uid}' in the library` };
  if (!env) throw { status: 404, message: `no environment ${place} in the library` };
  if (folder?.includes('..')) throw { status: 400, message: `the folder ${folder} leaves ${env.name}: a relative folder must stay inside the place; give an absolute one to write elsewhere` };
  const meshes = d.type_id === 'static_mesh' && (!as || as === 'prop');
  let id = `2026-10-31-${slug(d.name)}`;
  for (let n = 2; claims.some(c => c.id === id); n++) id = `2026-10-31-${slug(d.name)}-${n}`;
  return current(claim(id, uid, d.name, env.name, 'acquired', 'you', '', { as, folder, place: `env-${env.id}`, made: true,
    already_there: !as && !folder && meshes && d.ledgers.some(l => l.environment.id === env.id), notes: note ? `${note}\n` : '' }));
}

export function getClaims(route, params, send) {
  if (route === 'claims/changes') return waitFor(params, () => version, () => ({ available: true, version }), send), true;
  if (route === 'claims') {
    const all = params.get('all') === 'true', turn = params.get('turn'), thing = params.get('thing');
    return send(200, { claims: claims.map(current).filter(c => (all || !c.closed) && (!turn || c.turn === turn) && (!thing || c.thing === thing)).map(row), problems }), true;
  }
  const one = /^claims\/([^/]+)$/.exec(route);
  if (one) {
    const found = claims.find(c => c.id === decodeURIComponent(one[1]));
    return (found ? send(200, current(found)) : send(404, { detail: `no claim ${one[1]}` })), true;
  }
  return false;
}

export function postClaims(route, body) {
  if (route === 'test/claims/move') {
    Object.assign(claims.find(c => c.id === '2026-10-30-prop-0014'), { milestone: 'installed', turn: 'you', turn_line: 'Close it, or take it into play',
      requisitions: [requisition(2, 'fulfilled')] });
    bump();
    return { status: 200, body: { version } };
  }
  if (route === 'claims/preview' || route === 'claims') {
    try {
      const made = prepared(body);
      if (route === 'claims') { claims.unshift(made); bump(); }
      return { status: 200, body: made };
    } catch (error) { return refused(error.status, error.message); }
  }
  const walking = /^claims\/([^/]+)\/(plan|walk)$/.exec(route);
  if (walking) {
    const found = claims.find(c => c.id === decodeURIComponent(walking[1]));
    if (!found) return refused(404, `no claim '${walking[1]}'`);
    const why = refusal(current(found));
    if (why) return refused(409, why);
    if (walking[2] === 'plan') return postRequisitions('requisitions/plan', planBody(found, body));
    const queued = postRequisitions('requisitions/queue', planBody(found, body));
    if (queued.status !== 200) return queued;
    const [id] = queued.body.ids, ran = body.run === false ? null : postRequisitions('jobs/requisitions', { ids: [id] });
    found.requisitions.push(requisition(id, 'queued'));
    bump();
    return { status: 200, body: { claim: current(found), requisition: found.requisitions.at(-1), job: ran?.status === 200 ? ran.body : null,
      problem: ran && ran.status !== 200 ? ran.body.detail : null } };
  }
  const close = /^claims\/([^/]+)\/close$/.exec(route);
  if (close) {
    const found = claims.find(c => c.id === decodeURIComponent(close[1]));
    if (!found) return refused(404, `no claim ${close[1]}`);
    if (found.closed) return refused(409, `claim ${found.id} is already closed (${found.closed})`);
    Object.assign(found, { closed: '2026-10-31', turn: 'none', turn_line: '', notes: `${found.notes}${body.reason ? `${body.reason}\n` : ''}` });
    bump();
    return { status: 200, body: found };
  }
  return null;
}
