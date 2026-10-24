@echo off
setlocal
set "MRMAK_LAUNCH_ROOT=%~dp0"
if exist "%LOCALAPPDATA%\Exchange\mrmak-workspace.exe" (
  start "" "%LOCALAPPDATA%\Exchange\mrmak-workspace.exe" --repo "%MRMAK_LAUNCH_ROOT%."
  exit /b 0
)
if exist "%MRMAK_LAUNCH_ROOT%src-tauri\target\release\mrmak-workspace.exe" (
  start "" "%MRMAK_LAUNCH_ROOT%src-tauri\target\release\mrmak-workspace.exe" --repo "%MRMAK_LAUNCH_ROOT%."
  exit /b 0
)
echo Exchange is not built yet. Build it with:
echo   powershell -NoProfile -ExecutionPolicy Bypass -File Setup.ps1 -Mode Desktop
echo See docs\getting-started.md for setup.
pause
