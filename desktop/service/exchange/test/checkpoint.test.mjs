// A checkpoint of the project home before each launch of a bypassed chat (Roadmap phase 7c). A fake
// core answers `exchange project checkpoint`; terminals are not started.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sessions } from '../../sessions.mjs';
import { createService } from '../../server.mjs';
import { checkpointCommand, projectHome, takeCheckpoint } from '../checkpoint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const fake = ({ cwd, reason, dataDir }) => ({
  file: process.execPath, args: [path.join(here, 'fake-checkpoint.mjs'), '--for', cwd, '--reason', reason], cwd,
  env: dataDir ? { EXCHANGE_DATA_DIR: dataDir } : {},
});

async function fixture() {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const base = await mkdtemp(path.join(root, '.cache', 'exchange-checkpoint-'));
  const home = path.join(base, 'NJO');
  await mkdir(path.join(home, 'records', 'NPC_'), { recursive: true });
  await writeFile(path.join(home, 'exchange.project.toml'), 'name = "NJO"\nkind = "unreal"\n');
  const outside = path.join(base, 'elsewhere'); await mkdir(outside);
  const core = path.join(base, 'core'); await mkdir(core);
  const mode = value => writeFile(path.join(base, 'checkpoint-mode'), value);
  const calls = async () => (await readFile(path.join(base, 'calls.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { base, home, outside, core, mode, calls };
}

async function sessionsFor(f, t) {
  const sessions = await new Sessions(f.base, path.join(f.base, 'state')).init();
  t.after(() => sessions.close());
  sessions.nativeBoundary = async () => undefined;
  const launched = [];
  sessions.launch = session => { launched.push(session.id); session.status = 'running'; };
  sessions.checkpoint = session => takeCheckpoint({ core: f.core, dataDir: path.join(f.base, 'data'), cwd: session.cwd,
    reason: `bypassed chat: ${session.agent} "${session.name}"`, command: fake });
  return { sessions, launched };
}

test('a project home is found from any folder inside it', async () => {
  const f = await fixture();
  assert.equal(projectHome(path.join(f.home, 'records', 'NPC_')), f.home);
  assert.equal(projectHome(f.home), f.home);
  assert.equal(projectHome(f.outside), null);
  const real = checkpointCommand({ core: f.core, dataDir: 'D:/data', cwd: f.home, reason: 'why' });
  assert.equal(real.file, path.join(f.core, '.venv', 'Scripts', 'python.exe'));
  assert.deepEqual(real.args, ['-m', 'exchange', 'project', 'checkpoint', '--for', f.home, '--reason', 'why', '--json']);
  assert.deepEqual(real.env, { EXCHANGE_DATA_DIR: 'D:/data' });
});

test('a bypassed chat in a project home starts only after its checkpoint', async t => {
  const f = await fixture();
  const { sessions, launched } = await sessionsFor(f, t);
  const chat = await sessions.create({ agent: 'claude', name: 'Docks', cwd: path.join(f.home, 'records'), bypass: true });
  assert.equal(chat.checkpoint.state, 'committed');
  assert.equal(chat.checkpoint.project, f.home);
  assert.equal(launched.length, 1);
  const [call] = await f.calls();
  assert.equal(call.reason, 'bypassed chat: claude "Docks"');
  assert.equal(call.dataDir, path.join(f.base, 'data'), 'the core reads the same data folder as the service');

  // Not bypassed, or outside a project home: no checkpoint (and outside, no core call at all).
  const careful = await sessions.create({ agent: 'claude', name: 'Careful', cwd: f.home });
  assert.equal(careful.checkpoint, null);
  const away = await sessions.create({ agent: 'claude', name: 'Away', cwd: f.outside, bypass: true });
  assert.deepEqual(away.checkpoint, { state: 'none' });
  assert.equal((await f.calls()).length, 1);
  await f.mode('clean');
  const clean = await sessions.create({ agent: 'codex', name: 'Clean', cwd: f.home, bypass: true });
  assert.equal(clean.checkpoint.state, 'clean');
});

test('a failed checkpoint stops the chat until the user starts it without one', async t => {
  const f = await fixture();
  const { sessions, launched } = await sessionsFor(f, t);
  await f.mode('fail');
  await assert.rejects(sessions.create({ agent: 'claude', name: 'Docks', cwd: f.home, bypass: true }), error => {
    assert.equal(error.code, 'checkpoint'); assert.equal(error.status, 409);
    assert.match(error.message, new RegExp(`No checkpoint of the project home .*NJO could be taken before bypassing permission prompts: git has no identity`));
    return true;
  });
  assert.equal(launched.length, 0);
  assert.equal(sessions.list().length, 0, 'the chat is not created');
  const chat = await sessions.create({ agent: 'claude', name: 'Docks', cwd: f.home, bypass: true, skipCheckpoint: true });
  assert.equal(chat.checkpoint.state, 'skipped');
  assert.equal(launched.length, 1);
});

test('resuming a bypassed chat takes a checkpoint too, and a failure keeps the tab with the reason', async t => {
  const f = await fixture();
  const { sessions, launched } = await sessionsFor(f, t);
  const chat = await sessions.create({ agent: 'shell', name: 'Shell', cwd: f.home, bypass: true });
  const session = sessions.get(chat.id);
  session.process = null; session.status = 'stopped';
  await f.mode('old');
  await assert.rejects(sessions.resume(chat.id), /older than Roadmap phase 7a/);
  const stopped = sessions.list().find(item => item.id === chat.id);
  assert.equal(stopped.open, true);
  assert.equal(stopped.checkpoint.state, 'failed');
  assert.match(stopped.restoreError, /older than Roadmap phase 7a/);
  assert.equal(launched.length, 1);
  const resumed = await sessions.resume(chat.id, undefined, { skipCheckpoint: true });
  assert.equal(resumed.checkpoint.state, 'skipped');
  assert.equal(launched.length, 2);
  session.process = null;
  await f.mode('commit');
  assert.equal((await sessions.resume(chat.id)).checkpoint.state, 'committed');
});

test('without a core folder or its Python, the checkpoint fails with why', async () => {
  const f = await fixture();
  await assert.rejects(takeCheckpoint({ core: null, cwd: f.home, reason: 'x' }), /no Exchange core folder is set/);
  await assert.rejects(takeCheckpoint({ core: f.core, cwd: f.home, reason: 'x' }), /no Python environment in/);
  assert.deepEqual(await takeCheckpoint({ core: null, cwd: f.outside, reason: 'x' }), { state: 'none' });
});

test('the service answers a failed checkpoint with 409 and its code', async t => {
  const f = await fixture();
  await mkdir(path.join(f.base, 'ui')); await writeFile(path.join(f.base, 'ui', 'index.html'), '<html></html>');
  await mkdir(path.join(f.base, '.mrmak')); await writeFile(path.join(f.base, '.mrmak', 'settings.json'), JSON.stringify({ exchangeCore: f.core }));
  await f.mode('fail');
  const service = await createService({ repo: f.base, uiDir: path.join(f.base, 'ui'), checkpointCommand: fake });
  t.after(() => service.close());
  const response = await fetch(`${service.origin}/api/sessions`, {
    method: 'POST', headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'claude', name: 'Docks', cwd: f.home, bypass: true }) });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'checkpoint');
  assert.match(body.error, /git has no identity/);
  assert.equal((await f.calls())[0].reason, 'bypassed chat: claude "Docks"');
});
