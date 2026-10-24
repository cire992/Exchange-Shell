// The Workspace's library view (Roadmap phase 6d) in the real UI, with a fake core serving a
// synthetic library of 5,300 assets (fake-library.mjs): the sidebar, the virtualized grid and its
// paging, grouping, search (and a search that does not parse), opening a set, keyboard selection,
// collections, Unidentified and the read-only inspector. Run after npm run build.
// Optional: SCREENSHOTS=<folder> saves screenshots there.
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
const repo = await mkdtemp(path.join(root, '.cache/exchange-library-ui-'));
const core = path.join(repo, 'core'); await mkdir(core);
await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, '.mrmak/settings.json'), JSON.stringify({ exchangeCore: core }));
const exchange = new ExchangeCore({ command: ({ core }) => ({ file: process.execPath, args: [path.join(here, 'fake-core.mjs')], cwd: core, env: { FAKE_CORE_LIBRARY: '1' } }) });
let service, browser;
try {
  service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} }, exchange, startExchange: true });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const pagesFetched = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/exchange/dossiers') pagesFetched.push(Object.fromEntries(url.searchParams)); });
  await page.goto(service.urls.workspace);

  const sidebar = page.getByRole('navigation', { name: 'Library' });
  const grid = page.getByRole('listbox', { name: 'Assets' });
  const heading = page.locator('.library-heading');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const card = name => grid.getByRole('option').filter({ hasText: name }).first();

  // Connected: the library, grouped by product (300 products and 2,000 standalone meshes).
  await expect(page.locator('.library-connection')).toContainText('Connected · core fake-0.1 · API v1');
  await expect(sidebar.getByRole('button', { name: /All assets 5,300/ })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /Unidentified 40/ })).toBeVisible();
  await expect(heading).toContainText('All assets');
  await expect(heading).toContainText('2,300 products and standalone assets');
  await expect(card('Barrel 1')).toBeVisible();
  const rendered = await grid.getByRole('option').count();
  assert.ok(rendered > 0 && rendered < 200, `only the rows in view are rendered (${rendered})`);
  if (shots) await page.screenshot({ path: path.join(shots, 'library-all.png') });

  // Scrolling to the end fetches only the pages it needs.
  const before = pagesFetched.length;
  await grid.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(card('Prop 1999')).toBeVisible();
  const offsets = pagesFetched.slice(before).map(p => Number(p.offset));
  assert.ok(offsets.includes(2200) && !offsets.includes(1000), `pages fetched while jumping to the end: ${offsets}`);
  await grid.evaluate(element => { element.scrollTop = 0; });

  // Selecting shows the inspector: stats panel, about, ledgers; tabs for files, dependencies, history.
  const search = page.getByRole('textbox', { name: 'Search the library' });
  await search.fill('dwarf');
  await expect(heading).toContainText('1 asset matching “dwarf”');
  await card('Dwarf Helmet').click();
  await expect(inspector.getByRole('heading', { name: 'Dwarf Helmet' })).toBeVisible();
  await expect(inspector.locator('.library-stats')).toContainText('Polygons1,212');
  await expect(inspector.locator('.library-stats')).toContainText('Acquired2026-10-20');
  await expect(inspector).toContainText('Sketchfab artist');
  await expect(inspector.locator('.library-ledger')).toContainText('Loose files');
  await expect(card('Dwarf Helmet').locator('img')).toHaveJSProperty('naturalWidth', 1);
  await inspector.getByRole('tab', { name: 'Files' }).click();
  await expect(inspector.locator('.library-files')).toContainText('Dwarf Helmet.glb');
  await inspector.getByRole('tab', { name: 'History' }).click();
  await expect(inspector).toContainText('Found in Loose files · Sketchfab');
  await inspector.getByRole('tab', { name: 'Overview' }).click();

  // Arrow keys move the selection; By type lists everything sorted by type.
  await search.fill('');
  await expect(heading).toContainText('2,300 products');
  await card('Barrel 1').click();
  await grid.press('ArrowRight');
  await expect(inspector.getByRole('heading', { name: 'Barrel 1001' })).toBeVisible();
  await grid.press('ArrowDown');
  await expect(grid.locator('.library-card.selected')).toHaveCount(1);
  await page.getByRole('button', { name: 'By type' }).click();
  await expect(heading).toContainText('5,300 assets');
  await expect(grid.getByRole('option').first()).toContainText('Daz morph');
  await page.getByRole('button', { name: 'By product' }).click();

  // A set opens on double-click and shows its contents; the crumb goes back.
  await search.fill('outfit 000');
  await expect(heading).toContainText('11 assets matching “outfit 000”');
  await card('Outfit 000').dblclick();
  await expect(heading).toContainText('Outfit 000');
  await expect(heading).toContainText('10 assets');
  await card('Outfit 000 Piece 1').click();
  await expect(inspector.getByRole('heading', { name: 'Outfit 000 Piece 1' })).toBeVisible();
  await expect(inspector).toContainText('Daz EULA');
  await expect(inspector).toContainText('(from its product)');
  await inspector.getByRole('tab', { name: 'Dependencies' }).click();
  await expect(inspector).toContainText('Needs (2, 1 broken)');
  await inspector.getByRole('tab', { name: 'Overview' }).click();
  await inspector.locator('.library-link').filter({ hasText: 'Outfit 000' }).first().click();
  await expect(inspector.getByRole('heading', { name: 'Outfit 000' })).toBeVisible();
  await expect(inspector).toContainText('Contains (10)');
  if (shots) await page.screenshot({ path: path.join(shots, 'library-set.png') });
  await heading.getByRole('button', { name: /All assets/ }).click();
  await expect(heading).toContainText('11 assets matching “outfit 000”');

  // Search: applied after typing stops; grouping is off for searches; a bad search says why.
  await search.fill('barrel');
  await expect(heading).toContainText('40 assets matching “barrel”');
  await expect(page.getByRole('button', { name: 'By type' })).toBeDisabled();
  await search.fill('((');
  await search.press('Enter');
  await expect(page.locator('.library-empty[role="alert"]')).toContainText('unbalanced parentheses');
  await page.getByRole('button', { name: 'Clear the search' }).click();
  await expect(heading).toContainText('2,300 products');

  // Collections, Unidentified, an environment's containers and dossier types.
  await sidebar.getByRole('button', { name: /Favorites 4/ }).click();
  await expect(heading).toContainText('Collection');
  await expect(heading).toContainText('4 assets');
  await sidebar.getByRole('button', { name: /All barrels/ }).click();
  await expect(heading).toContainText('40 assets');
  await sidebar.getByRole('button', { name: /Unidentified 40/ }).click();
  await expect(heading).toContainText('Unidentified desk');
  await expect(grid.locator('.library-card.unidentified').first()).toBeVisible();
  await sidebar.getByRole('button', { name: 'Expand Daz Studio' }).click();
  await sidebar.getByRole('button', { name: /Containers/ }).first().click();
  await sidebar.getByRole('button', { name: /Daz Connect/ }).click();
  await expect(heading).toContainText('Daz Connect');
  await expect(heading).toContainText('100 products and standalone assets');
  await sidebar.getByRole('button', { name: /Dossier types/ }).first().click();
  await sidebar.getByRole('button', { name: /Daz morph 1,200/ }).click();
  await expect(heading).toContainText('Daz Studio › Dossier type');
  await expect(heading).toContainText('1,200 assets');
  await expect(page.getByRole('button', { name: 'By product' })).toBeDisabled();

  // Refresh reads the library again.
  const sidebarReads = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/exchange/sidebar') sidebarReads.push(1); });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => sidebarReads.length).toBe(1);
  if (shots) await page.screenshot({ path: path.join(shots, 'library-types.png') });

  // Narrow windows keep every part reachable.
  await page.setViewportSize({ width: 820, height: 760 });
  await expect(grid).toBeVisible();
  await expect(inspector).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('Exchange library UI passed: sidebar counts, a virtualized grid fetching only the pages in view, grouping, search and a bad search, sets, keys, collections, Unidentified, containers, types, Refresh and the inspector.');
} finally { await browser?.close(); await service?.close(); }
