// A synthetic library for the fake core: the API's shapes (the core's docs/api/openapi.json) with
// deterministic data, large enough to exercise paging and the virtualized grid.
//   Daz Studio: 300 products of 10 items each (wearables and morphs), in two content directories
//   Loose files: 2,000 standalone static meshes, 40 of them Unidentified, every 7th with a thumbnail
//   The Unidentified desk: 5,010 unattached files in two roots (5,001 of them in one folder, more
//   than a product may take), 623 pending suggestions, and four lexicons
// Searches match names (case-insensitively); a query containing "((" is a 400, like a search that
// does not parse.
//
// Edits (the core's write API, 6e) change it in memory: each edit keeps a snapshot of the library
// before it, which Undo restores (and Redo the one after). Setting a field to "__busy__" answers
// like a library a scan is writing to (503).

const daz = { id: 1, name: 'Daz Studio', type_id: 'daz_studio', roots: [{ id: 1, path: 'D:/Library', status: 'online' }], user_config: { visibility: 'personal' }, layer_config: {} };
const loose = { id: 2, name: 'Loose files', type_id: 'loose_files', roots: [{ id: 2, path: 'E:/Sketchfab', status: 'online' }, { id: 3, path: 'F:/Old drive', status: 'offline' }], user_config: {}, layer_config: {} };
// Environments, with those registered through the API (fake-jobs.mjs) after them. Registering is
// not an edit: Undo does not take them away.
const envs = [daz, loose];
const containers = { 11: { id: 11, name: 'My Library', kind: 'content_directory', env: daz }, 12: { id: 12, name: 'Daz Connect', kind: 'content_directory', env: daz }, 21: { id: 21, name: 'Sketchfab', kind: 'folder', env: loose } };
const typeNames = { product: 'Product', daz_wearable: 'Daz wearable', daz_morph: 'Daz morph', static_mesh: 'Static mesh' };
const BUSY = 'The library is busy: a scan is writing to it. Try again when the scan finishes.';

