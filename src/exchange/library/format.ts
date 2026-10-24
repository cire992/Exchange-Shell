// Words for the library view, matching the PySide6 window's (exchange_ui/inspector.py).

export function fileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return ''
  let n = bytes
  for (const unit of ['B', 'KB', 'MB', 'GB']) {
    if (n < 1024 || unit === 'GB') return unit === 'B' ? `${n} B` : `${n.toFixed(1)} ${unit}`
    n /= 1024
  }
  return String(bytes)
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

export function fieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(fieldValue).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

export const fieldLabel = (key: string) => key.replace(/_/g, ' ')

export const shortDate = (iso: string | null | undefined) => iso ? iso.slice(0, 16).replace('T', ' ') : ''

const tagSources: Record<string, string> = { name: 'its name', folder: 'its folder', metadata: 'source metadata' }
export const tagSource = (source: string) => tagSources[source] || source

type Payload = Record<string, unknown>
const count = (value: unknown) => Array.isArray(value) ? value.length : Number(value) || 0
const list = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value ?? '')

export function describeEvent(action: string, p: Payload): string {
  const files = count(p.files)
  const words: Record<string, () => string> = {
    entry_added: () => `Found in ${p.environment} · ${p.container}`,
    entry_retired: () => `No longer in ${p.environment} · ${p.container}`,
    set_field: () => `You set ${p.field} to ${fieldValue(p.value)}`,
    revert_field: () => `You reverted ${p.field} to the scanned value`,
    tag: () => `You ${[p.add && count(p.add) ? `added tag ${list(p.add)}` : '', p.remove && count(p.remove) ? `removed tag ${list(p.remove)}` : ''].filter(Boolean).join(' and ')}`,
    revert_tag: () => `You reverted tag ${p.tag}`,
    set_parent: () => p.parent ? 'You moved it into a product' : 'You took it out of its product',
    revert_parent: () => 'You reverted its product',
    link_files: () => `You linked ${plural(files, 'file')}`,
    unlink_files: () => `You unlinked ${plural(files, 'file')}`,
    merge: () => 'You merged assets',
    fold_variant: () => `You folded in variant ${p.variant}`,
    split: () => 'You split it',
    promote_variant: () => `You made variant ${p.variant} its own asset`,
    create_product: () => `You made product ${p.name}${files ? ` from ${plural(files, 'file')}` : ''}`,
    dismiss: () => 'You marked it as not an asset',
    undismiss: () => 'You counted it as an asset again',
    add_to_collection: () => 'You added it to a collection',
    remove_from_collection: () => 'You removed it from a collection',
    undo: () => `You undid: ${String(p.undone_action || '').replace(/_/g, ' ')}`,
  }
  const text = words[action]
  return text ? text() : action.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

export function describeSuggestion(kind: string, p: Payload): string {
  if (kind === 'texture_link') {
    const files = Array.isArray(p.files) ? p.files as { channel?: string }[] : []
    const channels = [...new Set(files.map(f => f.channel || '?'))].sort().join(', ')
    return `Link ${plural(files.length, 'texture')} (${channels}) found beside this mesh`
  }
  if (kind === 'variant_group') {
    const variants = [...new Set(Object.values((p.variants || {}) as Record<string, string>))].sort()
    return `Group ${plural(count(p.members), 'asset')} as variants: ${variants.join(', ')}`
  }
  if (kind === 'lexicon_word') return `Add the word “${p.word}” to the ${p.value} tag, so it tags assets by itself`
  return kind.replace(/_/g, ' ')
}
