// The Unidentified desk's piles and the lexicon editor (Roadmap phase 6f, part 2) in the real UI,
// against the fake core's synthetic library (fake-library.mjs): unattached files by folder, made
// into a product, linked onto an asset or ignored, with Undo; suggestions in batches and pages;
// and adding, removing and allowing lexicon words. Run after npm run build. Optional:
// SCREENSHOTS=<folder>.
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
const repo = await mkdtemp(path.join(root, '.cache/exchange-desk-ui-'));
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
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const status = page.locator('.library-statusline');
  const sidebar = page.getByRole('navigation', { name: 'Library' });
  const piles = page.getByRole('group', { name: 'Unidentified desk' });
  const tree = page.getByRole('tree', { name: 'Unattached files by folder' });
  const folder = page.getByRole('complementary', { name: 'Folder' });
  const row = name => tree.getByRole('treeitem').filter({ has: page.locator('.library-tree-name').getByText(name, { exact: true }) });
  const expand = async name => { await row(name).click(); await page.keyboard.press('ArrowRight'); };
  const count = name => row(name).locator('small');
  await expect(heading).toContainText('2,300 products and standalone assets');

  // The desk's piles, with their counts.
  await sidebar.getByRole('button', { name: /Unidentified 40/ }).click();
  await expect(piles.getByRole('button', { name: 'Low confidence 40' })).toHaveAttribute('aria-pressed', 'true');
  await expect(piles.getByRole('button', { name: 'Unattached files 5,010' })).toBeVisible();
  await expect(piles.getByRole('button', { name: 'Suggestions 623' })).toBeVisible();

  // Unattached files: two roots, counted one level at a time as they are expanded.
  await piles.getByRole('button', { name: /Unattached files/ }).click();
  await expect(heading.locator('h2')).toHaveText('Unattached files');
  await expect(tree.getByRole('treeitem')).toHaveCount(2);
  await expect(folder.getByRole('button', { name: 'Make a product from this folder…' })).toBeDisabled();
  await expand('Daz Studio · D:/Library');
  await expect(count('Daz Studio · D:/Library')).toHaveText('7');
  await expect(count('Runtime')).toHaveText('5');
  await expect(tree).toContainText('1 file directly in the root');
  await expand('Runtime');
  await expand('Textures');
  await row('Crate Kit').click();
  await expect(folder.getByRole('heading')).toHaveText('Runtime/Textures/Crate Kit');
  await expect(folder).toContainText('3 files no asset holds');
  await expect(folder.getByRole('list', { name: 'Some of its files' })).toContainText('crate_n.png');
  if (shots) await page.screenshot({ path: path.join(shots, 'desk-files.png') });

  // A product from a folder: its files leave the desk, the folders above count fewer, and the new
  // product shows in the inspector. Undo brings the folder back.
  await folder.getByRole('button', { name: 'Make a product from this folder…' }).click();
  const product = page.getByRole('dialog', { name: 'New product' });
  await expect(product.getByRole('textbox', { name: 'Name' })).toHaveValue('Crate Kit');
  await product.getByRole('button', { name: 'Create' }).click();
  await expect(status).toHaveText('Done: new product Crate Kit · Ctrl+Z undoes it');
  await expect(row('Crate Kit')).toHaveCount(0);
  await expect(count('Textures')).toHaveText('2');
  await expect(count('Runtime')).toHaveText('2');
  await expect(count('Daz Studio · D:/Library')).toHaveText('4');
  await expect(row('Textures')).toHaveAttribute('aria-selected', 'true');
  await expect(inspector.getByRole('heading', { name: 'Crate Kit' })).toBeVisible();
  await expect(piles.getByRole('button', { name: 'Unattached files 5,007' })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(status).toHaveText('Undone: new product Crate Kit');
  await expect(count('Crate Kit')).toHaveText('3');
  await expect(count('Daz Studio · D:/Library')).toHaveText('7');
  await expect(row('Crate Kit')).toHaveAttribute('aria-selected', 'true');

  // Link a folder onto an asset found by searching.
  await row('Rocks').click();
  await folder.getByRole('button', { name: 'Link these files to an asset…' }).click();
  const picker = page.getByRole('dialog', { name: 'Link the 2 files in Runtime/Textures/Rocks to…' });
  await picker.getByRole('textbox', { name: 'Search for the asset' }).fill('dwarf');
  await expect(picker.getByRole('option')).toHaveCount(1);
  await picker.getByRole('option', { name: /Dwarf Helmet/ }).dblclick();
  await expect(status).toHaveText('Done: link a folder · Ctrl+Z undoes it');
  await expect(row('Rocks')).toHaveCount(0);
  await expect(inspector.getByRole('heading', { name: 'Dwarf Helmet' })).toBeVisible();

  // A folder of more than 5,000 files is a category: it can only be ignored. Ignoring is undoable.
  await expand('Loose files · E:/Sketchfab');
  await row('Big Dump').click();
  await expect(folder).toContainText('5,001 files no asset holds. More than 5,000: pick a smaller folder');
  await expect(folder.getByRole('button', { name: 'Make a product from this folder…' })).toBeDisabled();
  await expect(folder.getByRole('button', { name: 'Link these files to an asset…' })).toBeDisabled();
  await folder.getByRole('button', { name: 'Not assets: ignore this folder' }).click();
  await expect(status).toHaveText('Done: ignore Big Dump · Ctrl+Z undoes it');
  await expect(row('Big Dump')).toHaveCount(0);
  await expect(count('Loose files · E:/Sketchfab')).toHaveText('2');
  await expect(piles.getByRole('button', { name: 'Unattached files 7' })).toBeVisible();
  await page.getByRole('group', { name: 'Undo and Redo' }).getByRole('button', { name: 'Undo' }).click();
  await expect(count('Big Dump')).toHaveText('5,001');
  await expect(count('Loose files · E:/Sketchfab')).toHaveText('5,003');

  // The tree's keys: Up and Down move, Left collapses.
  await row('scraps').click();
  await page.keyboard.press('ArrowUp');
  await expect(row('Big Dump')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(row('Loose files · E:/Sketchfab')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(row('Big Dump')).toHaveCount(0);

  // Suggestions: a page of 300 at a time, by kind, accepted or rejected in batches.
  await piles.getByRole('button', { name: /Suggestions/ }).click();
  const list = page.locator('.library-suggestions');
  const summary = list.getByRole('status');
  await expect(summary).toHaveText('623 pending suggestions · 0 checked');
  await expect(list.locator('tbody tr')).toHaveCount(300);
  await list.getByRole('button', { name: 'Show more (300 of 623 shown)' }).click();
  await expect(list.locator('tbody tr')).toHaveCount(600);
  const kind = list.getByRole('combobox', { name: 'Kind of suggestion' });
  await kind.selectOption('lexicon_word');
  await expect(list.locator('tbody tr')).toHaveCount(2);
  await list.getByRole('checkbox', { name: /“cruller”/ }).check();
  await expect(summary).toHaveText('2 pending suggestions · 1 checked');
  await list.getByRole('button', { name: 'Accept checked' }).click();
  await expect(status).toHaveText('Done: accept 1 suggestion · Ctrl+Z undoes it');
  await expect(summary).toHaveText('1 pending suggestion · 0 checked');
  await expect(kind.locator('option:checked')).toHaveText('Lexicon words (1)');
  await list.getByRole('checkbox', { name: /“halberd”/ }).check();
  await list.getByRole('button', { name: 'Reject checked' }).click();
  await expect(status).toHaveText('Done: reject 1 suggestion · Ctrl+Z undoes it');
  await expect(summary).toHaveText('No pending suggestions.');
  await kind.selectOption('variant_group');
  await expect(summary).toHaveText('620 pending suggestions · 0 checked');
  await list.getByRole('checkbox', { name: 'Select all shown' }).check();
  await expect(summary).toHaveText('620 pending suggestions · 300 checked');
  await list.getByRole('button', { name: 'Accept checked' }).click();
  await expect(status).toHaveText('Done: accept 300 suggestions · Ctrl+Z undoes it');
  await expect(summary).toHaveText('320 pending suggestions · 0 checked');
  await expect(piles.getByRole('button', { name: 'Suggestions 321' })).toBeVisible();
  await list.locator('tbody tr').first().click(); // shows what it is about
  await expect(inspector.getByRole('heading', { name: 'Prop 0400' })).toBeVisible();
  if (shots) await page.screenshot({ path: path.join(shots, 'desk-suggestions.png') });
  await heading.locator('h2').click();
  await page.keyboard.press('Control+z');
  await expect(status).toHaveText('Undone: accept 300 suggestions');
  await expect(summary).toHaveText('620 pending suggestions · 0 checked');

  // The lexicon editor: words added and removed (with Undo), read-only patterns, a filter, a found
  // author removed and allowed again, and a lexicon whose words stand for nothing else.
  await sidebar.getByRole('button', { name: 'Lexicons' }).click();
  await expect(heading.locator('h2')).toHaveText('Lexicons');
  await expect(inspector).toHaveCount(0);
  const lexicons = page.getByRole('listbox', { name: 'Lexicons' });
  await expect(lexicons.getByRole('option')).toHaveText(['Categories9 words', 'Ignore3 words', 'Known authors3 words', 'Variants3 words']);
  const editor = page.getByRole('region', { name: 'Categories' });
  await expect(editor.getByRole('row', { name: /blade_\* pattern \(read-only\)/ })).toBeVisible();
  await expect(editor.getByRole('row', { name: /blade_\*/ }).getByRole('button')).toHaveCount(0);
  await expect(editor.getByRole('row', { name: /cruller/ })).toBeVisible(); // the accepted suggestion
  await editor.getByRole('button', { name: 'Add' }).click();
  await expect(status).toHaveText('Type a word, and the value it stands for (e.g. Food).');
  await editor.getByRole('combobox', { name: 'Value' }).fill('Food');
  await editor.getByRole('textbox', { name: 'Word', exact: true }).fill('pretzel');
  await editor.getByRole('textbox', { name: 'Word', exact: true }).press('Enter');
  await expect(status).toHaveText('Done: add the word pretzel to Food · Ctrl+Z undoes it');
  await expect(editor.getByRole('row', { name: /pretzel/ })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Word', exact: true })).toHaveValue('');
  await editor.getByRole('button', { name: 'Remove sword' }).click();
  await expect(status).toHaveText('Done: remove the word sword from Weapon · Ctrl+Z undoes it');
  await expect(editor.getByRole('row', { name: /sword/ })).toHaveCount(0);
  await heading.locator('h2').click();
  await page.keyboard.press('Control+z');
  await expect(editor.getByRole('row', { name: /sword/ })).toBeVisible();
  await editor.getByRole('textbox', { name: 'Filter' }).fill('pre');
  await expect(editor.locator('tbody tr')).toHaveCount(1);
  if (shots) await page.screenshot({ path: path.join(shots, 'desk-lexicons.png') });
  await lexicons.getByRole('option', { name: /Known authors/ }).click();
  const authors = page.getByRole('region', { name: 'Known authors' });
  await expect(authors.getByRole('row', { name: /RiverSoft Art found by scans/ })).toBeVisible();
  await authors.getByRole('button', { name: 'Remove RiverSoft Art' }).click();
  await expect(authors.getByRole('row', { name: /RiverSoft Art/ })).toHaveCount(0);
  await expect(authors).toContainText('Removed found words (2): scans never add these back');
  await authors.getByRole('button', { name: 'Old Vendor ↺' }).click();
  await expect(status).toHaveText('Done: add the word Old Vendor to Old Vendor · Ctrl+Z undoes it');
  await expect(authors.getByRole('row', { name: /Old Vendor list/ })).toBeVisible();
  await lexicons.getByRole('option', { name: /Ignore/ }).click();
  const ignore = page.getByRole('region', { name: 'Ignore' });
  await expect(ignore.getByRole('combobox', { name: 'Value' })).toHaveCount(0);
  await ignore.getByRole('textbox', { name: 'Word', exact: true }).fill('draft');
  await ignore.getByRole('button', { name: 'Add' }).click();
  await expect(status).toContainText('Done: add the word draft');
  await expect(ignore.getByRole('row', { name: /draft/ })).toBeVisible();

  // A search lists assets again.
  await page.getByRole('textbox', { name: 'Search the library' }).fill('dwarf');
  await expect(heading).toContainText('1 asset matching “dwarf”');
  await expect(sidebar.getByRole('button', { name: /All assets/ })).toHaveAttribute('aria-current', 'true');
  assert.deepEqual(errors, []);
  console.log('Exchange desk UI passed: unattached files by folder (product, link, ignore, Undo, keys), suggestions in pages and batches, and the lexicon editor (add, remove, Undo, patterns, filter, found authors).');
} finally { await browser?.close(); await service?.close(); }
