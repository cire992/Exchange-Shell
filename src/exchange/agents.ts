import type { AgentInfo, ChatSession } from '../desktop/types'

// Exchange's chats are Claude Code, Codex, Kimi and PowerShell; they are always
// listed, as "Not installed" when missing. The other CLIs upstream supports
// (Antigravity, OpenCode) appear only once installed, or while a chat uses them.
const optional = new Set<AgentInfo['id']>(['antigravity', 'opencode'])

export function visibleAgents(agents: AgentInfo[], sessions: ChatSession[] = []) {
  return agents.filter(agent => !optional.has(agent.id) || agent.available || sessions.some(session => session.agent === agent.id))
}
