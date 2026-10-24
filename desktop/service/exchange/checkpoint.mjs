// A git checkpoint of the project home before each launch of a bypassed chat (Roadmap phase 7c).
//
// A bypassed agent acts without asking, and Exchange cannot sandbox it, so before such a chat
// starts (or resumes) in an Exchange project home, the home's changes are committed. The Exchange
// core does the git work (`exchange project checkpoint --for <folder>`); chats outside a project
// home are not affected. If the checkpoint fails, the chat does not start: the error says why, and
// the user may choose to start it without one.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { corePython } from './core.mjs';

export const MARKER = 'exchange.project.toml';
const TIMEOUT = 60000;

// The project home holding `folder`, or null.
export function projectHome(folder) {
  let current = path.resolve(folder);
  for (;;) {
    if (existsSync(path.join(current, MARKER))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// The command that takes the checkpoint; tests replace it with a fake core.
export function checkpointCommand({ core, dataDir, cwd, reason }) {
  return {
    file: corePython(core),
    args: ['-m', 'exchange', 'project', 'checkpoint', '--for', cwd, '--reason', reason, '--json'],
    cwd: core,
    env: dataDir ? { EXCHANGE_DATA_DIR: dataDir } : {},
  };
}

export class CheckpointError extends Error {
  constructor(message) { super(message); this.status = 409; this.code = 'checkpoint'; }
}

const lastLine = text => text.trim().split(/\r?\n/).filter(Boolean).at(-1)?.replace(/^exchange: error: /, '') || '';

// Commits the project home holding `cwd`. Returns { state: 'none' } outside a project home, else
// { state: 'committed' | 'clean', project, commit, at }; throws a CheckpointError when it cannot.
export async function takeCheckpoint({ core, dataDir, cwd, reason, command = checkpointCommand }) {
  const home = projectHome(cwd);
  if (!home) return { state: 'none' };
  const before = `No checkpoint of the project home ${home} could be taken before bypassing permission prompts`;
  if (!core) throw new CheckpointError(`${before}: no Exchange core folder is set (Settings › Exchange core).`);
  const run = command({ core, dataDir, cwd, reason });
  if (path.isAbsolute(run.file) && !existsSync(run.file)) {
    throw new CheckpointError(`${before}: there is no Python environment in ${path.join(core, '.venv')}.`);
  }
  const { code, stdout, stderr } = await new Promise((resolve, reject) => {
    const child = spawn(run.file, run.args, {
      cwd: run.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...run.env, PYTHONIOENCODING: 'utf-8' },
    });
    let out = '', err = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
    const timer = setTimeout(() => { child.kill(); err += `\ntimed out after ${TIMEOUT / 1000} s`; }, TIMEOUT);
    child.on('error', error => { clearTimeout(timer); reject(new CheckpointError(`${before}: ${error.message}`)); });
    child.on('close', exit => { clearTimeout(timer); resolve({ code: exit, stdout: out, stderr: err }); });
  });
  if (code !== 0) {
    const old = /invalid choice: 'project'/.test(stderr);
    throw new CheckpointError(`${before}: ${old ? `the Exchange core in ${core} is older than Roadmap phase 7a; update it` : lastLine(stderr) || `exit code ${code}`}`);
  }
  let result;
  try { result = JSON.parse(stdout); } catch { throw new CheckpointError(`${before}: the core's answer was not JSON.`); }
  if (!result.project) return { state: 'none' };
  return { state: result.committed ? 'committed' : 'clean', project: result.project, commit: result.commit || null, at: new Date().toISOString() };
}