function seed() {
  const dossiers = [];
  const own = d => ({ fields: {}, tagsAdd: [], tagsRemove: [], dismissed: false, alias: null, variants: [], history: [], ...d });
  for (let p = 0; p < 300; p++) {
    const container = p % 3 === 2 ? 12 : 11;
    const product = own({ uid: `product-${p}`, name: `Outfit ${String(p).padStart(3, '0')}`, type_id: 'product', confidence: 0.9, container, parent: null, acquired: `2026-0${1 + (p % 9)}-1${p % 10}T10:00:00` });
    dossiers.push(product);
    for (let c = 0; c < 10; c++) {
      dossiers.push(own({ uid: `product-${p}-item-${c}`, name: `Outfit ${String(p).padStart(3, '0')} ${c < 6 ? 'Piece' : 'Morph'} ${c}`, type_id: c < 6 ? 'daz_wearable' : 'daz_morph', confidence: 0.85, container, parent: product.uid, acquired: product.acquired, format: '.duf' }));
    }
  }
  for (let m = 0; m < 2000; m++) {
    const name = m === 0 ? 'Dwarf Helmet' : m % 50 === 1 ? `Barrel ${m}` : `Prop ${String(m).padStart(4, '0')}`;
    dossiers.push(own({ uid: m === 0 ? 'helmet-1' : `mesh-${m}`, name, type_id: 'static_mesh', confidence: m % 50 === 3 ? 0.3 : 0.8, container: 21, parent: null, acquired: '2026-10-20T09:00:00', format: '.glb', thumbnail: m % 7 === 0 }));
  }
  for (const d of dossiers) { d.scannedName = d.name; d.scannedType = d.type_id; d.scannedParent = d.parent; }
  // Files no asset holds (the Unidentified desk), by root: a small kit, a big dump (more than the
  // core's 5,000 a product may take) and a few strays.
  const files = [];
  const file = (root, rel_path) => files.push({ id: files.length + 1, root, rel_path, rel_key: rel_path.toLowerCase(), size: 1000 + files.length, linked: false });
  for (const name of ['Runtime/Textures/Crate Kit/crate_d.png', 'Runtime/Textures/Crate Kit/crate_n.png', 'Runtime/Textures/Crate Kit/Crate.obj',
    'Runtime/Textures/Rocks/rock01.png', 'Runtime/Textures/Rocks/rock02.png', 'data/Vendor/Lamp/lamp.dsf', 'ReadMe.txt']) file(1, name);
  for (const name of ['scraps/a.blend', 'scraps/b.blend']) file(2, name);
  for (let i = 1; i <= 5001; i++) file(2, `Big Dump/file${String(i).padStart(4, '0')}.png`);
  // Pending suggestions: a texture link, 620 variant groups (more than a page of 300) and two words.
  const suggestions = [{ id: 1, kind: 'texture_link', subject: 'mesh-51', confidence: 0.8, state: 'pending', payload: { files: [{ channel: 'Normal' }, { channel: 'Diffuse' }] } }];
  for (let m = 100; m < 720; m++) {
    suggestions.push({ id: suggestions.length + 1, kind: 'variant_group', subject: `mesh-${m}`, confidence: 0.7, state: 'pending',
      payload: { members: [`mesh-${m}`, `mesh-${m + 1000}`], variants: { [`mesh-${m}`]: 'Red', [`mesh-${m + 1000}`]: 'Blue' } } });
  }
  suggestions.push({ id: suggestions.length + 1, kind: 'lexicon_word', subject: 'mesh-3', confidence: 0.6, state: 'pending', payload: { lexicon: 'category', value: 'Food', word: 'cruller' } },
    { id: suggestions.length + 2, kind: 'lexicon_word', subject: null, confidence: 0.55, state: 'pending', payload: { lexicon: 'category', value: 'Weapon', word: 'halberd' } });
  const term = (value, words, patterns = [], found = []) => ({ value, words, patterns, found });
  const lexicons = [
    { id: 'authors', name: 'Known authors', kind: 'author', generated: true, exclude: ['Old Vendor'],
      terms: [term('Daz Originals', ['Daz Originals']), term('RiverSoft Art', [], [], ['RiverSoft Art']), term('Sketchfab artist', [], [], ['Sketchfab artist'])] },
    { id: 'category', name: 'Categories', kind: 'category', generated: false, exclude: [],
      terms: [term('Food', ['food', 'donut', 'bagel']), term('Weapon', ['weapon', 'sword', 'blade'], ['blade_*']), term('Clothing', ['clothing', 'outfit'])] },
    { id: 'ignore', name: 'Ignore', kind: 'ignore', generated: false, exclude: [], terms: [term('', ['final', 'copy', 'backup'])] },
    { id: 'variant', name: 'Variants', kind: 'variant', generated: false, exclude: [], terms: [term('Color', ['red', 'green', 'blue'])] },
  ];
  return {
    dossiers,
    collections: [{ uid: 'col-favorites', name: 'Favorites', smart: false, query: null, members: ['helmet-1', 'mesh-7', 'mesh-14', 'product-4'] },
      { uid: 'col-barrels', name: 'All barrels', smart: true, query: 'barrel', members: [] }],
    suggestions, files, ignored: [], lexicons,
    log: [], made: 0,
  };
}

const roots = [{ id: 1, path: 'D:/Library', environment_id: 1, environment: 'Daz Studio' }, { id: 2, path: 'E:/Sketchfab', environment_id: 2, environment: 'Loose files' }];
const MAX_FOLDER_FILES = 5000;

let lib = seed();
let byUid = new Map();
const index = () => { byUid = new Map(lib.dossiers.map(d => [d.uid, d])); };
index();

