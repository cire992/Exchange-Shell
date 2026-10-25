// Requisitions in the Workspace (Roadmap phase 6i) in the real UI, against the fake core's
// requisitions (fake-requisitions.mjs): Settings › Processes (a tool path, installing and trusting
// a package), Settings › Endpoints, Requisition to… (routes, option forms and their problems,
// presets, queueing, Add and run), and the queue (a checkpoint and Resume, rebuild, hold and
// release, removing output, check stale). Run after npm run build. Optional: SCREENSHOTS=<folder>.
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
const repo = await mkdtemp(path.join(root, '.cache/exchange-requisitions-ui-'));
const core = path.join(repo, 'core'); await mkdir(core);
await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, '.mrmak/settings.json'), JSON.stringify({ exchangeCore: core }));
const exchange = new ExchangeCore({ command: ({ core }) => ({ file: process.execPath, args: [path.join(here, 'fake-core.mjs')], cwd: core, env: { FAKE_CORE_LIBRARY: '1' } }) });
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
  const grid = page.getByRole('listbox', { name: 'Assets' });
  const search = page.getByRole('textbox', { name: 'Search the library' });
  const card = name => grid.getByRole('option').filter({ has: page.locator('strong').getByText(name, { exact: true }) });
  const prompt = title => page.getByRole('dialog', { name: title });
  await expect(heading).toContainText('2,300 products and standalone assets');
  await expect(sidebar.getByRole('button', { name: /^Requisitions/ })).toBeVisible();

  // Settings › Processes: Convert mesh needs Blender's path; a package is installed, then trusted.
  await sidebar.getByRole('button', { name: 'Processes' }).click();
  const processes = page.getByRole('listbox', { name: 'Processes' });
  await expect(processes.getByRole('option')).toHaveText(['Copy to another containerReady', 'Convert mesh (Blender)Needs setup']);
  await processes.getByRole('option', { name: /Convert mesh/ }).click();
  const convert = page.getByRole('region', { name: 'Convert mesh (Blender)' });
  await expect(convert.getByRole('region', { name: 'Prerequisites' })).toContainText('not found; set it with: exchange tools set blender PATH');
  await expect(convert.getByRole('region', { name: 'Options' })).toContainText('choice: glb, obj, fbx');
  await convert.getByRole('button', { name: 'Set path…' }).click();
  await prompt('Where is Blender?').getByRole('textbox').fill('C:\\Blender\\blender.exe');
  await prompt('Where is Blender?').getByRole('button', { name: 'Set' }).click();
  await expect(status).toHaveText('Blender set');
  await expect(processes.getByRole('option', { name: /Convert mesh/ })).toContainText('Ready');
  await processes.getByRole('button', { name: 'Install a package…' }).click();
  await prompt('Install a process package').getByRole('textbox').fill('C:\\Packages\\stamp_images');
  await prompt('Install a process package').getByRole('button', { name: 'Install' }).click();
  await expect(status).toHaveText('Installed; trust it to use it');
  const stamp = page.getByRole('region', { name: 'Stamp images' });
  await expect(stamp).toContainText('Not trusted: it will not run until you trust it.');
  await stamp.getByRole('button', { name: 'Trust this package…' }).click();
  await expect(prompt('Trust Stamp images?')).toContainText('A process runs its own code. Trust it?');
  await prompt('Trust Stamp images?').getByRole('button', { name: 'Trust' }).click();
  await expect(status).toHaveText('Stamp images is trusted');
  await expect(processes.getByRole('option', { name: /Stamp images/ })).toContainText('Ready');
  if (shots) await page.screenshot({ path: path.join(shots, 'requisitions-processes.png') });

  // Settings › Endpoints: a folder of one's own, visibility, and back to the default.
  await sidebar.getByRole('button', { name: 'Endpoints' }).click();
  const loose = page.getByRole('row', { name: 'Loose files' });
  await expect(loose).toContainText('E:/Sketchfab/Exchange Conversions');
  await loose.getByRole('button', { name: 'Change…' }).click();
  await prompt('Where requisitions write in Loose files').getByRole('textbox').fill('E:/Out');
  await prompt('Where requisitions write in Loose files').getByRole('button', { name: 'Use it' }).click();
  await expect(status).toHaveText('Loose files writes to E:/Out');
  await expect(loose).toContainText('E:/Out');
  await loose.getByRole('button', { name: 'Publishable' }).click();
  await expect(status).toHaveText('Loose files is publishable');
  await loose.getByRole('button', { name: 'Use the default' }).click();
  await expect(loose).toContainText('E:/Sketchfab/Exchange Conversions');

  // Requisition to…: a mesh into the Daz environment, with options, their problems and presets.
  await search.fill('prop 0007');
  await expect(heading).toContainText('1 asset matching');
  await card('Prop 0007').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Requisition to…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Requisition to' });
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Requisition Prop 0007 to…');
  await expect(dialog.getByRole('combobox', { name: 'Environment' })).toHaveValue('1');
  await expect(dialog.getByRole('combobox', { name: 'Route' }).locator('option')).toHaveText(['Automatic: the best route for each asset', 'Convert mesh (Blender)']);
  const plan = dialog.getByRole('region', { name: 'Plan' });
  await expect(plan.getByRole('row', { name: /Prop 0007/ })).toContainText('Convert mesh (Blender)');
  const options = dialog.getByRole('region', { name: 'Options' });
  await expect(options.getByRole('combobox', { name: 'Format' })).toHaveValue('glb');
  await options.getByRole('spinbutton', { name: 'Scale' }).fill('500');
  await expect(plan.getByRole('row', { name: /Prop 0007/ })).toContainText('scale must be between 0.01 and 100');
  await expect(dialog.getByRole('button', { name: 'Add to queue' })).toBeDisabled();
  await options.getByRole('spinbutton', { name: 'Scale' }).fill('2');
  await expect(dialog.getByRole('button', { name: 'Add to queue (1)' })).toBeEnabled();
  await dialog.getByRole('combobox', { name: 'Options' }).selectOption('Shipped OBJ');
  await expect(options.getByRole('combobox', { name: 'Format' })).toHaveValue('obj');
  await options.getByRole('spinbutton', { name: 'Scale' }).fill('3');
  await options.getByRole('button', { name: 'Save these options as a preset…' }).click();
  await prompt('Save as preset').getByRole('textbox').fill('OBJ x3');
  await prompt('Save as preset').getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Options' })).toHaveValue('OBJ x3');
  await expect(options.getByRole('spinbutton', { name: 'Scale' })).toHaveValue('3');
  if (shots) await page.screenshot({ path: path.join(shots, 'requisitions-dialog.png') });
  await dialog.getByRole('button', { name: 'Add to queue (1)' }).click();
  await expect(status).toHaveText('Queued 1 requisition · run it from Requisitions');
  await expect(sidebar.getByRole('button', { name: /^Requisitions 1$/ })).toBeVisible();

  // A product with nothing that converts there says so.
  await search.fill('outfit 001');
  await card('Outfit 001').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Requisition to…' }).click();
  await dialog.getByRole('combobox', { name: 'Environment' }).selectOption('2');
  await expect(dialog.getByRole('list', { name: 'Warnings' })).toContainText('nothing here can be requisitioned to this environment');
  await expect(plan.locator('tbody tr')).toHaveCount(10);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // A requisition that stops at a checkpoint; Add and run runs the whole queue.
  await search.fill('prop 0014');
  await card('Prop 0014').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Requisition to…' }).click();
  await dialog.getByRole('region', { name: 'Options' }).getByRole('textbox', { name: 'Note' }).fill('review');
  await expect(dialog.getByRole('button', { name: 'Add to queue (1)' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Add and run' }).click();
  await expect(page.getByRole('status', { name: 'Running job' })).toContainText('Prop 0007');
  await expect(status).toHaveText('Queue finished · 1 fulfilled, 1 needs attention', { timeout: 15000 });

  // The queue: Resume after the checkpoint, rebuild, hold and release, remove output, check stale.
  await sidebar.getByRole('button', { name: /^Requisitions/ }).click();
  const queue = page.locator('.library-queue');
  const row = name => queue.getByRole('row').filter({ hasText: name });
  await expect(row('Prop 0014')).toContainText('Needs attention');
  await row('Prop 0014').click();
  const detail = page.getByRole('complementary', { name: 'Requisition' });
  await expect(detail).toContainText('Checkpoint: look at the output, then Resume');
  await queue.getByRole('button', { name: 'Resume ▾' }).click();
  await page.getByRole('menu', { name: 'Resume' }).getByRole('menuitem', { name: 'Resume, overwriting' }).click();
  await expect(status).toHaveText('Queued again · Run queue to continue');
  await expect(row('Prop 0014')).toContainText('Queued');
  if (shots) await page.screenshot({ path: path.join(shots, 'requisitions-queue.png') });
  await queue.getByRole('button', { name: 'Run queue' }).click();
  await expect(status).toHaveText('Queue finished · 1 fulfilled', { timeout: 15000 });
  await expect(row('Prop 0014')).toContainText('Fulfilled');
  await expect(detail).toContainText('Files written1');
  await row('Prop 0007').click();
  await queue.getByRole('button', { name: 'Rebuild' }).click();
  await expect(status).toHaveText('Rebuild queued · Run queue to run it');
  await expect(row('Prop 0007').first()).toContainText('Queued');
  await queue.getByRole('button', { name: 'Hold' }).click();
  await expect(row('Prop 0007').first()).toContainText('Held');
  await queue.getByRole('button', { name: 'Release' }).click();
  await expect(row('Prop 0007').first()).toContainText('Queued');
  await row('Prop 0014').click();
  await queue.getByRole('button', { name: 'Remove output…' }).click();
  await prompt('Remove its output?').getByRole('button', { name: 'Remove output' }).click();
  await expect(status).toHaveText('Output removed: its files are in the recycle folder', { timeout: 15000 });
  await expect(row('Prop 0014')).toContainText('Removed');
  await queue.getByRole('button', { name: 'Check stale' }).click();
  await expect(status).toHaveText('Nothing is stale');
  await expect(sidebar.getByRole('button', { name: /^Requisitions 1$/ })).toBeVisible(); // the rebuild waits
  assert.deepEqual(errors, []);
  console.log('Exchange requisitions UI passed: Settings › Processes (tool path, install, trust), Settings › Endpoints, Requisition to… (routes, option problems, presets, a product with nothing to convert, queue, Add and run), and the queue (checkpoint and Resume, rebuild, hold and release, remove output, check stale).');
} finally { await browser?.close(); await service?.close(); }
