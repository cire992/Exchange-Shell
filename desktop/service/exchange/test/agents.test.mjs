// Exchange's changes to how chats launch: Kimi's full bypass flag and the parent
// Claude Code session markers a child terminal must not inherit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { childEnvironment, terminalCommand } from '../../agents.mjs';

// A wrapped .cmd launch carries its arguments in an encoded PowerShell command.
const launched = command => command.args.includes('-EncodedCommand')
  ? Buffer.from(command.args.at(-1), 'base64').toString('utf16le') : command.args.join(' ');

test('Kimi bypass uses --auto where supported and --yolo otherwise; no flag without bypass', async () => {
  const bin = await mkdtemp(path.join(os.tmpdir(), 'exchange-kimi-'));
  await writeFile(path.join(bin, process.platform === 'win32' ? 'kimi.cmd' : 'kimi'), '', { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = bin;
  try {
    const full = launched(terminalCommand('kimi', { bypass: true, kimiAuto: true }));
    assert.match(full, /--auto\b/); assert.doesNotMatch(full, /--yolo/);
    const legacy = launched(terminalCommand('kimi', { bypass: true }));
    assert.match(legacy, /--yolo\b/); assert.doesNotMatch(legacy, /--auto/);
    const careful = launched(terminalCommand('kimi', { bypass: false, kimiAuto: true }));
    assert.doesNotMatch(careful, /--auto|--yolo/);
    assert.match(launched(terminalCommand('kimi', { resumeId: 'session_11111111-1111-4111-8111-111111111111' })), /--session'? '?session_11111111/);
  } finally { process.env.PATH = previous; }
});

test('child terminals drop a parent Claude Code session but keep configuration', () => {
  const markers = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_HOST_SESSION_ID', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_PID'];
  const kept = { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000', CLAUDE_CONFIG_DIR: 'C:\\claude-config', ANTHROPIC_BASE_URL: 'https://proxy.example' };
  const saved = Object.fromEntries([...markers, ...Object.keys(kept)].map(name => [name, process.env[name]]));
  try {
    for (const name of markers) process.env[name] = 'parent-session';
    Object.assign(process.env, kept);
    const env = childEnvironment();
    for (const name of markers) assert.equal(env[name], undefined, `${name} must not reach a child terminal`);
    for (const [name, value] of Object.entries(kept)) assert.equal(env[name], value, `${name} is the user's configuration`);
  } finally {
    for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
