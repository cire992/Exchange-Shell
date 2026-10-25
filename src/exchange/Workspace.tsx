import { useDesktop } from '../desktop/client'
import WorkspacePlaceholder from './WorkspacePlaceholder'
import Library from './library/Library'

// The Workspace window: the library once the Exchange service is connected, otherwise the panel
// that says why it is not (with Retry and the settings hint).
export default function Workspace() {
  const { exchange } = useDesktop()
  return exchange.status === 'ready' ? <Library /> : <WorkspacePlaceholder />
}
