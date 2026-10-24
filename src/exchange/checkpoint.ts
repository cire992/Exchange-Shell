import type { ChatSession, Checkpoint } from '../desktop/types'

// Before each launch of a bypassed chat in an Exchange project home, the shell commits the home
// (Roadmap phase 7c). These describe the last launch's checkpoint for tooltips and the
// Reconnect bar.

export const isCheckpointError = (error: unknown) => (error as { code?: string } | null)?.code === 'checkpoint'

const folderName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).slice(-1)[0] || folder

export function checkpointNote(checkpoint: Checkpoint | null | undefined): string {
  if (!checkpoint) return ''
  switch (checkpoint.state) {
    case 'committed': return `Checkpoint ${checkpoint.commit?.slice(0, 7)} of ${folderName(checkpoint.project || '')} before this launch`
    case 'clean': return `Project home ${folderName(checkpoint.project || '')} had no changes to checkpoint`
    case 'skipped': return 'Started without a checkpoint of its project home'
    case 'failed': return checkpoint.message || 'The checkpoint failed'
    default: return ''
  }
}

export const checkpointFailed = (session: ChatSession) => session.bypass && session.checkpoint?.state === 'failed'
