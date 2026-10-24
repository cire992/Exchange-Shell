import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { promisify } from 'node:util';
import { commandPath, wrapCommand } from '../agents.mjs';

// Kimi Code 2.x split permission modes: --yolo now still asks for risky actions,
// and --auto ("Never Ask") is the full bypass. The older Python kimi-cli only
// has --yolo, which there meant no prompts. Checked once per installed binary.
const help = new Map();
export function kimiSupportsAuto(env = process.env) {
  const file = commandPath('kimi', env);
  if (!file) return Promise.resolve(false);
  let key = file;
  try { key += `:${statSync(file).mtimeMs}`; } catch { /* A bare command name is checked once. */ }
  if (!help.has(key)) {
    const command = wrapCommand(file, ['--help']);
    help.set(key, promisify(execFile)(command.file, command.args, { env, windowsHide: true, timeout: 15000, maxBuffer: 512000 }).then(result => /^\s*--auto\b/m.test(result.stdout), () => false));
  }
  return help.get(key);
}
