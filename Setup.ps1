[CmdletBinding()]
param([ValidateSet('Check', 'Desktop', 'Update')][string]$Mode = 'Check', [string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
. (Join-Path $taskRoot 'scripts/update-helpers.ps1')
# Quitting the app terminates its entire managed process tree, including an
# updater launched in its terminal. Reject before building or installing.
if ($Mode -eq 'Update') {
  $taskProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  if ($env:MRMAK_PARENT_PID -or (Test-MakAncestor $taskProcesses $PID)) {
    throw 'Run Setup.ps1 -Mode Update in a separate Windows PowerShell window opened from Start, outside Exchange. Quitting Exchange would stop an updater launched in its chat.'
  }
  if (-not $InstallDirectory) { $InstallDirectory = Get-MakInstallDirectory }
  $InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory)
  if ($InstallDirectory.Contains('"')) { throw 'The installation folder cannot contain quotes.' }
}
Push-Location -LiteralPath $taskRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'exchange-shell.json'))) {
    throw 'Open Setup.ps1 from the complete repository folder.'
  }
  $taskNode = Get-Command node -ErrorAction SilentlyContinue
  $taskNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  $taskCargo = Get-Command cargo -ErrorAction SilentlyContinue
  $taskCodex = Get-Command codex -ErrorAction SilentlyContinue
  $taskClaude = Get-Command claude -ErrorAction SilentlyContinue
  $taskKimi = Get-Command kimi -ErrorAction SilentlyContinue
  Write-Host 'Exchange setup'
  Write-Host ('Node: ' + [bool]$taskNode + ' | npm: ' + [bool]$taskNpm + ' | Rust: ' + [bool]$taskCargo)
  Write-Host ('Codex CLI: ' + [bool]$taskCodex + ' | Claude Code CLI: ' + [bool]$taskClaude + ' | Kimi CLI: ' + [bool]$taskKimi)
  if (-not $taskCodex -and -not $taskClaude -and -not $taskKimi) {
    throw 'Install and configure Claude Code, Codex or Kimi before setting up Exchange. See docs/getting-started.md.'
  }
  if ($Mode -eq 'Check') {
    Write-Host 'Desktop build: .\Setup.ps1 -Mode Desktop'
    Write-Host 'Build, install and restart: .\Setup.ps1 -Mode Update'
    exit 0
  }
  if (-not $taskNode -or -not $taskNpm) { throw 'Install Node.js 22.20 or newer, then reopen PowerShell.' }
  & node -e "const p=process.versions.node.split('.').map(Number);if(p[0]<22||(p[0]===22&&p[1]<20))process.exit(1)"
  if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.20 or newer is required.' }
  if (-not $taskCargo) { throw 'Install stable Rust and the Visual Studio C++ build tools. See docs/getting-started.md.' }
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  & npm.cmd run desktop:build
  if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed. Keep the output and ask your setup agent to inspect it.' }
  $taskBundle = Join-Path $taskRoot 'src-tauri/target/release/bundle/nsis'
  if ($Mode -eq 'Desktop') {
    Write-Host ('Installer ready in ' + $taskBundle)
    Write-Host 'Run the installer, then double-click Start Exchange.cmd.'
    exit 0
  }
  $taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).version
  $taskSetup = Get-ChildItem -LiteralPath $taskBundle -Filter ('*_' + $taskVersion + '_*-setup.exe') |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $taskSetup) { throw ('No ' + $taskVersion + ' installer was found in ' + $taskBundle + '.') }
  # The silent installer closes a running app without asking, and agents may
  # still be working in it. Wait until the owner quits Exchange and its service.
  $taskInstallDirectories = @($InstallDirectory)
  # Include custom installations already running, even if their service takes
  # a moment to exit after the native window disappears. Never kill processes.
  foreach ($taskProcess in @(Get-CimInstance Win32_Process -ErrorAction Stop)) {
    if ((Test-MakAppProcess $taskProcess) -and $taskProcess.ExecutablePath) {
      $taskInstallDirectories += Split-Path -Parent $taskProcess.ExecutablePath
    }
  }
  $taskRunning = {
    return @(Get-MakUpdateProcesses @(Get-CimInstance Win32_Process -ErrorAction Stop) $taskInstallDirectories).Count -gt 0
  }
  if (& $taskRunning) {
    Write-Host 'Finish active agent tasks, then choose Quit from the Exchange tray menu. Setup continues by itself.'
    while (& $taskRunning) { Start-Sleep -Seconds 2 }
  }
  Write-Host ('Installing ' + $taskSetup.Name)
  # NSIS requires /D to be last and unquoted, including paths with spaces.
  $taskInstaller = Start-Process -FilePath $taskSetup.FullName -ArgumentList @('/S', ('/D=' + $InstallDirectory)) -WindowStyle Hidden -Wait -PassThru
  if ($taskInstaller.ExitCode -ne 0) { throw ('The installer stopped with code ' + $taskInstaller.ExitCode + '. Run it from ' + $taskBundle + ' to see its message.') }
  Write-Host 'Installed. Starting Exchange.'
  $taskApp = Join-Path $InstallDirectory 'mrmak-workspace.exe'
  if (-not (Test-Path -LiteralPath $taskApp)) { throw ('The installed app was not found in ' + $InstallDirectory + '. Open the installer to inspect its destination.') }
  Start-Process -FilePath $taskApp -ArgumentList @('--repo', ('"' + $taskRoot + '"')) -WorkingDirectory $taskRoot -WindowStyle Hidden
} finally { Pop-Location }
