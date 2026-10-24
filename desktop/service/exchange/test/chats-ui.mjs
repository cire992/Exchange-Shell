// Exchange's Chats rules in the real Chats window: bypass is chosen per chat
// and never remembered, bypassed chats carry a badge everywhere they appear,
// and only installed optional CLIs are offered. Terminals are fakes; no user
// chats, settings or logins are touched. Run after npm run build.
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../../server.mjs';
import { launchBrowser } from '../../test/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/exchange-chats-ui-'));
const chat = (id, name, bypass, group, tabOrder) => ({ id, name, bypass, group, tabOrder, agent: 'claude', cwd: repo, nativeId: null, hasConversation: false, open: true, pinned: false, status: 'stopped', createdAt: '2026-10-24T08:00:00Z', updatedAt: `2026-10-24T08:0${tabOrder}:00Z`, cols: 80, rows: 24 });
await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, '.mrmak/sessions.json'), JSON.stringify([
  chat('careful', 'Careful chat', false, null, 0),
  chat('bypassed', 'Bypassed chat', true, null, 1),
  chat('grouped', 'Grouped bypass', true, 'Pipeline', 2),
  chat('grouped-safe', 'Grouped safe', false, 'Pipeline', 3),
]));
// A saved bypass default from upstream Mr. Mak must not survive or apply.
await writeFile(path.join(repo, '.mrmak/settings.json'), JSON.stringify({ defaultAgent: 'claude', defaultBypass: true, selectedId: 'careful' }));
let service, browser;
try {
  service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} } });
  const created = [];
  service.sessions.launch = session => {
    created.push({ id: session.id, agent: session.agent, bypass: session.bypass });
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
  const badge = '.bypass-badge';

  // The remembered default is dropped when settings load.
  const bootstrap = await (await fetch(`${service.origin}/api/bootstrap`, { headers: { Authorization: `Bearer ${service.token}` } })).json();
  assert.equal('defaultBypass' in bootstrap.settings, false);

  // Badges: on bypassed tabs only, in the chat header, and on a collapsed group's chip.
  await tab('Careful chat').waitFor();
  assert.equal(await tab('Careful chat').locator(badge).count(), 0);
  await expect(tab('Bypassed chat').locator(badge)).toHaveText('Bypass');
  await expect(tab('Bypassed chat').getByRole('tab')).toHaveAttribute('aria-label', /permission prompts bypassed/);
  assert.equal(await page.locator('.chat-context .bypass-badge').count(), 0);
  await tab('Bypassed chat').getByRole('tab').click();
  await expect(page.locator('.chat-context .bypass-badge')).toBeVisible();
  await tab('Careful chat').getByRole('tab').click();
  const chip = page.locator('.chat-tab-group[data-chat-group="Pipeline"] .chat-group-chip');
  assert.equal(await chip.locator(badge).count(), 0, 'An expanded group shows the badge on the tab itself');
  await chip.click();
  await expect(chip.locator('.bypass-badge.compact')).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', /includes bypassed chats/);
  await chip.click();

  // History rows carry the badge.
  await page.getByRole('button', { name: 'History' }).click();
  const row = name => page.locator('.history-item').filter({ hasText: name }).first();
  await expect(row('Bypassed chat').locator(badge)).toBeVisible();
  assert.equal(await row('Careful chat').locator(badge).count(), 0);
  await page.getByRole('button', { name: 'Close history' }).click();

  // Only installed optional CLIs are offered; Exchange's four are always listed.
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  const offered = await page.locator('.desk-dialog .agent-choice').evaluateAll(nodes => nodes.map(node => node.firstElementChild?.nextElementSibling?.firstChild?.textContent));
  for (const agent of bootstrap.agents) {
    const optional = ['antigravity', 'opencode'].includes(agent.id);
    assert.equal(offered.includes(agent.label), !optional || agent.available, `${agent.label} ${agent.available ? 'installed' : 'not installed'}`);
  }

  // New chat starts unchecked, sends the choice with the request only, and
  // starts unchecked again next time.
  const box = page.getByRole('checkbox', { name: /Bypass agent permission prompts/ });
  await page.locator('.desk-dialog .agent-choice').filter({ hasText: 'Claude Code' }).click();
  await expect(box).not.toBeChecked();
  await box.check();
  const settingsPosts = [];
  page.on('request', request => { if (request.url().endsWith('/api/settings') && request.method() === 'POST') settingsPosts.push(request.postDataJSON()); });
  await page.locator('.desk-dialog input[placeholder*="Dream Game"]').fill('Fresh bypass');
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(tab('Fresh bypass').locator(badge)).toBeVisible();
  assert.deepEqual(created.at(-1), { id: created.at(-1).id, agent: 'claude', bypass: true });
  assert.ok(settingsPosts.every(body => !('defaultBypass' in body)), 'The bypass choice must not be saved as a setting');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.locator('.desk-dialog .agent-choice').filter({ hasText: 'Claude Code' }).click();
  await expect(page.getByRole('checkbox', { name: /Bypass agent permission prompts/ })).not.toBeChecked();
  await page.locator('.desk-dialog input[placeholder*="Dream Game"]').fill('Fresh careful');
  await page.getByRole('button', { name: 'Open chat' }).click();
  await tab('Fresh careful').waitFor();
  assert.equal(created.at(-1).bypass, false);
  assert.equal(await tab('Fresh careful').locator(badge).count(), 0);

  // A request without an explicit true never bypasses, whatever was saved before.
  const response = await fetch(`${service.origin}/api/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: 'claude', name: 'Api default', cwd: repo }) });
  assert.equal(response.status, 201); assert.equal((await response.json()).bypass, false);
  await service.close(); service = null;
  const saved = JSON.parse(await readFile(path.join(repo, '.mrmak/settings.json'), 'utf8'));
  assert.equal('defaultBypass' in saved, false);
  assert.deepEqual(errors, []);
  console.log(`Exchange Chats UI passed: bypass unchecked per chat and not remembered; badges on tabs, header, collapsed group and History; New chat offers ${offered.join(', ')}.`);
} finally { await browser?.close(); await service?.close(); }