const byName = (a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;
const unidentified = d => d.confidence < 0.5;
const envOf = d => containers[d.container].env;
const live = d => !d.alias;
const childrenOf = d => lib.dossiers.filter(x => live(x) && x.parent === d.uid);
const scannedTags = d => d.type_id === 'static_mesh' ? ['prop'] : ['clothing'];
const tagsOf = d => [...scannedTags(d).filter(t => !d.tagsRemove.includes(t)), ...d.tagsAdd.filter(t => !scannedTags(d).includes(t))];

function brick(d) {
  return { uid: d.uid, name: d.name, type_id: d.type_id, type_name: typeNames[d.type_id], confidence: d.confidence, unidentified: unidentified(d),
    thumbnail_url: d.thumbnail ? `/api/v1/dossiers/${d.uid}/thumbnail` : null, format: d.format || null, environments: [envOf(d).name], entries: 1, children: childrenOf(d).length };
}

function matches(d, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const dismissed = words.includes('is:dismissed');
  if (d.dismissed !== dismissed) return false;
  return words.filter(w => w !== 'is:dismissed').every(word => d.name.toLowerCase().includes(word));
}

export function sidebar() {
  const shown = lib.dossiers.filter(d => live(d) && !d.dismissed);
  const environment = env => {
    const own = shown.filter(d => envOf(d).id === env.id);
    return { id: env.id, name: env.name, type_id: env.type_id, status: envStatus(env), count: own.length, roots: env.roots,
      containers: Object.values(containers).filter(c => c.env.id === env.id).map(c => ({ id: c.id, name: c.name, kind: c.kind, count: own.filter(d => d.container === c.id).length })),
      types: [...new Set(own.map(d => d.type_id))].sort().map(type_id => ({ type_id, name: typeNames[type_id], count: own.filter(d => d.type_id === type_id).length })) };
  };
  return { all: shown.length, unidentified_dossiers: shown.filter(unidentified).length, unattached_files: unattached(0).length, environments: envs.map(environment) };
}

const envStatus = env => env.roots.every(r => r.status === 'online') ? 'online' : env.roots.every(r => r.status === 'offline') ? 'offline' : 'partial';
const envView = env => ({ id: env.id, uid: `env-${env.id}`, name: env.name, type_id: env.type_id, status: envStatus(env), added_at: '2026-10-24',
  last_scanned_at: env.last_scanned_at || null, roots: env.roots });
export const environments = () => envs.map(envView);
export const environment = id => { const env = envs.find(e => e.id === id); return env && { ...envView(env), user_config: env.user_config, layer_config: env.layer_config }; };
export const rootOwner = folder => envs.find(e => e.roots.some(r => r.path.toLowerCase() === folder.toLowerCase()));

// A root joins an environment of its type when the type gathers every root (Daz), as the core's
// register_root does; otherwise it is a new environment.
export function registerRoot(type_id, folder, name, config) {
  const known = rootOwner(folder);
  if (known) { Object.assign(known.user_config, config); return known; }
  let env = type_id === 'daz_studio' && envs.find(e => e.type_id === 'daz_studio');
  if (!env) {
    env = { id: Math.max(...envs.map(e => e.id)) + 1, name, type_id, roots: [], user_config: {}, layer_config: type_id === 'skyrim_se' ? { profiles: ['Default', 'Survival'] } : {} };
    envs.push(env);
    containers[100 + env.id] = { id: 100 + env.id, name: name, kind: 'folder', env };
  }
  env.roots.push({ id: Math.max(...envs.flatMap(e => e.roots.map(r => r.id))) + 1, path: folder, status: 'online' });
  Object.assign(env.user_config, config);
  return env;
}

// What a scan of a registered environment finds: three meshes in its container.
export function scanned(id) {
  const env = envs.find(e => e.id === id);
  if (!env) return;
  env.last_scanned_at = new Date().toISOString();
  const container = Object.values(containers).find(c => c.env === env);
  if (!container || lib.dossiers.some(d => d.container === container.id)) return;
  for (let n = 1; n <= 3; n++) {
    const d = { uid: `scanned-${id}-${n}`, name: `${env.name} Crate ${n}`, type_id: 'static_mesh', confidence: 0.8, container: container.id, parent: null,
      acquired: env.last_scanned_at, format: '.obj', fields: {}, tagsAdd: [], tagsRemove: [], dismissed: false, alias: null, variants: [], history: [] };
    d.scannedName = d.name; d.scannedType = d.type_id; d.scannedParent = null;
    lib.dossiers.push(d);
  }
  index();
}

export function configure(id, given) {
  const env = envs.find(e => e.id === id);
  if (!env) return null;
  for (const [key, value] of Object.entries(given)) {
    if (value === null || (Array.isArray(value) && !value.length)) delete env.user_config[key]; else env.user_config[key] = value;
  }
  return env.user_config;
}

// The Unidentified desk ---------------------------------------------------------------------------

const folderKey = folder => String(folder || '').replace(/^\/+|\/+$/g, '').toLowerCase();
const ignoredFile = f => lib.ignored.some(i => i.environment === roots.find(r => r.id === f.root).environment_id && f.rel_key.startsWith(`${i.folder}/`));
// Unattached files under a folder of a root (all levels); root 0 is every root.
function unattached(root, folder = '') {
  const key = folderKey(folder);
  return lib.files.filter(f => !f.linked && (!root || f.root === root) && (!key || f.rel_key.startsWith(`${key}/`)) && !ignoredFile(f));
}

export function desk(route, params) {
  if (route === 'desk/roots') return { status: 200, body: roots };
  const root = Number(params.get('root')), folder = params.get('folder') || '';
  if (route === 'desk/files') {
    const limit = Number(params.get('limit')) || 500;
    return { status: 200, body: unattached(root, folder).slice(0, limit).map(({ id, rel_path, rel_key, size }) => ({ id, rel_path, rel_key, size })) };
  }
  if (route !== 'desk/folders') return null;
  // One level, as the core counts it: subfolders with their files (all levels), largest first.
  const key = folderKey(folder), depth = key ? key.split('/').length : 0;
  const counts = new Map();
  let direct = 0;
  for (const f of unattached(root, folder)) {
    const parts = f.rel_path.split('/');
    if (parts.length === depth + 1) { direct++; continue; }
    const k = parts[depth].toLowerCase(), had = counts.get(k);
    counts.set(k, { name: parts[depth], path: parts.slice(0, depth + 1).join('/'), count: (had?.count || 0) + 1 });
  }
  const folders = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1)).map(([, value]) => value);
  return { status: 200, body: { folders, files: direct, total: direct + folders.reduce((n, f) => n + f.count, 0) } };
}

