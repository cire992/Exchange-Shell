// Claims for the fake core (the core's R4 API): a few canned claims, one for each kind of turn and
// one closed, a file that can't be read, and change notices. POST test/claims/move stands in for a
// claim moving on its own (a job ending, a hand edit).
import { changed, waitFor } from './fake-jobs.mjs';

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

const row = ({ notes, requisitions, ...rest }) => rest;
const refused = (status, detail) => ({ status, body: { detail } });

export function getClaims(route, params, send) {
  if (route === 'claims/changes') return waitFor(params, () => version, () => ({ available: true, version }), send), true;
  if (route === 'claims') {
    const all = params.get('all') === 'true', turn = params.get('turn'), thing = params.get('thing');
    return send(200, { claims: claims.filter(c => (all || !c.closed) && (!turn || c.turn === turn) && (!thing || c.thing === thing)).map(row), problems }), true;
  }
  const one = /^claims\/([^/]+)$/.exec(route);
  if (one) {
    const found = claims.find(c => c.id === decodeURIComponent(one[1]));
    return (found ? send(200, found) : send(404, { detail: `no claim ${one[1]}` })), true;
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
