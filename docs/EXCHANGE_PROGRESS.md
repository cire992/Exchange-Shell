# Exchange Shell: progress and handoff

## Game data model (2026-10-24)

Records (compiled game data, with maturity) are now separate from claims (work, with status).
See the Exchange repository's docs/OVERVIEW.md for how the parts connect, docs/IDENTITY.md (v2) for
the amendment, and docs/GAME_DATA_MODEL.md for the record and claim design. Phase 7 builds the
first slice: project home files, schemas for NPC_, RACE, FACT and LOT_, validation, gap claims and
fast capture. Those docs live in the Exchange repository only.

Last updated 2026-10-24, during phase 7. Phase 5 and 6c are merged; 7c is in review.

This repository is the desktop shell for Exchange, forked from
[Mr. Mak Workspace](https://github.com/witnesstodark/mr-mak-workspace). The
Python core lives in the Exchange repository (`cire992/3dExchange`); its local
path and the other machine-specific paths are in `docs/USEFUL_PATHS.md`, which
is kept out of Git because this repository is public.

Read this first, then these files in the Exchange repository:

- `docs/OVERVIEW.md`: how the parts connect.
- `docs/IDENTITY.md`: what Exchange is for.
- `docs/GAME_DATA_MODEL.md`: records and claims. Where it and the spec disagree, it wins.
- `docs/DESIGN_SPEC.md`: how it works, and the source of truth. Use its terms
  exactly. For this repository the relevant sections are *Workspace and agents*,
  *User interface* and *Architecture* (including *The fork*).
- `docs/PROGRESS.md`: the core's handoff doc, in particular *Design pivot*.

Then this repository's [AGENTS.md](../AGENTS.md) (working rules) and
[desktop/README.md](../desktop/README.md) (architecture and checks).

## Where we are

**Roadmap phase 5, "Chats online" (goal G3), is merged**, except one open
check: Kimi's History restore (see Known gaps). **Phase 6, "Service and
Workspace" (goal G4), is in progress** across both repositories; its plan and
decisions are in the core's `docs/PROGRESS.md` (*Phase 6*). This repository does
6c, 6d, 6f, 6h and 6i, and half of 6j.

**Phase 7, part 1, "Project homes" (goal G5), is in progress**, planned in the core's
`docs/PROGRESS.md` (*Phase 7*). Its only chunk here is 7c: the git checkpoint before bypassed
chats. The Workspace views for records wait for the rest of phase 6.

Phase 5 was done when the fork ran with tabs for Claude Code, Codex, Kimi and
PowerShell, history restore, and the per-session bypass checkbox with a badge on
the tab. Its plan was approved on 2026-10-24 with every recommended answer;
question 8 was answered "keep the upstream behavior" (see Decisions).

| PR | What | State |
| --- | --- | --- |
| 5a (#1) | Foundation: upstream history and remote, this doc, Windows-only CI, the unmodified app built and run on the dev machine | merged |
| 5b (#4) | Remove the voice coordinator, mobile access and in-app speech (OpenAI Live, coordinator, quick actions, pairing, Tailscale, dictation, read-aloud), with their routes, UI, tests, docs and `.env.example` entries | merged |
| 5c (#5) | Remove the persona and its card registry; Exchange branding; a placeholder Workspace window under `src/exchange/` | merged |
| 5d | Chats for Exchange: a bypass checkbox that starts unchecked for every new chat, a badge on bypassed tabs and history rows, and checks with the real Claude Code, Codex, Kimi and PowerShell | merged |
| 6c (#7) | The shell starts the Exchange core's service and proxies it; its status and settings in the Workspace | merged |
| 7c | A git checkpoint of the project home before every launch of a bypassed chat | in review |

Phase 5's PRs were stacked, each based on the previous one. Since then, each PR targets `main`.

**What upstream already provides** (checked 2026-10-24): Kimi sessions
(`--session` resume, `--yolo` bypass), history restore for Claude Code, Codex
and Kimi, and a bypass checkbox in the new-chat dialog. Before 5d, the
checkbox remembers the last choice (`settings.defaultBypass`, plus a setting
for it) and the only bypass marker is "Bypass" in the chat's status bar.

## How we work

The same as the Exchange repository:

- **Plan, then build.** For each phase, propose a plan with open questions and
  a recommended answer for each, then wait for approval.
- **Ask instead of guessing** when the spec is ambiguous or seems wrong.
- **One branch and PR per chunk.** The user reviews and merges. Base the next
  PR on the previous one when they depend on each other. After merging one,
  change the next PR's base to `main` before merging it.
- **Don't push more commits to a PR branch after saying it is ready.**
- **Install nothing without asking.** Don't connect paid providers or voice APIs.

### Staying mergeable with upstream

- Mr. Mak is the `upstream` remote. Merge `upstream/main` into a branch, never
  rebase onto it, so this repository's history stays intact.
- Exchange's additions go in their own folders (`src/exchange/`,
  `desktop/service/exchange/`, `scripts/exchange/`, `docs/EXCHANGE_*.md`)
  rather than in edits to upstream files.
- Removed upstream features are deleted as whole files, with small cuts where
  they connect to kept files. An upstream change to a deleted file then shows
  up as a modify/delete conflict; resolve it by keeping the deletion.
- Internal names stay as upstream has them (`.mrmak/`, `MRMAK_*`, the npm
  package name). Only names the user sees change.
- Keep `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md`.

## Decisions made (do not reopen without the user)

Phase 5, approved 2026-10-24:

1. **Toolchain:** Node 22 (22.23.4 via winget, replacing 18.15), Rust stable
   MSVC via rustup, the Codex CLI from npm (`@openai/codex`) and the Kimi CLI
   from Moonshot's official installer. The user signs in to each CLI.
2. **Upstream history:** this repository began as a squashed copy of upstream
   `main` at `fbb4004` (0.6.0) with an identical tree. A
   `merge -s ours --allow-unrelated-histories` links the two histories without
   changing files or force-pushing.
3. **Loose docs:** `docs/USEFUL_PATHS.md` is gitignored. Exchange's
   `IDENTITY.md` and `DESIGN_SPEC.md` are not copied here; this doc links to
   them. `KICKOFF_PROMPT.md` stays untracked, as in Exchange.
4. **Speech:** all in-app speech goes, including free local Whisper dictation,
   read-aloud and the `voice-dictation-setup` skill. It can come back later.
5. **Naming:** the product name becomes "Exchange" and the identifier
   `com.exchange.shell`, so its app data stays separate from Mr. Mak's. Internal
   names stay (see above). A simple temporary amber and teal icon.
6. **Root folder:** the shell keeps using this repository checkout as its root.
   The shell recognizes it by `exchange-shell.json` (since 5c; it used to be
   `workspace/workspace.json`). Project homes come in phase 7.
7. **Antigravity and OpenCode:** their code stays, so merges stay easy, but the
   new-chat list hides them unless they are installed.
8. **Bypass on resume and handoff:** keep the upstream behavior. A resumed chat
   keeps its own bypass flag; a handoff starts the new chat with the same
   agent, folder, permission and effort settings. The git checkpoint before
   bypassed sessions comes in phase 7.
9. **CI:** only the Windows checks job, which also runs `cargo test` on the
   Tauri shell. The Linux and macOS jobs and the release workflows are removed.

Kept skills: the concept-art skills (`image-reference-workflow`,
`character-sheet-pipeline`, `fal-ai-generation`, `higgsfield-workflow`), `plan`,
`feature-handoff`, and the 3D and game production skills.

## Dev machine

Windows 10 Pro 19043, checked 2026-10-24:

- Node 22.23.4 and npm 10.9.9, Rust stable (`x86_64-pc-windows-msvc`).
- Visual Studio 2022 Build Tools with the C++ x64 tools, Windows SDK
  10.0.22621, WebView2 Runtime 155.
- Claude Code (native `claude.exe`), Codex CLI 0.164.0. Windows PowerShell 5.1
  is the shell tab; `pwsh` is not installed.
- Kimi Code CLI 2.3.1 (`~\.kimi-code\bin\kimi.exe`), installed by the user.
  The user's Kimi subscription does not include Kimi Code: every turn returns
  "403 Your current subscription does not have access to Kimi Code".
- One-time CLI choices made by the user: Claude Code's Bypass Permissions
  acknowledgement, and Kimi's trust of this folder.

Checks, from the repository root:

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

Against the real, signed-in CLIs (opt-in, never in CI):

```powershell
node desktop/service/exchange/test-clis.mjs
node desktop/service/exchange/test-clis.mjs --use-subscription
```

The first only launches each CLI with and without bypass and checks its own
permission-mode indicator. `--use-subscription` adds one tiny turn per agent
before and after closing the tab and reopening it from History. It never answers
a CLI's one-time questions (bypass acknowledgement, folder trust, sign-in); it
stops and names them instead.

`cargo test` needs `.cache/desktop-runtime`, which `desktop:prepare` (or a full
`npm run desktop:build`) creates; without it the Tauri build script stops with
"resource path doesn't exist".

**Known flaky test** (upstream code): `handoff.test.mjs`, "accepting a
handoff…" waits 50 ms and sometimes fails under the full suite's load; it passes
on its own. (5a also listed a `quick-actions` failure; that test went with quick
actions in 5b.)

### What 5b removed, and what it kept

- **Service:** the coordinator, quick actions, the voice profile and OpenAI Live
  routes, the mobile gateway with pairing and Tailscale, dictation (local Whisper
  and paid providers), read-aloud, and the `qrcode` dependency. Settings saved by
  those features (`voiceName`, `voiceStyle`, `coordinatorModel`,
  `coordinatorEffort`, `transcribeProvider`) are dropped when settings load.
- **Frontend:** the voice dock and Mak composer, mobile access, dictation, read
  aloud, the phone app, and their CSS.
- **Kept despite the names:** `desktop/service/mobile-transcript.mjs`
  (`ConversationTranscripts`, which the desktop Conversation view reads) and six
  files in `src/mobile/` that the desktop reuses (`SystemEvent`, `BackgroundWork`,
  `ConversationImages`, `ImageViewer`, `workspace-context`, `app-state`).
  `mobile-report-state.mjs` stays: the HTML report preview uses it.
- **The `coordinator` option of `sessions.input`** now only means "pasted and
  submitted by the app" (the Conversation view and handoffs use it). Its
  upstream name is kept.

### What 5c removed, changed and added

- **Card registry:** the sample cards, `workspace/workspace.json`, the
  Workspace React app (home grid, sidebar, top bar, card editor, report viewer,
  3D compare), the service's card and registry routes (`workspace.mjs`,
  `card-documents.mjs`, `card-schema.mjs`), the asset-delivery evidence tool and
  the `three` dependency. `workspace/_shared/` stays: its `report.css` styles the
  image lightbox and HTML previews, and its `help.md` is the Help page
  (rewritten for Exchange).
- **Persona:** `context/`, the sample project, the `workspace-authoring` skill,
  the nose logo and Mr. Mak's own docs (customization, editable cards, macOS,
  sharing, the skills pack, updating, release notes, screenshots), plus
  `setup.sh`, the `.command` launcher and the skills-pack builder.
- **Branding:** product name "Exchange", identifier `com.exchange.shell` (fresh
  app data and window state), window and tray text, user-facing messages,
  `Start Exchange.cmd`, a temporary amber and teal mark (`public/assets/exchange-mark.svg`,
  `src/exchange/ExchangeMark.tsx`) and icons generated from it with
  `tauri icon`; the Chats icon has a teal frame. NSIS is the only bundle target.
  Internal names and protocol strings (the handoff request marker, `.mrmak/`,
  `MRMAK_*`) are unchanged.
- **Workspace window:** `src/exchange/WorkspacePlaceholder.tsx` with the files
  rail. HTML and Markdown previews still work from Files and from chat links.
- **Checks:** `scripts/exchange/check-repo.mjs` (`npm run test:repo`) replaces
  the template, preview and asset checks: the 18 kept skills, empty `.mcp.json`
  and `.env.example` values, bypass off by default, Exchange naming, license
  files. `ui`, `links-ui` and `theme-ui` now open reports from the files rail;
  the card UI suites are gone.
- **Docs:** new `README.md`, `AGENTS.md`, `CLAUDE.md`, getting started, the
  skills index, `SECURITY.md` (reports to this repository) and
  `THIRD_PARTY_NOTICES.md` (fork attribution added; entries for removed samples
  replaced). `LICENSE` and `CHANGELOG.md` (Mr. Mak's history) are unchanged.
- `Setup.ps1` keeps Check, Desktop and Update; Preview went with the browser
  report preview.

### What 5d changed

- **Bypass per chat:** New chat's checkbox starts unchecked every time and the
  choice is not saved; `settings.defaultBypass` and its Settings toggle are gone
  (a saved value is dropped on load). The service bypasses only on an explicit
  `bypass: true` in the request. Resume and handoff keep the chat's own flag
  (decision 8).
- **Badge:** `src/exchange/BypassBadge.tsx`, an amber "BYPASS" pill on the tab,
  in the chat's header, on History and Find-a-chat rows, and as a compact "!" on
  a collapsed group's chip that hides a bypassed tab. The status bar still says
  "Bypass".
- **Agents (decision 7):** `src/exchange/agents.ts` lists Claude Code, Codex,
  Kimi and PowerShell always, and Antigravity and OpenCode only when installed or
  used by an existing chat (New chat, History filters, Settings › Default agent).
- **Kimi Code 2.x bypass:** `--yolo` now means "Ask When Needed"; the full bypass
  is `--auto` ("Never Ask"). `desktop/service/exchange/kimi.mjs` detects `--auto`
  in `kimi --help` and the shell uses it when present, `--yolo` otherwise.
- **Parent Claude Code session markers:** a shell started from inside a Claude
  Code session passed `CLAUDE_CODE_CHILD_SESSION` and other session markers to its
  terminals, which turned off the child's transcript (and so History restore).
  `childEnvironment` now drops the session markers and keeps configuration such
  as `ANTHROPIC_BASE_URL` and `CLAUDE_CONFIG_DIR`.
- **Tests:** `desktop/service/exchange/test/chats-ui.mjs` (in
  `desktop:test:ui` and CI) and `desktop/service/exchange/test/agents.test.mjs`
  (in `npm test`).

**Real-CLI results (2026-10-24, `test-clis.mjs --use-subscription`):**

| CLI | Without bypass | With bypass | Close, reopen from History |
| --- | --- | --- | --- |
| Claude Code 2.1.304 | own prompts | "bypass permissions on" | same native ID; remembered its first reply |
| Codex 0.164.0 | own prompts | "YOLO mode" | same native ID; remembered its first reply |
| Kimi Code 2.3.1 | own prompts | "Never Ask" | not verifiable: the subscription has no Kimi Code access (403) |
| PowerShell 5.1 | runs commands | (no bypass) | reopens as a fresh shell in the same folder |

### 6c: the Exchange core's service in the shell

Needs the core's 6b (`exchange serve`, cire992/3dExchange#18).

- **Starting the core:** `desktop/service/exchange/core.mjs` (`ExchangeCore`) starts
  `<core>\.venv\Scripts\python.exe -m exchange serve --exit-with-stdin` with a per-launch
  token in `EXCHANGE_SERVICE_TOKEN`, and `EXCHANGE_DATA_DIR` when a data folder is set.
  - It waits up to 60 s for the core's ready line and refuses an API version other than 1.
  - Closing the shell closes the core's stdin, so it exits cleanly.
  - A crash while running restarts it once; a failed start waits for Retry.
  - The windows see the status (`off`, `starting`, `ready`, `error`, `stopped`), the message, the
    version and the folders, never the core's URL or token.
- **Settings:** `exchangeCore` (default: `..\3dExchange` beside this repository, when it exists)
  and `exchangeDataDir` (optional; the core's default is `%LOCALAPPDATA%\Exchange`). Settings ›
  Exchange core edits them; saving restarts the service. Only `main.mjs` starts the core
  (`startExchange`), so tests never run Python by accident.
- **Proxy:**
  - `/api/exchange/<route>` is the core's `/api/v1/<route>`. It is behind this service's own token,
    the core's token is added, and the answer is streamed. It is GET only until the write API (6e).
  - `/api/exchange/status` and `POST /api/exchange/restart` are the shell's own.
  - Thumbnails for `<img>` are at `/exchange-images/<per-launch grant>/<uid>` (in bootstrap as
    `exchangeImages`), because an image request cannot carry the token.
- **Types:** `npm run exchange:types [path/to/openapi.json]` generates `src/exchange/api.gen.ts` from
  the core's committed schema (default: `..\3dExchange\docs\api\openapi.json`). It was generated
  from 6b's schema. `src/exchange/api.ts` (`exchangeGet`, `thumbnailUrl`) is the typed client.
  - **Deviation from decision 8 (approved for phase 6):** the plan named `openapi-typescript`, but it
    requires TypeScript 5 and this repository uses 6. The generator is a small dependency-free
    script in `scripts/exchange/`, covering what the core's FastAPI models produce; anything else
    fails loudly.
- **Workspace:** `ServiceStatus` in the placeholder shows the connection and a first look at the
  library through the proxy (assets, environments), with Retry after an error or stop.
- **Tests:**
  - `desktop/service/exchange/test/core.test.mjs`, with a fake core in `fake-core.mjs`: start,
    proxy, token and grant, a settings change, a clean exit with the shell, a crash and its restart,
    an API mismatch, missing folders and `.venv`, and a stop then Retry
  - `workspace-ui.mjs`, in the real UI
- **With the real core:**
  - The 6b worktree (`Desktop\3dExchange-phase6`) with the scratch scan of the real Daz library
    connected in 1.4 s and showed 235,043 assets. A proxied search took 424 ms, about the core's own
    time.
  - On a small library a real 36 KB thumbnail came through the grant path.
  - The user's core checkout (`main`, before 6b) gets "This Exchange core has no "exchange serve"
    yet …".
- **For the user's own core:** after 6b merges, run
  `.venv\Scripts\python -m pip install -e ".[service]"` in the core folder once.

### 7c: the checkpoint before bypassed chats

Needs the core's 7a (`exchange project checkpoint`, cire992/3dExchange#21).

- **When:** before every launch of a bypassed chat, new or resumed (restored at startup, reopened
  from History, Reconnect), whose working folder is inside an Exchange project home: a folder
  with `exchange.project.toml`, found by walking up. Other chats never call the core.
- **How:** `desktop/service/exchange/checkpoint.mjs` runs the core's
  `<core>\.venv\Scripts\python.exe -m exchange project checkpoint --for <folder> --reason
  'bypassed chat: <agent> "<name>"' --json`. It uses the same core folder and data folder as
  the service (the data folder's `projects.toml` holds the git identity for project homes). The
  core commits every change except `.exchange/`, and never makes an empty commit.
- **Wiring:**
  - `Sessions.checkpoint` is the hook the service sets.
  - `create()` and `resume()` call it before `launch()`.
  - Each chat keeps the last result as `checkpoint`: `committed`, `clean`, `skipped`, `failed` or
    `none`, with the project, commit and time.
- **If it fails** (no core folder, no `.venv`, a core older than 7a, git refusing), the chat does not
  start.
  - **New chat:** the service answers 409 with `code: "checkpoint"`, and the dialog shows the reason
    and **Start without checkpoint**.
  - **A resume:** the tab stays open with the reason in the Reconnect bar, and **Reconnect without
    checkpoint**.
  - Starting without one is recorded as `skipped` for that launch only.
- **Tooltips:** a bypassed tab's tooltip names its checkpoint ("Checkpoint 4a10f80 of NJO before
  this launch").
- **Upstream files touched:**
  - `sessions.mjs` (the hook)
  - `server.mjs` (the hook, the resume flag, and the error code)
  - `client.ts` (errors carry `code`)
  - `types.ts`
  - `Chats.tsx` (the two buttons)
  - `ChatTabs.tsx` (the tooltip line)

  The rest is in `desktop/service/exchange/` and `src/exchange/checkpoint.ts`.
- **Tests:**
  - `desktop/service/exchange/test/checkpoint.test.mjs` (6), with a fake core in
    `fake-checkpoint.mjs`
  - `checkpoint-ui.mjs` in the real Chats window (a failed restore and Reconnect without checkpoint,
    New chat refused then Start without checkpoint, a committed checkpoint in the tooltip)
- **With the real core** (the 7b worktree, a scratch project home made by `exchange project init`,
  the scratch data folder; terminals stubbed):
  - a bypassed chat committed the home's new record in 0.9 s
  - a second one found nothing to commit (0.6 s)
  - a chat that was not bypassed, and one outside the home, did not call the core
  - the user's core checkout (before 7a) gets "the Exchange core … is older than Roadmap phase 7a;
    update it".
- **For the user's own project homes:** once 7a is merged and pulled, set the git identity once:
  `exchange project config --git-name … --git-email …` (this machine has no global git identity).

## Known gaps and next candidates

- **Kimi resume is unverified.** Kimi Code 2.x creates its session only on the
  first successful message and no longer prints a session line at startup. The
  upstream ID capture looks for `Session: session_…` on screen, which may not
  match 2.x; `kimi session` can list sessions non-interactively if it needs
  replacing. Check once the Kimi subscription includes Kimi Code.
- Reopening a CLI replays its history; text sent before its input box is live
  can sit unsubmitted. The Conversation view sends only when the user does, so
  this showed up only in the scripted check, which now waits for the screen to
  settle.
- The Workspace placeholder keeps the dark command-deck look in the light theme;
  phase 6 brings the real Workspace.
- `npm ci` reports two high-severity advisories in locked dependencies; not yet
  reviewed.
- `.github/dependabot.yml` still opens weekly pull requests for workflow pins.