function folderFiles(folder) {
  const files = unattached(folder.root, folder.path);
  if (files.length > MAX_FOLDER_FILES) throw new Refused(409, `${folder.path || 'This root'} holds more than 5,000 unattached files: that is a category, not an asset`);
  if (!files.length) throw new Refused(409, `${folder.path || 'This root'} has no unattached files`);
  return files;
}

export function suggestions(params) {
  const kind = params.get('kind'), offset = Number(params.get('offset')) || 0, limit = Number(params.get('limit')) || 300;
  const pending = lib.suggestions.filter(s => s.state === 'pending');
  const counts = {};
  for (const s of pending) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const shown = kind ? pending.filter(s => s.kind === kind) : pending;
  return { total: shown.length, counts, offset, items: shown.slice(offset, offset + limit).map(s => ({ ...s, subject_name: s.subject ? byUid.get(s.subject)?.name ?? null : null })) };
}

export const lexicons = () => lib.lexicons;

// The core's lexicons.set_word: a word under a value; removing a found word of a generated lexicon
// excludes it, and adding a word allows it again.
function setWord(lexicon, value, word, present) {
  const folded = word.toLowerCase();
  let term = lexicon.terms.find(t => t.value.toLowerCase() === value.toLowerCase());
  if (present) {
    if (!term) { term = { value, words: [], patterns: [], found: [] }; lexicon.terms.push(term); }
    if (!term.words.some(w => w.toLowerCase() === folded)) term.words.push(word);
    term.found = term.found.filter(w => w.toLowerCase() !== folded);
  } else if (term) {
    term.words = term.words.filter(w => w.toLowerCase() !== folded);
    term.found = term.found.filter(w => w.toLowerCase() !== folded);
    if (lexicon.generated && !lexicon.exclude.some(w => w.toLowerCase() === folded)) lexicon.exclude.push(word);
    if (!term.words.length && !term.patterns.length && !term.found.length) lexicon.terms = lexicon.terms.filter(t => t !== term);
  }
  if (present) lexicon.exclude = lexicon.exclude.filter(w => w.toLowerCase() !== folded);
}

export function listCollections() {
  return lib.collections.map(c => ({ uid: c.uid, name: c.name, smart: c.smart, query: c.query,
    count: c.smart ? lib.dossiers.filter(d => live(d) && matches(d, c.query)).length : c.members.filter(u => byUid.get(u) && live(byUid.get(u))).length }));
}

