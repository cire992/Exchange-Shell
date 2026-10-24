# Getting started

Exchange's desktop shell runs on Windows. Its chats are ordinary CLI sessions
started with your own accounts, and its files are ordinary repository files, so
you can keep using the same agents outside the app.

## Prerequisites

- **Node.js 22.20 or newer** and npm.
- **Rust** (stable, MSVC toolchain) and
  [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows):
  the Microsoft C++ Build Tools and WebView2.
- **At least one CLI agent**, installed and signed in with your own account:
  - [Claude Code](https://code.claude.com/docs/en/setup)
  - [Codex CLI](https://developers.openai.com/codex/cli) (`npm install -g @openai/codex`)
  - [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code). It needs
    [Git for Windows](https://gitforwindows.org/), whose Git Bash it uses as its
    shell, and a Kimi plan that includes Kimi Code; otherwise every turn ends
    with a 403 error.

PowerShell chats need nothing extra. OpenCode and Antigravity, supported by the
upstream code, also work when installed.

`Setup.ps1 -Mode Check` reports what is installed:

```powershell
powershell -ExecutionPolicy Bypass -File .\Setup.ps1 -Mode Check
```

## Build and run

```powershell
powershell -ExecutionPolicy Bypass -File .\Setup.ps1 -Mode Desktop
```

Desktop installs dependencies (`npm ci`) and runs `npm run desktop:build`. That
builds the app in `src-tauri/target/release/` and an installer in
`src-tauri/target/release/bundle/nsis/`. It installs and restarts nothing.

Then double-click **Start Exchange.cmd** in this folder. It starts the installed
app if there is one, otherwise the build in `src-tauri/target/release/`, with
this repository as its root. The shell recognizes the root by
`exchange-shell.json` and remembers it. Workspace and Chats open as separate
windows with separate taskbar buttons.

To build, install and restart in one step, run Update from a separate Windows
PowerShell window opened from Start, outside Exchange:

```powershell
powershell -ExecutionPolicy Bypass -File .\Setup.ps1 -Mode Update
```

Update waits for you to quit Exchange from its tray menu, installs the build
silently and opens this repository again. It never terminates your chats itself;
finish active work before quitting.

## Your first chat

In Chats, press **+**, choose an agent and a working folder, and give the chat a
clear English name. The CLI's normal permission prompts are on; **Bypass agent
permission prompts** is a deliberate choice for one chat, never remembered for
the next one. A bypassed chat carries an amber **BYPASS** badge on its tab, in its
header and in History. The first bypassed Claude Code chat asks you to accept
Claude's own Bypass Permissions warning once. New Claude Code and Codex chats
default to `xhigh` reasoning effort.

Claude Code can use a Claude Pro or Max login, and Codex an eligible ChatGPT
login. Exchange starts the real installed CLI and keeps its normal authentication
and limits; it adds no API keys of its own. See
[Claude authentication](https://code.claude.com/docs/en/authentication) and
[Codex authentication](https://developers.openai.com/codex/auth).

Closing a tab keeps the conversation in History. Reopening it resumes the native
conversation, which relies on that CLI's own session files.

## Development checks

The commands and test suites are listed in
[desktop/README.md](../desktop/README.md#checks). `npm run test:repo` checks
the repository itself: kept skills, safe defaults and Exchange naming.

## On another computer

Clone the repository, build the app and sign in to your CLIs again. Recreate
`.env` and `docs/USEFUL_PATHS.md` locally; both stay out of Git. Credentials,
local app state and native CLI histories do not travel with the repository, so
conversations whose history exists only on the previous computer cannot be
resumed.
