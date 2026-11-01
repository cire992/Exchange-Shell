// Claims in the Workspace (R5) in the real UI, against the fake core's claims (fake-claims.mjs): the
// sidebar's count, the Claims view with its gauge and whose turn, the filters, a claim's detail,
// closing one, a claim moving on its own, a file that can't be read, Claim… and a thing's claims in
// the inspector. Run after npm run build.
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

  // Claim…: the path before anything is written, for a role, a place and a folder.
  const grid = page.getByRole('listbox', { name: 'Assets' });
  const card = name => grid.getByRole('option').filter({ has: page.locator('strong').getByText(name, { exact: true }) });
  const search = page.getByRole('textbox', { name: 'Search the library' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await sidebar.getByRole('button', { name: /^All assets/ }).click();
  await search.fill('prop 0021');
  await expect(heading).toContainText('1 asset matching');
  await card('Prop 0021').click({ button: 'right' });
  await expect(page.getByRole('menu').getByRole('menuitem').first()).toHaveText('Claim…');
  await page.getByRole('menu').getByRole('menuitem', { name: 'Claim…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Claim' });
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Claim Prop 0021');
  const place = dialog.getByRole('combobox', { name: 'Place' }), pathRow = dialog.getByRole('region', { name: 'Path' }).getByRole('row', { name: /Prop 0021/ });
  const claimButton = dialog.getByRole('button', { name: 'Claim', exact: true });
  await place.selectOption('Daz Studio');
  await expect(pathRow).toContainText('Convert mesh (Blender)');
  await expect(pathRow).toContainText('Walk it');
  await expect(dialog.locator('#library-claim-roles option')).toHaveCount(1);
  await place.selectOption('Loose files');
  await expect(pathRow).toContainText('This place already holds it: walking writes a second copy');
  await place.selectOption('Daz Studio');
  await expect(pathRow).not.toContainText('already holds it');
  await dialog.getByRole('combobox', { name: 'As' }).fill('g8f_character');
  await expect(pathRow).toContainText('No path yet: a process has to be built');
  await expect(claimButton).toBeEnabled(); // a claim with no path is still a claim: it says what to build
  await dialog.getByRole('textbox', { name: 'Folder' }).fill('../elsewhere');
  await expect(pathRow).toContainText('leaves Daz Studio');
  await expect(claimButton).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Folder' }).fill('');
  await dialog.getByRole('combobox', { name: 'As' }).fill('prop');
  await dialog.getByRole('textbox', { name: 'Note' }).fill('For the cantina.');
  await expect(pathRow).toContainText('Walk it');
  if (shots) await page.screenshot({ path: path.join(shots, 'claim-dialog.png') });
  await claimButton.click();
  await expect(status).toHaveText('Claimed Prop 0021 for Daz Studio');
  await expect(dialog).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: 'Claims 2' })).toBeVisible();

  // The inspector shows a thing's claims, and each opens in the Claims view.
  await card('Prop 0021').click();
  const claimsHere = inspector.getByRole('region', { name: 'Claims' });
  await expect(claimsHere).toContainText('Daz Studio as prop');
  await expect(claimsHere).toContainText('Walk it');
  if (shots) await page.screenshot({ path: path.join(shots, 'claim-inspector.png') });
  await claimsHere.getByRole('button').click();
  await expect(detail.getByRole('heading', { level: 3 })).toHaveText('Prop 0021');
  await expect(detail).toContainText('For the cantina.');
  await expect(filters.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');

  // Several things: one choice, each thing's own path, separate claims.
  await sidebar.getByRole('button', { name: /^All assets/ }).click();
  await search.fill('prop 002');
  await expect(card('Prop 0022')).toBeVisible();
  await card('Prop 0022').click();
  await card('Prop 0023').click({ modifiers: ['Control'] });
  await inspector.getByRole('button', { name: 'Claim 2…' }).click();
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Claim 2 assets');
  await expect(dialog.getByRole('region', { name: 'Path' }).getByRole('row')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Claim 2' }).click();
  await expect(status).toContainText('Claimed 2 assets for');
  await expect(sidebar.getByRole('button', { name: 'Claims 4' })).toBeVisible();
  await search.fill('dwarf helmet');
  await card('Dwarf Helmet').click();
  await inspector.getByRole('button', { name: 'Claim…' }).click();
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Claim Dwarf Helmet');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  assert.deepEqual(errors, []);
  console.log('Exchange claims UI passed: the sidebar count, the Claims view (gauge, whose turn, filters, a file that cannot be read), a claim\'s detail, a claim moving on its own, closing, Claim… for one thing and several, and the inspector\'s claims.');
} finally { await browser?.close(); await service?.close(); }
