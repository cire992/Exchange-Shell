# Desktop architecture

The desktop app is a Tauri 2 shell around two webviews. It starts one local Node
service, binds it to loopback and gives each window the authenticated local URL.
Workspace shows a placeholder for Exchange's mission control (rebuilt on the
Exchange service in roadmap phase 6) and the files rail with document previews.
Chats renders real PTYs through xterm.js. The windows share sessions and settings but minimize independently.

| Path | Responsibility |
| --- | --- |
| `src/` | React frontend: chats, files rail and previews; `src/exchange/` holds Exchange's own UI |
| `desktop/service/` | HTTP/WebSocket service, PTYs, session history, tools |
| `src-tauri/src/` | Shell integration: Windows taskbar identities, native drag and the optional Win-key shortcut |
| `exchange-shell.json` | Marks the repository root the shell starts in |
| `workspace/_shared/` | Report CSS for previews and the image viewer, and the Help page |
| `.mrmak/` | Local runtime state; ignored by Git |

`npm run desktop:build` runs `desktop/prepare.mjs`, builds the React frontend,
packages the service with a Node executable and production dependencies, then
builds the Tauri executable and the NSIS installer. The repository is chosen at
start (the folder containing `exchange-shell.json`); its content is served from
disk rather than baked into the installer.

The service runs CLIs as the current user. Their available files and permissions
follow their launch options and native account settings. Permission bypass is
off by default. Do not expose the local service as a public web server.

Each chat records the provider's native conversation ID when available, for
later resume.
Codex discovery checks both local and UTC date folders, keeps waiting through
delayed first prompts, and reads bounded metadata records larger than one small
buffer. Closing or resuming a tab can recover a missing ID from its exact launch
origin marker. Shared working directories alone are not proof of ownership.

New Codex and Claude chats default to `xhigh`; explicit saved effort choices are
preserved. Terminal URLs and OSC 8 links use xterm link handlers. New-window
requests from both app windows open HTTP(S) links in the system default browser
(the Windows shell association), while the current app view stays open.

## The Exchange core's service

`desktop/service/exchange/core.mjs` starts the Exchange core's local API (`exchange serve`, in the
core repository) from the folder in Settings › Exchange core, and stops it with the shell. The
windows reach it through this service:
- `/api/exchange/<route>` is the core's `/api/v1/<route>`, behind this service's token.
- `/exchange-images/<grant>/<uid>` serves thumbnails.

`src/exchange/api.gen.ts` holds types generated from the core's `docs/api/openapi.json`; regenerate
them with `npm run exchange:types` after the core's API changes. See `docs/EXCHANGE_PROGRESS.md`
(6c).

Before a bypassed chat starts or resumes in an Exchange project home (a folder with
`exchange.project.toml`), `desktop/service/exchange/checkpoint.mjs` has the core commit the home
(`exchange project checkpoint`). If that fails, the chat does not start; the New chat dialog and the
Reconnect bar offer to start it without a checkpoint. See `docs/EXCHANGE_PROGRESS.md` (7c).

## Projects and the Conversation view

New chat lists recent projects from `recent-projects.mjs`: this repository, pinned
favorites, folders recorded in Claude Code's `.claude.json` (`CLAUDE_CONFIG_DIR`
is respected), Codex session metadata from the latest 60 day folders (`CODEX_HOME`
is respected) and the folders of earlier chats. Only folder names are read
from those files. Worktrees, scratch folders, the Codex app's dated folders and
missing folders are skipped. Pins are saved in `settings.pinnedProjects`.

Claude and Codex chats can switch between Terminal and Conversation. Conversation
reads the native transcript, sends a prompt through the PTY with
bracketed paste and Enter, and serves media through short-lived `/media/` grants
bound to one chat. A new chat opens in Terminal until it has a conversation, since
the CLI may first ask about folder trust or sign-in. The last chosen view becomes
the default for other chats.

