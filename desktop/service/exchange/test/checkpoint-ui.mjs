// The checkpoint before a bypassed chat (Roadmap phase 7c) in the real Chats window: a failed
// checkpoint stops New chat with its reason and offers Start without checkpoint; a restored
// bypassed chat whose checkpoint fails offers Reconnect without checkpoint; tab tooltips name the
// checkpoint. A fake core answers; terminals are fakes. Run after npm run build.
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../../server.mjs';
import { launchBrowser } from '../../test/browser.mjs';
import { standInClis } from './stand-in-clis.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/exchange-checkpoint-ui-'));
const home = path.join(repo, 'NJO');
await mkdir(home, { recursive: true });
await writeFile(path.join(home, 'exchange.project.toml'), 'name = "NJO"\nkind = "unreal"\n');
const core = path.join(repo, 'core'); await mkdir(core);
const mode = value => writeFile(path.join(repo, 'checkpoint-mode'), value);
const calls = async () => (await readFile(path.join(repo, 'calls.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
const fake = ({ cwd, reason }) => ({ file: process.execPath, args: [path.join(here, 'fake-checkpoint.mjs'), '--for', cwd, '--reason', reason], cwd, env: {} });
await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, '.mrmak/sessions.json'), JSON.stringify([{ id: 'saved', name: 'Saved bypass', bypass: true, group: null, tabOrder: 0, agent: 'claude', cwd: home, nativeId: null, hasConversation: false, open: true, pinned: false, status: 'stopped', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastInputAt: null, lastOutputAt: null, cols: 90, rows: 32, attention: false, activity: 'idle', unread: false, completionVersion: 0, tabColor: null }]));
await writeFile(path.join(repo, '.mrmak/settings.json'), JSON.stringify({ defaultAgent: 'claude', selectedId: 'saved', exchangeCore: core }));
await mode('fail');
await standInClis(path.join(repo, 'stand-in-clis')); // New chat picks Claude Code
let service, browser;
try {
  service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} }, restoreSessions: true, checkpointCommand: fake });
  const created = [];
  service.sessions.launch = session => {
    created.push({ id: session.id, name: session.name, checkpoint: session.checkpoint?.state });
    session.status = 'running'; session.restoreError = null;
    session.process = { resize() {}, write() {}, onExit() { return { dispose() {} }; }, kill() { session.process = null; session.status = 'stopped'; } };
    service.sessions.changed(session);
  };
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.chats);
  const tab = name => page.locator('.chat-tab').filter({ hasText: name }).first();

  // Restoring the saved bypassed chat fails its checkpoint: the reason and both choices show.
  const bar = page.locator('.terminal-reconnect');
  await expect(bar).toContainText('No checkpoint of the project home');
  await expect(bar).toContainText('git has no identity');
  await expect(bar.getByRole('button', { name: 'Reconnect without checkpoint' })).toBeVisible();
  assert.equal(created.length, 0);
  await bar.getByRole('button', { name: 'Reconnect without checkpoint' }).click();
  await expect(bar).toHaveCount(0);
  assert.deepEqual(created.at(-1), { id: 'saved', name: 'Saved bypass', checkpoint: 'skipped' });
  await expect(tab('Saved bypass').getByRole('tab')).toHaveAttribute('title', /Started without a checkpoint of its project home/);

  // New chat in the project home with bypass: refused with the reason, then started without one.
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.locator('.desk-dialog .agent-choice').filter({ hasText: 'Claude Code' }).click();
  await page.locator('.desk-dialog input[placeholder*="Dream Game"]').fill('Docks bypass');
  await page.getByLabel('Working folder').fill(home);
  await page.getByRole('checkbox', { name: /Bypass agent permission prompts/ }).check();
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.locator('.desk-dialog [role="alert"]')).toContainText('git has no identity');
  assert.equal(created.length, 1, 'the chat did not start');
  await page.getByRole('button', { name: 'Start without checkpoint' }).click();
  await tab('Docks bypass').waitFor();
  assert.equal(created.at(-1).checkpoint, 'skipped');

  // With the checkpoint working, the chat opens straight away and its tab names the commit.
  await mode('commit');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.locator('.desk-dialog .agent-choice').filter({ hasText: 'Claude Code' }).click();
  await page.locator('.desk-dialog input[placeholder*="Dream Game"]').fill('Docks checkpointed');
  await page.getByLabel('Working folder').fill(home);
  await page.getByRole('checkbox', { name: /Bypass agent permission prompts/ }).check();
  await page.getByRole('button', { name: 'Open chat' }).click();
  await tab('Docks checkpointed').waitFor();
  assert.equal(created.at(-1).checkpoint, 'committed');
  await expect(tab('Docks checkpointed').getByRole('tab')).toHaveAttribute('title', /Checkpoint c0ffee0 of NJO before this launch/);
  assert.equal(await calls(), 3, 'the restore, the refused New chat and the last one; never the skipped ones');
  assert.deepEqual(errors, []);
  console.log('Exchange checkpoint UI passed: a failed checkpoint stops New chat and restore with the reason; Start/Reconnect without checkpoint; the tab names the checkpoint.');
} finally { await browser?.close(); await service?.close(); }