// The core's rule: searches, types, collections and Unidentified list all; otherwise grouping by
// product shows products and standalone assets, and by type sorts by type.
export function list(params) {
  const query = params.get('query') || '';
  if (query.includes('((')) return { status: 400, body: { detail: "Search: unbalanced parentheses at '(('" } };
  const type = params.get('type'), collection = params.get('collection'), parent = params.get('parent');
  const environment = Number(params.get('environment')) || null, container = Number(params.get('container')) || null;
  const wantUnidentified = params.get('unidentified') === 'true';
  const group = query || type || collection || wantUnidentified ? 'all' : params.get('group') || 'product';
  let items = lib.dossiers.filter(d => live(d) && matches(d, query));
  if (parent) items = items.filter(d => d.parent === parent);
  else if (group === 'product') items = items.filter(d => !d.parent);
  if (collection) {
    const c = lib.collections.find(item => item.uid === collection);
    items = !c ? [] : c.smart ? items.filter(d => matches(d, c.query)) : items.filter(d => c.members.includes(d.uid));
  }
  if (environment) items = items.filter(d => envOf(d).id === environment);
  if (container) items = items.filter(d => d.container === container);
  if (type) items = items.filter(d => d.type_id === type);
  if (wantUnidentified) items = items.filter(unidentified);
  items = [...items].sort(group === 'type' ? (a, b) => a.type_id.localeCompare(b.type_id) || byName(a, b) : byName);
  const offset = Number(params.get('offset')) || 0, limit = Math.min(1000, Number(params.get('limit')) || 200);
  return { status: 200, body: { total: items.length, offset, items: items.slice(offset, offset + limit).map(brick) } };
}

export function detail(uid) {
  const d = byUid.get(uid);
  if (!d) return null;
  const env = envOf(d), container = containers[d.container];
  const ref = x => ({ uid: x.uid, name: x.name, type_id: x.type_id });
  const parent = d.parent ? byUid.get(d.parent) : null;
  const scanned = d.scannedType === 'static_mesh'
    ? { mesh_triangles: { value: 1200 + d.scannedName.length, source: 'enrich:mesh' }, mesh_vertices: { value: 640, source: 'enrich:mesh' }, mesh_size: { value: 1.5, source: 'enrich:mesh' }, mesh_skinned: { value: false, source: 'enrich:mesh' }, author: { value: 'Sketchfab artist', source: 'scan' } }
    : d.scannedType === 'product' ? { author: { value: 'Daz Originals', source: 'scan' }, product_key: { value: `SKU${d.uid}`, source: 'scan' } } : {};
  const fields = { ...scanned, ...Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, { value: v, source: 'user' }])) };
  if (d.dismissed) fields.not_an_asset = { value: true, source: 'user' };
  const tagSources = [...scannedTags(d).map(tag => ({ tag, sources: ['folder'], confidence: 0.7, user: d.tagsRemove.includes(tag) ? 'remove' : d.tagsAdd.includes(tag) ? 'add' : null })),
    ...d.tagsAdd.filter(t => !scannedTags(d).includes(t)).map(tag => ({ tag, sources: [], confidence: 1, user: 'add' }))];
  return {
    uid: d.uid, name: d.name, name_overridden: d.name !== d.scannedName, type_id: d.type_id, type_name: typeNames[d.type_id], type_overridden: d.type_id !== d.scannedType,
    confidence: d.confidence, unidentified: unidentified(d), signals: [`rule ${d.scannedType}`], fields,
    parent_fields: parent ? { license: { value: 'Daz EULA', source: 'scan' } } : {},
    tags: tagsOf(d), tag_sources: tagSources,
    variant: null, thumbnail_url: d.thumbnail ? `/api/v1/dossiers/${d.uid}/thumbnail` : null,
    parent: parent ? ref(parent) : null, children: childrenOf(d).map(ref),
    ledgers: [{ environment: { id: env.id, name: env.name, type_id: env.type_id }, entries: [{ id: 1, container: container.name, container_kind: container.kind, status: 'origin', created_at: d.acquired, files: [
      { id: 1, rel_path: `${d.scannedName}${d.format || '.dsx'}`, path: `D:/Library/${d.scannedName}${d.format || '.dsx'}`, size: 48213, role: 'primary', state: 'present' }] }] }],
    dependencies: parent ? [{ reference: '/data/missing/texture.png', status: 'broken', target: null }, { reference: `/data/${parent.name}.dsf`, status: 'ok', target: ref(parent) }] : [],
    required_by: [], history: [{ id: null, at: d.acquired, action: 'entry_added', payload: { environment: env.name, container: container.name }, undoable: false }, ...d.history],
    variants: d.variants, aliases: lib.dossiers.filter(x => x.alias === d.uid).map(ref),
    suggestions: lib.suggestions.filter(s => s.subject === d.uid && s.state === 'pending').map(({ id, kind, payload }) => ({ id, kind, payload })),
    collections: lib.collections.filter(c => !c.smart && c.members.includes(d.uid)).map(c => ({ uid: c.uid, name: c.name })),
  };
}

