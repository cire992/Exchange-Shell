export type AgentId = 'codex' | 'claude' | 'antigravity' | 'opencode' | 'kimi' | 'shell'
export interface AgentInfo { id: AgentId; label: string; color: string; available: boolean; subscription: boolean }
export interface ChatSession {
  id: string; name: string; agent: AgentId; cwd: string; bypass: boolean
  effort?: 'medium' | 'high' | 'xhigh' | 'max'
  status: 'starting' | 'running' | 'stopped' | 'exited'; createdAt: string
  lastOutputAt: string | null; lastInputAt: string | null; nativeId: string | null
  attention: boolean; cols: number; rows: number; exitCode?: number | null
  activity: 'idle' | 'working' | 'waiting'; unread: boolean; completionVersion: number
  tabOrder: number; tabColor: string | null; group: string | null
  open: boolean; pinned: boolean; updatedAt: string; preview?: string; hasConversation?: boolean; restoreError?: string | null
  /** The last launch's checkpoint of its Exchange project home, for bypassed chats (7c). */
  checkpoint?: Checkpoint | null
}
export interface Checkpoint { state: 'none' | 'committed' | 'clean' | 'skipped' | 'failed'; project?: string; commit?: string | null; message?: string; at?: string }
export interface RecentProject { path: string; name: string; sources: ('workspace' | 'mrmak' | 'claude' | 'codex')[]; pinned: boolean; lastUsedAt: string | null }
export interface Handoff { status: 'summarizing' | 'opening' | 'done' | 'failed'; error?: string | null; sessionId?: string | null; file?: string | null; at: string }
export interface Notice { id: string; sessionId: string; name: string; kind: string; text: string; at: string }
export interface Settings { defaultAgent: AgentId; exchangeCore?: string | null; exchangeDataDir?: string | null; terminalFontSize?: number; terminalAppearance?: 'focus' | 'original'; workspaceTheme?: 'dark' | 'light' | 'system'; selectedId?: string | null; handoffAfter?: number; terminalOptionMeta?: boolean; collapsedGroups?: string[]; groupColors?: Record<string, string>; systemEvents?: SystemEventsMode }
export type SystemEventsMode = 'full' | 'compact' | 'hidden'
/** The Exchange core's local service, as this shell runs it (never its URL or token). */
export interface ExchangeStatus { status: 'off' | 'starting' | 'ready' | 'error' | 'stopped'; message: string; version: string | null; api: number | null; core: string | null; dataDir: string | null }
export interface FileEntry { name: string; path: string; directory: boolean; size: number; modifiedAt: string | null }
export interface Folder { path: string; parent: string; entries: FileEntry[]; truncated: boolean; mode: string }
export interface Preview { path: string; name: string; size: number; kind: 'document' | 'image' | 'video' | 'audio' | 'text' | 'unsupported'; url?: string; text?: string; revision?: string; reason?: string }
export interface DesktopState {
  ready: boolean; connected: boolean; error: string | null; repo: string; contentBase: string
  agents: AgentInfo[]; sessions: ChatSession[]; selectedId: string | null; notices: Notice[]
  settings: Settings; preview: Preview | null
  exchange: ExchangeStatus; exchangeImages: string
}
export interface ServiceEvent {
  type: string; id?: string; data?: string; sequence?: number; session?: ChatSession; sessions?: ChatSession[]
  selectedId?: string; sessionId?: string; state?: string; error?: string; notice?: Notice
  settings?: Settings; exchange?: ExchangeStatus; window?: string; route?: string; preview?: Preview; handoff?: Handoff
}
