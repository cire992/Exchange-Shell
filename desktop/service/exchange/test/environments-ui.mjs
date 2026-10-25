// Environments and scanning in the Workspace (Roadmap phase 6h) in the real UI, against the fake
// core's jobs (fake-jobs.mjs): change notices and Rescan changed, the scan bar with progress and
// Stop, the add-environment wizard (sources, detection, configure, scan), an environment's settings,
// and Apply to library in the lexicon editor. Run after npm run build. Optional: SCREENSHOTS=<folder>.
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../../server.mjs';
import { ExchangeCore } from '../core.mjs';
import { launchBrowser } from '../../test/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const shots = process.env.SCREENSHOTS;
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/exchange-environments-ui-'));
const core = path.join(repo, 'core'); await mkdir(core);
await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, '.mrmak/settings.json'), JSON.stringify({ exchangeCore: core }));
// A folder holding a Daz library, an MO2 instance and loose files, for the wizard to detect.
const assets = path.join(repo, 'Assets');
for (const name of ['Daz Library', 'MO2 Skyrim', 'Loose Stuff']) await mkdir(path.join(assets, name), { recursive: true });
const exchange = new ExchangeCore({ command: ({ core }) => ({ file: process.execPath, args: [path.join(here, 'fake-core.mjs')], cwd: core, env: { FAKE_CORE_LIBRARY: '1' } }) });
const fromCore = async route => (await fetch(new URL(`/api/v1/${route}`, exchange.url), { headers: { authorization: `Bearer ${exchange.token}` } })).json();
let service, browser;
try {
  service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} }, exchange, startExchange: true });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);

  const heading = page.locator('.library-heading');
  const status = page.locator('.library-statusline');
  const sidebar = page.getByRole('navigation', { name: 'Library' });
  const top = page.locator('.library-top');
  const bar = page.getByRole('status', { name: 'Running job' });
  const rescan = top.getByRole('button', { name: /^Rescan/ });
  const add = top.getByRole('button', { name: 'Add environment…' });
  await expect(heading).toContainText('2,300 products and standalone assets');
  await expect(rescan).toHaveText('Rescan');

  // A change the core noticed: the environment is marked, and Rescan changed rescans only it.
  await writeFile(path.join(core, 'changes.json'), '[2]');
  await expect(rescan).toHaveText('Rescan changed (1)');
  await expect(sidebar.getByRole('button', { name: /Loose files.*changed/ })).toBeVisible();
  await expect(status).toHaveText('Changes detected in Loose files · Rescan changed when you’re ready');
  await rescan.click();
  await expect(bar).toContainText('Scanning');
  await expect(bar).toContainText('Phase');
  await expect(add).toBeDisabled();
  await expect(status).toHaveText('Scan finished · 1 environment · 4 products · 1 offline', { timeout: 15000 });
  await expect(bar).toHaveCount(0);
  await expect(rescan).toHaveText('Rescan');
  await expect(sidebar.getByText('changed', { exact: true })).toHaveCount(0);

  // Rescan everything, and stop it: what finished is kept.
  await rescan.click();
  await expect(bar).toBeVisible();
  if (shots) await page.screenshot({ path: path.join(shots, 'environments-scanning.png') });
  await bar.getByRole('button', { name: 'Stop' }).click();
  await expect(status).toHaveText('Stopped; everything finished before that is saved.');
  await expect(bar).toHaveCount(0);

  // The wizard: a folder typed in and a library found on this PC, detected, configured, scanned.
  await add.click();
  const wizard = page.getByRole('dialog', { name: 'Add environments' });
  const found = wizard.getByRole('list', { name: 'Found on this PC' });
  await expect(found.getByRole('checkbox')).toHaveCount(3);
  await expect(found.getByRole('listitem').filter({ hasText: 'My Library' }).getByRole('checkbox')).toBeDisabled(); // already added
  await expect(found.getByRole('listitem').filter({ hasText: 'Half-Life 2' }).getByRole('checkbox')).toBeDisabled(); // no definition
  await found.getByRole('listitem').filter({ hasText: 'Personal Library' }).getByRole('checkbox').check();
  const folderPath = wizard.getByRole('textbox', { name: 'Folder path' });
  await folderPath.fill(path.join(repo, 'Nope'));
  await folderPath.press('Enter');
  await folderPath.fill(assets);
  await wizard.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(wizard.getByRole('list', { name: 'Folders to add' }).getByRole('listitem')).toHaveCount(2);
  await expect(wizard.locator('.library-wizard-foot')).toContainText('3 sources');
  await wizard.getByRole('button', { name: 'Detect' }).click();
  const detected = wizard.getByRole('region', { name: assets });
  await expect(detected).toContainText('holds 3 environments');
  await expect(wizard.getByRole('region', { name: path.join(repo, 'Nope') })).toContainText('not a folder');
  await expect(wizard.getByRole('region', { name: 'Found on this PC' })).toContainText('Personal Library');
  await expect(detected.getByRole('combobox', { name: `Type of ${path.join(assets, 'MO2 Skyrim')}` })).toHaveValue('skyrim_se');
  await detected.getByRole('checkbox', { name: `Add ${path.join(assets, 'Loose Stuff')}` }).uncheck(); // never indexed
  if (shots) await page.screenshot({ path: path.join(shots, 'environments-detect.png') });
  await wizard.getByRole('button', { name: 'Configure' }).click();
  const plans = wizard.getByRole('listbox', { name: 'Environments to add' });
  // The Daz library joins the found one (Daz gathers every content directory); MO2 gets its profile.
  await expect(plans.getByRole('option')).toHaveCount(2);
  await expect(wizard.locator('.library-wizard-foot')).toContainText('2 of 2 ready');
  await plans.getByRole('option', { name: /Skyrim/ }).click();
  const form = wizard.getByRole('region', { name: /Settings of Skyrim/ });
  await expect(form.getByRole('combobox', { name: 'MO2 profile' })).toHaveValue('Default');
  await form.getByRole('textbox', { name: 'Name' }).fill('');
  await expect(wizard.locator('.library-wizard-foot')).toContainText('1 of 2 ready');
  await expect(wizard.getByRole('button', { name: 'Add and scan' })).toBeDisabled();
  await wizard.getByRole('region', { name: /Settings of/ }).getByRole('textbox', { name: 'Name' }).fill('Skyrim');
  await wizard.getByRole('region', { name: /Settings of Skyrim/ }).getByRole('button', { name: 'Publishable' }).click();
  await wizard.getByRole('region', { name: /Settings of Skyrim/ }).getByRole('textbox', { name: /Ignore rules/ }).fill('*.bak');
  if (shots) await page.screenshot({ path: path.join(shots, 'environments-configure.png') });
  await wizard.getByRole('button', { name: 'Add and scan' }).click();
  await expect(wizard.locator('.library-wizard-scanrow')).toHaveCount(2);
  await expect(wizard.getByRole('status')).toContainText('Scan finished · 2 environments', { timeout: 15000 });
  assert.deepEqual(await fromCore('test/excluded'), [path.join(assets, 'Loose Stuff')]);
  await wizard.getByRole('button', { name: 'Done' }).click();
  await expect(wizard).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: /^Skyrim 3$/ })).toBeVisible();

  // An environment's settings, from its menu.
  await sidebar.getByRole('button', { name: /^Skyrim/ }).click({ button: 'right' });
  await page.getByRole('menu', { name: 'Skyrim' }).getByRole('menuitem', { name: 'Settings…' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings of Skyrim' });
  await expect(settings.getByRole('combobox', { name: 'MO2 profile' })).toHaveValue('Default');
  await expect(settings.getByRole('textbox', { name: /Ignore rules/ })).toHaveValue('*.bak');
  await expect(settings.getByRole('button', { name: 'Publishable' })).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('combobox', { name: 'MO2 profile' }).selectOption('Survival');
  await settings.getByRole('textbox', { name: /Ignore rules/ }).fill('*.bak\n*.tmp');
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(status).toHaveText('Saved the settings of Skyrim · ignore rules apply from the next rescan');
  const saved = await fromCore('environments/3');
  assert.deepEqual(saved.user_config, { visibility: 'publishable', mo2_profile: 'Survival', ignore: ['*.bak', '*.tmp'] });

  // Rescan one environment from its menu.
  await sidebar.getByRole('button', { name: /^Skyrim/ }).click({ button: 'right' });
  await page.getByRole('menu', { name: 'Skyrim' }).getByRole('menuitem', { name: 'Rescan Skyrim' }).click();
  await expect(status).toHaveText('Scan finished · 1 environment · 2 products', { timeout: 15000 });

  // Apply to library after a lexicon edit (a category edit regroups too).
  await sidebar.getByRole('button', { name: 'Lexicons' }).click();
  const editor = page.getByRole('region', { name: 'Categories' });
  await editor.getByRole('combobox', { name: 'Value' }).fill('Food');
  await editor.getByRole('textbox', { name: 'Word', exact: true }).fill('pretzel');
  await editor.getByRole('button', { name: 'Add' }).click();
  await expect(editor).toContainText('regroups hand-installed Daz products');
  await editor.getByRole('button', { name: 'Apply to library' }).click();
  await expect(bar).toContainText('Applying lexicon changes and regrouping Daz products');
  await expect(status).toHaveText('Lexicons applied · 4,410 of 5,303 assets tagged', { timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log('Exchange environments UI passed: change notices and Rescan changed, the scan bar and Stop, the add-environment wizard (found and typed sources, detection, a bad folder, configure with problems, scan, an excluded folder), environment settings, a rescan from the menu, and Apply to library.');
} finally { await browser?.close(); await service?.close(); }