`terminal-prompt.mjs` recognizes a numbered CLI menu with one selected option at
the bottom of the terminal screen. Conversation shows it as buttons. An answer
names the menu it saw; the service re-reads the screen, rejects a changed menu,
then sends arrow keys and Enter one key at a time. Local links in messages open a
Workspace preview, resolved against the chat folder.

## Fresh-chat handoff and project tabs

`settings.handoffAfter` (default 40, 0 turns it off) is the number of the user's
own messages after which a Claude or Codex chat offers a fresh chat. The count
comes from the native transcript. "Later" and "Not for this chat" are stored per
chat in the window's local storage. Accepting runs `handoff.mjs`: it sends a fixed
handoff request through the PTY, waits for the native turn completion, takes the
reply from its `# Handoff` heading and saves it in `inbox/handoffs/` (ignored by
Git). The new chat uses the same agent, folder, permission and effort settings and
receives one first-message argument naming that file. Claude also receives
`--add-dir` for the handoff folder. Nothing changes in the original chat.

`settings.groupTabsByProject` groups open tabs by working folder. A group keeps
the position of its first tab; tabs reorder only within their project.

Fullscreen Claude scrolls its own conversation. Terminal snapshots preserve
both mouse tracking and the requested SGR encoding, including saved screens,
so switching tabs or reconnecting does not disable its mouse wheel. Classic
Claude and Codex continue using local terminal scrollback.

## Terminal appearance

Settings → Chats → Terminal appearance offers **Original CLI colors** (the default)
and **Exchange Focus** (muted colors). Original preserves CLI diff colors for added
and removed lines. The choice is saved for all desktop chats and applies to open
terminals immediately without restarting sessions. Existing saved preferences
are retained. The same choice is available in each chat’s options menu.

## OpenCode terminals

The service detects installed OpenCode 1.x or 2.x and launches its real TUI.
OpenCode owns model choice, provider authentication and reasoning configuration.
The optional `--auto` flag keeps OpenCode's explicit permission denials intact.

`desktop/service/opencode/` contains dependency-free event observers for both
plugin APIs. A per-process inline configuration adds the matching observer while
preserving configured plugins, models and providers. No global config is edited.
OpenCode 2.x uses `--standalone` to isolate the server for each managed terminal.

Observers save only a native session ID, launch identity and activity/completion
metadata under `.mrmak/`. They do not save prompts or provider credentials.
Root-session identity is captured from an actual native event, not inferred from
a shared working directory. Resume passes `--session` with that recorded ID.
A launch-specific marker prevents stale events from changing a new terminal's
activity. Native CLI history must remain on disk for conversation restoration.

## Checks

```powershell
npm ci
npm run lint
npm test
npm run test:repo
npm run build
npm run desktop:test:ui
npm run desktop:prepare
cargo test --manifest-path src-tauri/Cargo.toml
```

`cargo test` needs `.cache/desktop-runtime`, which `desktop:prepare` creates.

The root install also installs the locked `desktop/service` dependencies. If
you deliberately use `npm ci --ignore-scripts`, run
`npm --prefix desktop/service ci` before tests or the local service.

UI tests use an isolated repository and fake terminals. They run in Edge, the
engine behind WebView2. Set `MRMAK_TEST_BROWSER` to `msedge`, `chrome` or
`chromium` to override; `chromium` needs `npx playwright install chromium` first. Subscription smoke
checks are separate scripts with explicit opt-in flags; they are never part of
the default test command. `desktop/service/exchange/test-clis.mjs` checks the
installed Claude Code, Codex, Kimi and PowerShell: launch with and without
bypass, and with `--use-subscription` a resume from History (see
`docs/EXCHANGE_PROGRESS.md`).

OpenCode has a separate no-account integration test against a local mock model:

```powershell
node desktop/service/test-opencode-native.mjs --binary C:\path\to\opencode.exe --tui
```

It isolates the CLI's home and data directories, verifies two separate native
histories, then closes and resumes a real terminal. Tested with OpenCode 1.18.3
and 2.0.21 on Windows. No paid model calls are made.

Windows x64 is the only target.
