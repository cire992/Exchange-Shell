// A synthetic library for the fake core: the read API's shapes (the core's docs/api/openapi.json)
// with deterministic data, large enough to exercise paging and the virtualized grid.
//   Daz Studio: 300 products of 10 items each (wearables and morphs), in two content directories
//   Loose files: 2,000 standalone static meshes, 40 of them Unidentified, every 7th with a thumbnail
// Searches match names (case-insensitively); a query containing "((" is a 400, like a search that
// does not parse.

const daz = { id: 1, name: 'Daz Studio', type_id: 'daz_studio' };
const loose = { id: 2, name: 'Loose files', type_id: 'loose_files' };
const containers = { 11: { id: 11, name: 'My Library', kind: 'content_directory', env: daz }, 12: { id: 12, name: 'Daz Connect', kind: 'content_directory', env: daz }, 21: { id: 21, name: 'Sketchfab', kind: 'folder', env: loose } };
const typeNames = { product: 'Product', daz_wearable: 'Daz wearable', daz_morph: 'Daz morph', static_mesh: 'Static mesh' };

const dossiers = [];
for (let p = 0; p < 300; p++) {
  const container = p % 3 === 2 ? 12 : 11;
  const product = { uid: `product-${p}`, name: `Outfit ${String(p).padStart(3, '0')}`, type_id: 'product', confidence: 0.9, container, parent: null, children: [], acquired: `2026-0${1 + (p % 9)}-1${p % 10}T10:00:00` };
  dossiers.push(product);
  for (let c = 0; c < 10; c++) {
    const child = { uid: `product-${p}-item-${c}`, name: `Outfit ${String(p).padStart(3, '0')} ${c < 6 ? 'Piece' : 'Morph'} ${c}`, type_id: c < 6 ? 'daz_wearable' : 'daz_morph', confidence: 0.85, container, parent: product.uid, children: [], acquired: product.acquired, format: '.duf' };
    product.children.push(child.uid);
    dossiers.push(child);
  }
}
for (let m = 0; m < 2000; m++) {
  const name = m === 0 ? 'Dwarf Helmet' : m % 50 === 1 ? `Barrel ${m}` : `Prop ${String(m).padStart(4, '0')}`;
  dossiers.push({ uid: m === 0 ? 'helmet-1' : `mesh-${m}`, name, type_id: 'static_mesh', confidence: m % 50 === 3 ? 0.3 : 0.8, container: 21, parent: null, children: [], acquired: '2026-10-20T09:00:00', format: '.glb', thumbnail: m % 7 === 0 });
}
const byUid = new Map(dossiers.map(d => [d.uid, d]));
const byName = (a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;
const collections = [{ uid: 'col-favorites', name: 'Favorites', smart: false, query: null, members: ['helmet-1', 'mesh-7', 'mesh-14', 'product-4'] },
  { uid: 'col-barrels', name: 'All barrels', smart: true, query: 'barrel' }];
const unidentified = d => d.confidence < 0.5;
const envOf = d => containers[d.container].env;

function brick(d) {
  return { uid: d.uid, name: d.name, type_id: d.type_id, type_name: typeNames[d.type_id], confidence: d.confidence, unidentified: unidentified(d),
    thumbnail_url: d.thumbnail ? `/api/v1/dossiers/${d.uid}/thumbnail` : null, format: d.format || null, environments: [envOf(d).name], entries: 1, children: d.children.length };
}

function matches(d, query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => d.name.toLowerCase().includes(word));
}

export function sidebar() {
  const counted = env => dossiers.filter(d => envOf(d).id === env.id);
  const environment = env => {
    const own = counted(env);
    return { id: env.id, name: env.name, type_id: env.type_id, status: env.id === 2 ? 'partial' : 'online', count: own.length, roots: [],
      containers: Object.values(containers).filter(c => c.env.id === env.id).map(c => ({ id: c.id, name: c.name, kind: c.kind, count: own.filter(d => d.container === c.id).length })),
      types: [...new Set(own.map(d => d.type_id))].sort().map(type_id => ({ type_id, name: typeNames[type_id], count: own.filter(d => d.type_id === type_id).length })) };
  };
  return { all: dossiers.length, unidentified_dossiers: dossiers.filter(unidentified).length, unattached_files: 12, environments: [environment(daz), environment(loose)] };
}

export function listCollections() {
  return collections.map(c => ({ uid: c.uid, name: c.name, smart: c.smart, query: c.query, count: c.smart ? dossiers.filter(d => matches(d, c.query)).length : c.members.length }));
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
  let items = dossiers;
  if (parent) items = items.filter(d => d.parent === parent);
  else if (group === 'product') items = items.filter(d => !d.parent);
  if (collection) {
    const c = collections.find(item => item.uid === collection);
    items = !c ? [] : c.smart ? items.filter(d => matches(d, c.query)) : items.filter(d => c.members.includes(d.uid));
  }
  if (environment) items = items.filter(d => envOf(d).id === environment);
  if (container) items = items.filter(d => d.container === container);
  if (type) items = items.filter(d => d.type_id === type);
  if (wantUnidentified) items = items.filter(unidentified);
  if (query) items = items.filter(d => matches(d, query));
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
  const fields = d.type_id === 'static_mesh'
    ? { mesh_triangles: { value: 1200 + d.name.length, source: 'enrich:mesh' }, mesh_vertices: { value: 640, source: 'enrich:mesh' }, mesh_size: { value: 1.5, source: 'enrich:mesh' }, mesh_skinned: { value: false, source: 'enrich:mesh' }, author: { value: 'Sketchfab artist', source: 'scan' } }
    : d.type_id === 'product' ? { author: { value: 'Daz Originals', source: 'scan' }, product_key: { value: `SKU${d.uid}`, source: 'scan' } } : {};
  return {
    uid: d.uid, name: d.name, name_overridden: false, type_id: d.type_id, type_name: typeNames[d.type_id], type_overridden: false,
    confidence: d.confidence, unidentified: unidentified(d), signals: [`rule ${d.type_id}`], fields,
    parent_fields: parent ? { license: { value: 'Daz EULA', source: 'scan' } } : {},
    tags: d.type_id === 'static_mesh' ? ['prop'] : ['clothing'],
    tag_sources: [{ tag: d.type_id === 'static_mesh' ? 'prop' : 'clothing', sources: ['folder'], confidence: 0.7, user: null }],
    variant: null, thumbnail_url: d.thumbnail ? `/api/v1/dossiers/${d.uid}/thumbnail` : null,
    parent: parent ? ref(parent) : null, children: d.children.map(c => ref(byUid.get(c))),
    ledgers: [{ environment: { id: env.id, name: env.name, type_id: env.type_id }, entries: [{ id: 1, container: container.name, container_kind: container.kind, status: 'origin', created_at: d.acquired, files: [
      { id: 1, rel_path: `${d.name}${d.format || '.dsx'}`, path: `D:/Library/${d.name}${d.format || '.dsx'}`, size: 48213, role: 'primary', state: 'present' }] }] }],
    dependencies: d.parent ? [{ reference: '/data/missing/texture.png', status: 'broken', target: null }, { reference: `/data/${parent.name}.dsf`, status: 'ok', target: ref(parent) }] : [],
    required_by: [], history: [{ id: null, at: d.acquired, action: 'entry_added', payload: { environment: env.name, container: container.name } }],
    variants: [], aliases: [], suggestions: [], collections: collections.filter(c => !c.smart && c.members.includes(d.uid)).map(c => ({ uid: c.uid, name: c.name })),
  };
}

export const hasThumbnail = uid => !!byUid.get(uid)?.thumbnail;
