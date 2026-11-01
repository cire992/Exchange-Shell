// Claims in the Workspace (R5) in the real UI, against the fake core's claims (fake-claims.mjs): the
// sidebar's count, the Claims view with its gauge and whose turn, the filters, a claim's detail,
// closing one, a claim moving on its own, and a file that can't be read. Run after npm run build.
// Optional: SCREENSHOTS=<folder>.
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
const repo = await mkdtemp(path.join(root, '.cache/exchange-claims-ui-'));
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
  const prompt = title => page.getByRole('dialog', { name: title });
  const filters = page.getByRole('group', { name: 'Show' });
  const row = name => page.getByRole('row').filter({ hasText: name });
  const detail = page.getByRole('complementary', { name: 'Claim', exact: true });

  // The sidebar leads with Claims, counting what waits on you.
  await expect(sidebar.getByRole('button').first()).toHaveText(/^Claims/);
  await expect(sidebar.getByRole('button', { name: 'Claims 2' })).toBeVisible();
  await sidebar.getByRole('button', { name: /^Claims/ }).click();
  await expect(heading).toContainText('2 claims waiting on you');

  // One row per open claim: gauge, whose turn, what's next. Closed ones wait for All.
  await expect(row('Prop 0007')).toContainText('Your turn');
  await expect(row('Prop 0007')).toContainText('Close it, or take it into play');
  await expect(row('Prop 0007').getByRole('img')).toHaveAccessibleName('Milestone: Installed');
  await expect(row('Prop 0007').locator('.library-gauge i.on')).toHaveCount(4);
  await expect(row('Prop 0007').locator('.library-gauge i.yours')).toHaveCount(1); // In play stays the user's
  await expect(row('Prop 0014')).toContainText('Exchange is on it');
  await expect(row('Prop 0014').locator('.library-gauge i.on')).toHaveCount(2);
  await expect(row('Outfit 004')).toContainText('as g8f_character');
  await expect(row('Outfit 004')).toContainText('To build');
  await expect(row('Outfit 004')).toContainText('No path yet: a process has to be built');
  await expect(row('Dwarf Helmet')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: '2026-10-28-broken.md' })).toBeVisible();
  if (shots) await page.screenshot({ path: path.join(shots, 'claims.png') });

  // Filters, with their counts.
  await expect(filters.getByRole('button', { name: 'Open 4' })).toHaveAttribute('aria-pressed', 'true');
  await filters.getByRole('button', { name: 'Waiting on you 2' }).click();
  await expect(row('Prop 0020')).toBeVisible();
  await expect(row('Prop 0014')).toHaveCount(0);
  await expect(row('Outfit 004')).toHaveCount(0);
  await filters.getByRole('button', { name: 'All 5' }).click();
  await expect(row('Dwarf Helmet')).toContainText('Closed 2026-10-30');

  // A claim's detail: its path, notes and requisitions, one of them gone.
  await row('Dwarf Helmet').click();
  await expect(detail).toContainText('2 requisitions');
  await expect(detail).toContainText('Requisition 3');
  await expect(detail).toContainText('req-gone: no longer in the library');
  await expect(detail.getByRole('button', { name: 'Close…' })).toHaveCount(0);
  await row('Prop 0007').click();
  await expect(detail).toContainText('convert_mesh');
  await expect(detail).toContainText('For the cantina.');
  await expect(detail).toContainText('The place’s default');
  await row('Outfit 004').click();
  await expect(detail).toContainText('no process takes it to Daz Studio as g8f_character');

  // A claim moves on its own: the view and the count follow, with no click.
  await filters.getByRole('button', { name: /^Open/ }).click();
  await expect(row('Prop 0014')).toContainText('Exchange is on it');
  const moved = await page.evaluate(() => fetch('/api/exchange/test/claims/move', { method: 'POST', body: '{}',
    headers: { Authorization: `Bearer ${sessionStorage.getItem('mrmak.token')}`, 'Content-Type': 'application/json' } }).then(response => response.status));
  assert.equal(moved, 200);
  await expect(row('Prop 0014')).toContainText('Close it, or take it into play');
  await expect(row('Prop 0014').locator('.library-gauge i.on')).toHaveCount(4);
  await expect(sidebar.getByRole('button', { name: 'Claims 3' })).toBeVisible();

  // Closing: a reason is optional, goes into the notes, and the row leaves Open.
  await row('Prop 0007').click();
  await detail.getByRole('button', { name: 'Close…' }).click();
  const closing = prompt('Close the claim on Prop 0007?');
  await expect(closing).toContainText('It keeps its milestone and leaves the open list.');
  await closing.getByRole('textbox').fill('Landed.');
  await closing.getByRole('button', { name: 'Close claim' }).click();
  await expect(status).toHaveText('Closed the claim on Prop 0007');
  await expect(row('Prop 0007')).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: 'Claims 2' })).toBeVisible();
  await filters.getByRole('button', { name: /^All/ }).click();
  await row('Prop 0007').click();
  await expect(detail).toContainText('Landed.');
  await expect(row('Prop 0007').locator('.library-gauge.closed')).toHaveCount(1);
  await filters.getByRole('button', { name: /^Open/ }).click();
  await row('Prop 0020').click();
  await detail.getByRole('button', { name: 'Close…' }).click();
  await prompt('Close the claim on Prop 0020?').getByRole('button', { name: 'Close claim' }).click();
  await expect(status).toHaveText('Closed the claim on Prop 0020');

  assert.deepEqual(errors, []);
  console.log('Exchange claims UI passed: the sidebar count, the Claims view (gauge, whose turn, filters, a file that cannot be read), a claim\'s detail, a claim moving on its own, and closing.');
} finally { await browser?.close(); await service?.close(); }
