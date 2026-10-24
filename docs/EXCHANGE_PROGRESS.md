# Exchange Shell: progress and handoff

Last updated 2026-10-24, during phase 5a.

This repository is the desktop shell for Exchange, forked from
[Mr. Mak Workspace](https://github.com/witnesstodark/mr-mak-workspace). The
Python core lives in the Exchange repository (`cire992/3dExchange`); its local
path and the other machine-specific paths are in `docs/USEFUL_PATHS.md`, which
is kept out of Git because this repository is public.

Read this first, then these files in the Exchange repository:

- `docs/IDENTITY.md`: what Exchange is for.
- `docs/DESIGN_SPEC.md`: how it works, and the source of truth. Use its terms
  exactly. For this repository the relevant sections are *Workspace and agents*,
  *User interface* and *Architecture* (including *The fork*).
- `docs/PROGRESS.md`: the core's handoff doc, in particular *Design pivot*.

Then this repository's [AGENTS.md](../AGENTS.md) and
[desktop/README.md](../desktop/README.md). Their Mr. Mak rules still apply
until phase 5 replaces them.

## Where we are

**Roadmap phase 5, "Chats online" (goal G3), is in progress.** The plan was
approved on 2026-10-24 with every recommended answer, and question 8 was
answered "keep the upstream behavior" (see Decisions).

Done when the fork runs with tabs for Claude Code, Codex, Kimi and PowerShell,
history restore, and the per-session bypass checkbox with a badge on the tab.

| PR | What | State |
| --- | --- | --- |
| 5a | Foundation: upstream history and remote, this doc, Windows-only CI, the unmodified app built and run on the dev machine | in progress |
| 5b | Remove the voice coordinator, mobile access and in-app speech (OpenAI Live, coordinator, quick actions, pairing, Tailscale, dictation, read-aloud), with their routes, UI, tests, docs and `.env.example` entries | planned |
| 5c | Remove the persona and its card registry; Exchange branding; a placeholder Workspace window under `src/exchange/` | planned |
| 5d | Chats for Exchange: a bypass checkbox that starts unchecked for every new chat, a badge on bypassed tabs and history rows, and checks with the real Claude Code, Codex, Kimi and PowerShell | planned |

The PRs are stacked: each is based on the previous one.

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
  `desktop/service/exchange/`, `docs/EXCHANGE_*.md`) rather than in edits to
  upstream files.
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
   The startup check for `workspace/workspace.json` is replaced by an Exchange
   marker file in 5c. Project homes come in phase 7.
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
- Kimi CLI: not installed yet. Its installer is for the user to run (an agent's
  run of downloaded installer code was blocked). 5d needs it.

Checks, from the repository root:

```powershell
npm ci
npm run lint
npm test
npm run test:template
npm run build
npm run desktop:test:ui
npm run test:preview
cargo test --manifest-path src-tauri/Cargo.toml
```

**Known test failures on this machine** (upstream code, before any Exchange
change):

- `quick-actions.test.mjs`, "reasoning is medium or above…": fails whenever
  Claude Code is installed as a native `.exe`. The test assumes every Windows
  CLI is wrapped in an encoded PowerShell command. CI has no CLIs installed and
  skips that branch. The file is removed with quick actions in 5b.
- `handoff.test.mjs`, "accepting a handoff…": a timing flake. It waits 50 ms and
  sometimes fails under the full suite's load; it passes on its own.

## Known gaps and next candidates

- `npm ci` reports two high-severity advisories in locked dependencies; not yet
  reviewed.
- `.github/dependabot.yml` still opens weekly pull requests for workflow pins.