export const hasThumbnail = uid => !!byUid.get(uid)?.thumbnail;

// Editing ----------------------------------------------------------------------------------------

const session = { undo: [], redo: [] }; // { label, refresh, before, after }
const sessionView = () => ({ undo: session.undo.at(-1)?.label ?? null, redo: session.redo.at(-1)?.label ?? null });
const snapshot = () => structuredClone(lib);
const restore = state => { lib = structuredClone(state); index(); };
class Refused extends Error { constructor(status, message) { super(message); this.status = status; } }
const one = uid => { const d = byUid.get(uid); if (!d || !live(d)) throw new Refused(404, `no dossier ${uid}`); return d; };
const assets = uids => uids.length === 1 ? 'an asset' : `${uids.length} assets`;

function record(action, label, refresh, uids, change) {
  const before = snapshot();
  const result = change() || {};
  const id = ++lib.made;
  const entry = { id, at: new Date().toISOString(), action, payload: result.payload || {}, undoable: true };
  for (const uid of uids) byUid.get(uid)?.history.push(entry);
  lib.log.push({ id, action, dossiers: uids, details: entry.payload, at: entry.at });
  session.undo.push({ label, refresh, before, after: snapshot() });
  session.redo = [];
  return { status: 200, body: { log_id: id, label, new_uid: result.new_uid ?? null, refresh, session: sessionView() } };
}

function step(from, to, back) {
  const last = from.pop();
  if (!last) return { status: 200, body: { label: null, refresh: 'none', session: sessionView() } };
  restore(back ? last.before : last.after);
  to.push(last);
  return { status: 200, body: { label: last.label, refresh: last.refresh, session: sessionView() } };
}

