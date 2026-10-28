import type { DossierDetail, EntryFile, FileRef } from '../api'

// The files of assets, from their details: for Show in folder, Open in app and linking files from
// one asset onto another (the PySide6 window's primary_path and files_of).

// The files of the asset's entries that are still on disk (not retired).
export const liveFiles = (detail: DossierDetail): EntryFile[] =>
  detail.ledgers.flatMap(ledger => ledger.entries.filter(entry => entry.status !== 'retired').flatMap(entry => entry.files))

// The file that stands for the asset: the first live entry's primary file, else its first file.
export function mainFile(detail: DossierDetail): EntryFile | null {
  for (const ledger of detail.ledgers) {
    for (const entry of ledger.entries) {
      if (entry.status === 'retired' || !entry.files.length) continue
      return entry.files.find(file => file.role === 'primary') || entry.files[0]
    }
  }
  return null
}

// Every live file of the assets, once each, as the link-files edit takes them.
export function fileRefs(details: DossierDetail[]): FileRef[] {
  const refs = new Map<string, FileRef>()
  for (const file of details.flatMap(liveFiles)) refs.set(`${file.root}|${file.key}`, { root: file.root, key: file.key })
  return [...refs.values()]
}
