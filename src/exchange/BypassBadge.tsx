import './exchange.css'

// Marks a chat started with "Bypass agent permission prompts". It stays on the
// chat for its whole life: tabs, History rows and the chat's header.
export const bypassTitle = 'Permission prompts are bypassed for this chat. The agent acts without asking.'

export default function BypassBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`bypass-badge ${compact ? 'compact' : ''}`} title={bypassTitle} aria-label="Permission prompts bypassed">{compact ? '!' : 'Bypass'}</span>
}