const edits = {
  'edits/fields': ({ uids, field, value }) => {
    if (value === '__busy__') throw new Refused(503, BUSY);
    if (field === 'name' && uids.length > 1) throw new Refused(409, 'names are edited one asset at a time');
    uids.forEach(one);
    const label = field === 'name' && value !== null ? 'rename' : `${value === null ? 'revert' : 'set'} ${field.replace('_id', '')} of ${assets(uids)}`;
    return record(value === null ? 'revert_field' : 'set_field', label, field === 'type_id' ? 'all' : 'detail', uids, () => {
      for (const uid of uids) {
        const d = byUid.get(uid);
        if (field === 'name') d.name = value ?? d.scannedName;
        else if (field === 'type_id') d.type_id = value ?? d.scannedType;
        else if (value === null) delete d.fields[field]; else d.fields[field] = value;
      }
      return { payload: { field, value } };
    });
  },
  'edits/tags': ({ uids, add = [], remove = [] }) => {
    if (!add.length && !remove.length) throw new Refused(409, 'nothing to tag');
    uids.forEach(one);
    return record('tag', `tag ${assets(uids)} ${[...add.map(t => `+${t}`), ...remove.map(t => `-${t}`)].join(' ')}`, 'detail', uids, () => {
      for (const uid of uids) {
        const d = byUid.get(uid);
        for (const t of add) { d.tagsRemove = d.tagsRemove.filter(x => x !== t); if (!d.tagsAdd.includes(t)) d.tagsAdd.push(t); }
        for (const t of remove) { d.tagsAdd = d.tagsAdd.filter(x => x !== t); if (scannedTags(d).includes(t) && !d.tagsRemove.includes(t)) d.tagsRemove.push(t); }
      }
      return { payload: { add, remove } };
    });
  },
  'edits/tags/revert': ({ uid, tag }) => {
    one(uid);
    return record('revert_tag', `revert tag ${tag}`, 'detail', [uid], () => {
      const d = byUid.get(uid);
      d.tagsAdd = d.tagsAdd.filter(t => t !== tag); d.tagsRemove = d.tagsRemove.filter(t => t !== tag);
      return { payload: { tag } };
    });
  },
  'edits/parent': ({ uids, parent }) => {
    uids.forEach(one); if (parent) one(parent);
    return record('set_parent', parent ? `move ${assets(uids)} into a product` : `take ${assets(uids)} out of its product`, 'all', uids, () => {
      for (const uid of uids) byUid.get(uid).parent = parent;
      return { payload: { parent } };
    });
  },
  'edits/merge': ({ uid, into }) => {
    if (uid === into) throw new Refused(409, 'a dossier cannot be merged into itself');
    one(uid); one(into);
    return record('merge', 'merge', 'all', [into, uid], () => {
      byUid.get(uid).alias = into;
      for (const d of lib.dossiers) if (d.parent === uid) d.parent = into;
      return { payload: { into, from: uid } };
    });
  },
  'edits/fold-variant': ({ uid, into, variant }) => {
    if (uid === into) throw new Refused(409, 'a dossier cannot be merged into itself');
    one(uid); one(into);
    return record('fold_variant', `fold in variant ${variant}`, 'all', [into, uid], () => {
      byUid.get(uid).alias = into;
      byUid.get(into).variants.push(variant);
      return { payload: { variant } };
    });
  },
  'edits/products': ({ name, children = [], folder = null }) => {
    if (!name?.trim()) throw new Refused(409, 'a product needs a name');
    children.forEach(one);
    const files = folder ? folderFiles(folder) : [];
    const uid = `made-${lib.made + 1}`;
    return record('create_product', `new product ${name.trim()}`, 'all', [uid, ...children], () => {
      const first = byUid.get(children[0]);
      for (const f of files) f.linked = true;
      const product = { uid, name: name.trim(), type_id: 'product', confidence: 1, container: first?.container ?? (folder?.root === 1 ? 11 : 21), parent: null, acquired: new Date().toISOString(),
        fields: { user_created: true }, tagsAdd: [], tagsRemove: [], dismissed: false, alias: null, variants: [], history: [] };
      product.scannedName = product.name; product.scannedType = 'product'; product.scannedParent = null;
      lib.dossiers.push(product); index();
      for (const c of children) byUid.get(c).parent = uid;
      return { new_uid: uid, payload: { name, files: files.length } };
    });
  },
  'edits/link-files': ({ uid, files = [], folder = null }) => {
    one(uid);
    const found = [...files.map(ref => lib.files.find(f => f.root === ref.root && f.rel_key === ref.key && !f.linked)), ...(folder ? folderFiles(folder) : [])];
    if (!found.length || found.some(f => !f)) throw new Refused(404, 'no file to link');
    return record('link_files', `link ${folder ? 'a folder' : found.length === 1 ? '1 file' : `${found.length} files`}`, 'all', [uid], () => {
      for (const f of found) f.linked = true;
      return { payload: { files: found.length } };
    });
  },
  'edits/ignore-folder': ({ environment, folder, ignored = true }) => {
    const key = folderKey(folder);
    if (!key) throw new Refused(409, 'choose a folder, not a whole root');
    if (![1, 2].includes(environment)) throw new Refused(404, `no environment ${environment}`);
    return record(ignored ? 'ignore_folder' : 'unignore_folder', `${ignored ? 'ignore' : 'stop ignoring'} ${folder}`, 'all', [], () => {
      lib.ignored = lib.ignored.filter(i => !(i.environment === environment && i.folder === key));
      if (ignored) lib.ignored.push({ environment, folder: key });
    });
  },
  'edits/dismiss': ({ uids, dismissed = true }) => {
    uids.forEach(one);
    return record(dismissed ? 'dismiss' : 'undismiss', dismissed ? `mark ${assets(uids)} as not an asset` : `count ${assets(uids)} again`, 'all', uids, () => {
      for (const uid of uids) byUid.get(uid).dismissed = dismissed;
    });
  },
  'collections': ({ name, query = null }) => {
    if (lib.collections.some(c => c.name === name.trim())) throw new Refused(409, `there is already a collection named '${name}'`);
    const uid = `col-made-${lib.made + 1}`;
    return record('create_collection', `new collection ${name.trim()}`, 'collections', [], () => {
      lib.collections.push({ uid, name: name.trim(), smart: !!query, query, members: [] });
      return { new_uid: uid };
    });
  },
  'suggestions/accept': ({ ids }) => {
    const found = ids.map(id => lib.suggestions.find(s => s.id === id && s.state === 'pending'));
    if (found.some(s => !s)) throw new Refused(409, 'suggestion is not pending');
    return record('accept_suggestions', `accept ${ids.length === 1 ? '1 suggestion' : `${ids.length} suggestions`}`, 'all', found.map(s => s.subject), () => {
      for (const s of found) {
        s.state = 'accepted';
        const lexicon = s.kind === 'lexicon_word' && lib.lexicons.find(l => l.id === s.payload.lexicon);
        if (lexicon) setWord(lexicon, s.payload.value, s.payload.word, true);
      }
    });
  },
  'suggestions/reject': ({ ids }) => {
    const found = ids.map(id => lib.suggestions.find(s => s.id === id && s.state === 'pending'));
    if (found.some(s => !s)) throw new Refused(409, 'suggestion is not pending');
    return record('reject_suggestions', `reject ${ids.length === 1 ? '1 suggestion' : `${ids.length} suggestions`}`, 'none', [], () => {
      for (const s of found) s.state = 'rejected';
    });
  },
};

