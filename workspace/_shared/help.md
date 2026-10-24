# Exchange help

Exchange has two windows. **Chats** runs your CLI agents in real terminals.
**Workspace** will become mission control for the library, project homes and
requisitions once the Exchange service has its local API (roadmap phase 6). For
now it shows a placeholder, plus the rail on the right: Files, Skills, MCP,
Settings and this Help.

## Accounts

Chats run the installed CLI with its own login: Claude Code, Codex, Kimi, or the
local PowerShell. Your subscription and plan limits apply; Exchange adds no API
key and makes no paid calls of its own. Sign in to each CLI once in its terminal.

## Chats

1. Press **+** (Ctrl+Shift+T), choose the agent and its working folder, and give
   the chat a clear English name.
2. **Bypass agent permission prompts** removes the agent's own approval prompts
   for that one chat. Exchange cannot sandbox a bypassed agent, so use it
   deliberately.
3. Closing a tab keeps the conversation in **History** (Ctrl+Shift+H). Reopening
   it resumes the same native conversation through the CLI's own session ID.

Claude Code and Codex chats can switch between **Terminal** and
**Conversation**. Conversation shows the transcript with Markdown and images,
and turns CLI permission menus into buttons. Long chats offer a fresh chat with a
handoff summary; the original chat is not changed.

Dropping files or folders into a chat inserts their paths. Pasting a clipboard
image saves it in `inbox/attachments/` and inserts that path. Nothing is uploaded
by Exchange itself.

## Files and previews

**Files** shows this repository's folders; All files shows the wider tree.
Select a file to preview it. HTML and Markdown open in a preview that follows the
Workspace theme; Markdown has **Preview** and **Edit** modes. Links to local
files in a chat open here too.

Within Files, dragging a file to another folder moves it. Delete moves a selected
item to the Windows Recycle Bin. Use Explorer for other filesystem operations.

## Skills and MCP

A **skill** explains how to do a recurring task: decisions, prompts, checks and
sometimes helper scripts. **MCP** connects an agent to a tool or service.
**Skills** lists the project's Claude and Codex skills; **MCP** shows configured
connections and can check whether one is reachable. A reachable server still
needs the agent's own connection and login.

## Useful controls

| Control | Behavior |
| --- | --- |
| Ctrl+Shift+T | New chat |
| Ctrl+Shift+P | Find an open chat |
| Ctrl+Shift+H | History |
| Ctrl+Shift+W | Close the current tab (it stays in History) |
| Ctrl+Tab, Alt+1…9 | Switch tabs |
| Ctrl+C in an agent chat | Copy selected terminal text; it does not interrupt the agent |
| Ctrl+C in PowerShell | Normal shell interrupt |
| Ctrl+V in a chat | Paste text or a clipboard screenshot |
| Ctrl+S while editing Markdown | Save the document |
| Optional Win-key tap | Bring back open Exchange windows; set it in Settings |
| Ctrl+Esc | Open Windows Start |
