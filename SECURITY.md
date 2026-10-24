# Security reports

Exchange is a personal, single-user tool. Please report suspected
vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/cire992/Exchange-Shell/security/advisories/new)
rather than a public issue. Do not put credentials or personal project content
in a report; remove real tokens, account details and private files from logs or
screenshots.

A vulnerability in code inherited unchanged from Mr. Mak Workspace may also
affect upstream; report it there too, through
[its private reporting](https://github.com/witnesstodark/mr-mak-workspace/security/advisories/new).

## Local service and permissions

Exchange runs on the current user's machine and starts CLI tools as that user.
The CLI's own permission and sandbox settings remain important. Bypass is an
explicit choice for one chat and is off by default. Exchange is not an
operating-system sandbox for programs running under the same account.

The desktop service listens on loopback only. Do not expose it through a public
proxy, tunnel or network interface. Its diagnostic `runtime.json` contains the
process ID and local origin, not the credentials used by the desktop windows.
Keep `.env`, local state and native CLI histories out of shared repositories.