export function post(route, body) {
  try {
    if (route === 'undo') return step(session.undo, session.redo, true);
    if (route === 'redo') return step(session.redo, session.undo, false);
    const members = /^collections\/([^/]+)\/members$/.exec(route);
    if (members) {
      const c = lib.collections.find(item => item.uid === decodeURIComponent(members[1]));
      if (!c) throw new Refused(404, `no collection ${members[1]}`);
      if (c.smart) throw new Refused(409, 'a smart collection is a saved search; its members follow the search');
      body.uids.forEach(one);
      return record(body.present === false ? 'remove_from_collection' : 'add_to_collection',
        `${body.present === false ? 'remove' : 'add'} ${assets(body.uids)} ${body.present === false ? 'from' : 'to'} a collection`, 'collections', body.uids, () => {
          c.members = body.present === false ? c.members.filter(u => !body.uids.includes(u)) : [...new Set([...c.members, ...body.uids])];
        });
    }
    const word = /^lexicons\/([^/]+)\/words$/.exec(route);
    if (word) {
      const lexicon = lib.lexicons.find(l => l.id === decodeURIComponent(word[1]));
      if (!lexicon) throw new Refused(404, `no lexicon '${word[1]}'`);
      const { value = '', present = true } = body;
      const text = String(body.word || '').trim();
      if (!text) throw new Refused(409, 'a lexicon word cannot be empty');
      return record('lexicon_word', `${present ? 'add' : 'remove'} the word ${text} ${present ? 'to' : 'from'} ${value}`, 'none', [], () => {
        setWord(lexicon, value, text, present);
        return { payload: { lexicon: lexicon.id, value, word: text, present } };
      });
    }
    const undoEntry = /^history\/(\d+)\/undo$/.exec(route);
    if (undoEntry) {
      // Like the core, undoing an entry is itself an edit (and undoable). The fake keeps snapshots,
      // so it can undo only the latest entry by its id.
      const last = session.undo.at(-1), entry = lib.log.at(-1);
      if (Number(undoEntry[1]) !== lib.made || !last || !entry) throw new Refused(409, 'the fake core undoes only the latest entry');
      const label = `undo ${entry.action.replace(/_/g, ' ')}`, before = snapshot();
      restore(last.before);
      const id = ++lib.made;
      lib.log.push({ id, action: 'undo', dossiers: entry.dossiers, details: { undoes: entry.id }, at: new Date().toISOString() });
      session.undo.push({ label, refresh: 'all', before, after: snapshot() });
      session.redo = [];
      return { status: 200, body: { log_id: id, label, new_uid: null, refresh: 'all', session: sessionView() } };
    }
    if (!edits[route]) return { status: 404, body: { detail: 'Not found' } };
    return edits[route](body || {});
  } catch (error) {
    if (error instanceof Refused) return { status: error.status, body: { detail: error.message } };
    throw error;
  }
}

export function remove(route) {
  const match = /^collections\/([^/]+)$/.exec(route);
  const c = match && lib.collections.find(item => item.uid === decodeURIComponent(match[1]));
  if (!c) return { status: 404, body: { detail: 'no collection' } };
  return record('delete_collection', 'delete collection', 'collections', [], () => { lib.collections = lib.collections.filter(x => x !== c); });
}

export const sessionState = sessionView;
export const choices = () => ({ types: Object.entries(typeNames).map(([id, name]) => ({ id, name, extends: null })), tags: ['clothing', 'prop', 'Food', 'Weapon'],
  fields: ['name', 'type_id', 'author', 'authors', 'license', 'redistribution', 'source', 'url', 'notes', 'version', 'description'] });
export const history = () => [...lib.log].reverse().map(entry => ({ ...entry, undoable: true }));
