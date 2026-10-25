import { exchangeGet, type Changes, type Job, type JobList } from '../api'

const WAIT = 20 // seconds the core holds a request open waiting for a change (it allows 25)
const RETRY = 3000

// The core's long jobs (Roadmap phases 6g and 6h) and its change notices, followed by version: each
// request returns as soon as something changed, so progress arrives without polling in a loop.
// Components read it through useSyncExternalStore (subscribe / getVersion).
export class Jobs {
  jobs: Job[] = []
  changes: Changes = { available: false, environments: [], version: 0 }
  version = 0
  private listeners = new Set<() => void>()
  private finished = new Set<(job: Job) => void>()
  private progressed = new Set<(job: Job) => void>()
  private seen = new Map<number, string>() // job id -> state, to notice the ones that end
  private closed = false

  constructor() {
    void this.followJobs()
    void this.followChanges()
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getVersion = () => this.version
  close() { this.closed = true; this.listeners.clear(); this.finished.clear(); this.progressed.clear() }

  /** Called with the whole job (its report or result included) each time one ends. */
  onFinished(listener: (job: Job) => void) { this.finished.add(listener); return () => { this.finished.delete(listener) } }
  /** Called with a running job each time its progress moves. */
  onProgress(listener: (job: Job) => void) { this.progressed.add(listener); return () => { this.progressed.delete(listener) } }

  /** The job that writes the library, if one runs (one at a time). */
  get writer(): Job | undefined { return this.jobs.find(job => job.writes && job.state === 'running') }

  /** A job's state once it ends (its report or result included). */
  async until(job: Job, onChange?: (job: Job) => void): Promise<Job> {
    let current = job
    while (current.state === 'running' && !this.closed) {
      try {
        current = await exchangeGet('jobs/{job_id}', { path: { job_id: current.id }, query: { since: current.version, wait: WAIT } })
        onChange?.(current)
      } catch {
        if (this.closed) break
        await delay(RETRY) // the core restarting: ask again
      }
    }
    return current
  }

  private changed() { if (this.closed) return; this.version++; for (const listener of this.listeners) listener() }

  private async followJobs() {
    let since: number | null = null
    while (!this.closed) {
      try {
        const list: JobList = await exchangeGet('jobs', { query: { since, wait: since === null ? 0 : WAIT } })
        if (this.closed) return
        since = list.version
        for (const job of list.jobs) {
          const before = this.seen.get(job.id)
          this.seen.set(job.id, job.state)
          if (job.state === 'running' && job.progress) for (const listener of this.progressed) listener(job)
          if (before === 'running' && job.state !== 'running') void this.ended(job)
        }
        this.jobs = list.jobs
        this.changed()
      } catch {
        await delay(RETRY)
      }
    }
  }

  private async ended(job: Job) {
    const whole = await exchangeGet('jobs/{job_id}', { path: { job_id: job.id } }).catch(() => job)
    for (const listener of this.finished) listener(whole)
  }

  private async followChanges() {
    let since: number | null = null
    while (!this.closed) {
      try {
        const changes: Changes = await exchangeGet('changes', { query: { since, wait: since === null ? 0 : WAIT } })
        if (this.closed) return
        since = changes.version
        this.changes = changes
        this.changed()
      } catch {
        await delay(RETRY)
      }
    }
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const PHASES: Record<number, string> = { 1: 'Discovery', 2: 'Identification', 3: 'Enrichment' }
const STEPS: Record<string, string> = { discovery: 'Discovering files', identification: 'Grouping products', hashing: 'Hashing',
  duplicates: 'Finding duplicates', meshes: 'Measuring meshes', dependencies: 'Reading dependencies', thumbnails: 'Rendering thumbnails' }

/** A running job's progress in words, as the window's status line puts it. */
export function describeProgress(job: Job): string {
  const p = job.progress
  if (!p) return `${job.label} …`
  if (p.phase) {
    const count = p.total ? ` ${(p.done ?? 0).toLocaleString()} / ${p.total.toLocaleString()}` : ''
    return `${job.kind === 'detect' ? 'Detecting' : 'Scanning'} ${p.environment || ''} · Phase ${p.phase} of 3 · ${PHASES[p.phase] || ''} · ${STEPS[p.step || ''] || p.step || ''}${count}`
  }
  return `${job.label} …`
}

/** What a finished job did, for the status line; null when it says nothing worth saying. */
export function describeFinished(job: Job): { text: string; error: boolean } | null {
  if (job.state === 'stopped') return { text: job.error || 'Stopped', error: false }
  if (job.state === 'failed') return { text: job.error || `${job.label} failed`, error: true }
  if (job.kind === 'classify') {
    const stats = (job.result?.classification || {}) as { dossiers?: number; tagged?: number }
    return { text: `Lexicons applied · ${(stats.tagged ?? 0).toLocaleString()} of ${(stats.dossiers ?? 0).toLocaleString()} assets tagged`, error: false }
  }
  if (job.kind === 'scan' || job.kind === 'rescan') {
    const envs = job.report?.environments || []
    const roots = envs.flatMap(env => env.roots)
    const products = roots.reduce((n, root) => n + Number((root.identification as { products?: number } | null)?.products || 0), 0)
    const offline = roots.filter(root => root.status === 'offline').length
    const parts = [`Scan finished · ${envs.length} environment${envs.length === 1 ? '' : 's'} · ${products.toLocaleString()} products`]
    if (offline) parts.push(`${offline} offline`)
    return { text: [...parts, ...(job.report?.notes || [])].join(' · '), error: false }
  }
  return null
}
