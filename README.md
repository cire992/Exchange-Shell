# Exchange Shell

The desktop shell for **Exchange**, a personal, AI-assisted workspace for
building interactive 3D worlds in Unreal Engine and by modding Bethesda games.
The shell owns the windows and the agent terminals; the Exchange core (library,
project homes, requisitions) is a separate Python repository, `cire992/3dExchange`.

Exchange Shell is a fork of [Mr. Mak Workspace](https://github.com/witnesstodark/mr-mak-workspace)
(MIT). It keeps Mr. Mak's Tauri shell, its Chats window and its concept-art and
production skills, and removes the voice coordinator, mobile access, the persona
and its card registry.

## What it does today

- **Chats:** Claude Code, Codex, Kimi and PowerShell in real terminals (xterm.js
  over node-pty), one tab per conversation. Tabs can be grouped, pinned, renamed
  and colored.
- **History and restore:** closing a tab keeps the conversation; reopening it
  resumes the same native CLI conversation.
- **Conversation view** for Claude Code and Codex: Markdown, images, and CLI
  permission menus as buttons. Long chats offer a fresh chat with a handoff.
- **Per-chat permission bypass,** off unless chosen when the chat starts and
  never remembered; a bypassed chat carries an amber BYPASS badge on its tab, in
  its header and in History.
- **Workspace window:** a placeholder for mission control, plus a rail with
  files and previews, skills, MCP connections and settings.

Exchange is Windows-only, local and single-user. It uses your own CLI
subscriptions and makes no paid calls of its own.

## Status

Roadmap phase 5, "Chats online", is in progress. Phase 6 rebuilds the Workspace
window on the Exchange service's local API. The plan, decisions and current state
are in [docs/EXCHANGE_PROGRESS.md](docs/EXCHANGE_PROGRESS.md); what Exchange is
for and how it works are in the core repository's `docs/IDENTITY.md` and
`docs/DESIGN_SPEC.md`.

## Quick start

Requires Node.js 22.20+, Rust (MSVC) with the C++ Build Tools and WebView2, and
at least one signed-in CLI agent. Details: [Getting started](docs/getting-started.md).

```powershell
powershell -ExecutionPolicy Bypass -File .\Setup.ps1 -Mode Check
powershell -ExecutionPolicy Bypass -File .\Setup.ps1 -Mode Desktop
```

Then double-click **Start Exchange.cmd**.

## Repository map

| Path | Contents |
| --- | --- |
| `src/` | React frontend for both windows; `src/exchange/` holds Exchange's own UI |
| `desktop/service/` | Local Node service: terminals, session history, file previews, MCP inventory |
| `src-tauri/` | Tauri 2 shell: windows, tray, taskbar identities |
| `scripts/exchange/` | Exchange's repository checks |
| `.agents/skills/`, `.claude/skills/` | Project skills (Codex source and Claude copies) |
| `docs/` | Getting started, skills, the Exchange handoff doc |
| `inbox/`, `knowledge/`, `processes/` | Attachments and handoffs, notes, workflows |

Architecture and checks: [desktop/README.md](desktop/README.md).
Skills: [docs/skills.md](docs/skills.md).

## Upstream

Mr. Mak is the `upstream` Git remote. Fixes to the Chats window are merged from
it while that stays practical; Exchange's additions live in their own folders to
keep merges small. `CHANGELOG.md` is Mr. Mak's release history up to the fork.

## License

MIT, inherited from Mr. Mak Workspace; see [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).
