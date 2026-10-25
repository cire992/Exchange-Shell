// Curation in the Workspace (Roadmap phase 6f) in the real UI, against the fake core's synthetic
// library with its in-memory edits (fake-library.mjs): editing in the inspector with revert
// markers, tags, collections, Undo and Redo (buttons and keys), multi-select and bulk edit, the
// card menu, dialogs, dragging cards onto cards and collections, suggestions, history, and a busy
// library. Run after npm run build. Optional: SCREENSHOTS=<folder>.
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
const repo = await mkdtemp(path.join(root, '.cache/exchange-curation-ui-'));
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

  const grid = page.getByRole('listbox', { name: 'Assets' });
  const heading = page.locator('.library-heading');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const status = page.locator('.library-statusline');
  const sidebar = page.getByRole('navigation', { name: 'Library' });
  // A card by its exact name ("Barrel 1" is not "Barrel 101").
  const card = name => grid.getByRole('option').filter({ has: page.locator('strong').getByText(name, { exact: true }) });
  const search = page.getByRole('textbox', { name: 'Search the library' });
  const find = async (text, count) => { await search.fill(text); await expect(heading).toContainText(`${count} matching “${text}”`); };
  const undoButton = page.getByRole('group', { name: 'Undo and Redo' }).getByRole('button', { name: 'Undo' });
  const redoButton = page.getByRole('group', { name: 'Undo and Redo' }).getByRole('button', { name: 'Redo' });
  await expect(heading).toContainText('2,300 products and standalone assets');
  await expect(undoButton).toBeDisabled();

  // Rename in the inspector: the card, the status line and Undo follow; Ctrl+Z and Redo work.
  await find('dwarf', '1 asset');
  await card('Dwarf Helmet').click();
  const name = inspector.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('Iron Helmet');
  await name.press('Enter');
  await expect(status).toHaveText('Done: rename · Ctrl+Z undoes it');
  await expect(inspector.getByRole('heading', { name: 'Iron Helmet' })).toBeVisible();
  await expect(undoButton).toHaveAttribute('title', 'Undo: rename (Ctrl+Z)');
  await expect(inspector.getByRole('button', { name: 'Revert the name' })).toBeVisible();
  await heading.locator('h2').click(); // out of the field: Ctrl+Z is the library's again
  await page.keyboard.press('Control+z');
  await expect(status).toHaveText('Undone: rename');
  await expect(inspector.getByRole('heading', { name: 'Dwarf Helmet' })).toBeVisible();
  await redoButton.click();
  await expect(inspector.getByRole('heading', { name: 'Iron Helmet' })).toBeVisible();
  await inspector.getByRole('button', { name: 'Revert the name' }).click();
  await expect(inspector.getByRole('heading', { name: 'Dwarf Helmet' })).toBeVisible();

  // About fields: a value of the user's is marked and reverts; tags hide, show and add.
  const author = inspector.getByRole('textbox', { name: 'Author' });
  await expect(author).toHaveValue('Sketchfab artist');
  await author.fill('Jane Doe');
  await author.press('Enter');
  await expect(status).toContainText('set author of an asset');
  await expect(inspector.getByRole('textbox', { name: 'Author' })).toHaveClass(/mine/);
  await inspector.getByRole('button', { name: 'Revert author' }).click();
  await expect(inspector.getByRole('textbox', { name: 'Author' })).toHaveValue('Sketchfab artist');
  await inspector.getByRole('button', { name: 'prop ×' }).click();
  await expect(inspector.getByRole('button', { name: 'prop ↺' })).toBeVisible();
  await inspector.getByRole('button', { name: 'prop ↺' }).click();
  await expect(inspector.getByRole('button', { name: 'prop ×' })).toBeVisible();
  const addTag = inspector.getByRole('combobox', { name: 'Add a tag' });
  await addTag.fill('Food');
  await addTag.press('Enter');
  await expect(inspector.getByRole('button', { name: 'Food ×' })).toHaveClass(/user/);

  // Collections from the inspector: remove with the chip, add with the list.
  await inspector.getByRole('button', { name: 'Favorites ×' }).click();
  await expect(status).toContainText('remove an asset from a collection');
  await expect(sidebar.getByRole('button', { name: /Favorites 3/ })).toBeVisible();
  await inspector.getByRole('combobox', { name: 'Add to collection' }).selectOption({ label: 'Favorites' });
  await expect(status).toContainText('add an asset to a collection');
  await expect(sidebar.getByRole('button', { name: /Favorites 4/ })).toBeVisible();
  if (shots) await page.screenshot({ path: path.join(shots, 'curation-inspector.png') });

  // Multi-select and bulk edit.
  await search.fill('');
  await expect(heading).toContainText('2,300 products');
  await card('Barrel 1').click();
  await card('Barrel 1001').click({ modifiers: ['Control'] });
  await card('Barrel 1051').click({ modifiers: ['Control'] });
  await expect(inspector.getByRole('heading', { name: '3 assets selected' })).toBeVisible();
  await expect(heading).toContainText('3 selected');
  const bulkAuthor = inspector.getByRole('textbox', { name: 'Author' });
  await bulkAuthor.fill('Barrel Co');
  await bulkAuthor.press('Enter');
  await expect(status).toContainText('set author of 3 assets');
  await card('Barrel 1051').click({ modifiers: ['Control'] }); // and out again

  // The card menu: a new product from the two selected, through a dialog; Undo takes it back.
  await card('Barrel 1001').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Actions for 2 assets' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Put into a new product…' }).click();
  const dialog = page.getByRole('dialog', { name: 'New product' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Barrel set');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(status).toContainText('new product Barrel set');
  await expect(heading).toContainText('2,299 products and standalone assets');
  await find('barrel set', '1 asset');
  await expect(card('Barrel set').locator('.library-set')).toHaveText('2');
  if (shots) await page.screenshot({ path: path.join(shots, 'curation-product.png') });
  await undoButton.click();
  await expect(heading).toContainText('0 assets matching');
  await search.fill('');
  await expect(heading).toContainText('2,300 products');

  // Drag a card onto another: the drop menu merges (the same asset).
  await card('Barrel 101').dragTo(card('Barrel 1051'));
  const dropMenu = page.getByRole('menu', { name: 'Drop onto Barrel 1051' });
  await expect(dropMenu.getByRole('menuitem', { name: 'Fold in as a variant of “Barrel 1051”…' })).toBeVisible();
  await dropMenu.getByRole('menuitem', { name: /Merge 1 asset into “Barrel 1051”/ }).click();
  await expect(heading).toContainText('2,299 products');
  await expect(card('Barrel 101')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(heading).toContainText('2,300 products');

  // Collections from the sidebar: create, drop cards on it, delete from its menu, undo.
  await sidebar.getByRole('button', { name: 'New collection' }).click();
  await page.getByRole('dialog', { name: 'New collection' }).getByRole('textbox', { name: 'Name' }).fill('Keepers');
  await page.getByRole('dialog', { name: 'New collection' }).getByRole('button', { name: 'Create' }).click();
  const keepers = sidebar.getByRole('button', { name: /^Keepers/ });
  await expect(keepers).toBeVisible();
  await card('Barrel 1').click();
  await card('Barrel 1001').click({ modifiers: ['Shift'] });
  await card('Barrel 1001').dragTo(keepers);
  await expect(keepers).toContainText('2');
  await keepers.click({ button: 'right' });
  await page.getByRole('menu', { name: 'Keepers' }).getByRole('menuitem', { name: 'Delete “Keepers”' }).click();
  await expect(keepers).toHaveCount(0);
  await undoButton.click();
  await expect(sidebar.getByRole('button', { name: /^Keepers 2/ })).toBeVisible();

  // Not an asset leaves the default views; is:dismissed finds it to count it again.
  await card('Barrel 1').click();
  await card('Barrel 1').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Not an asset' }).click();
  await expect(card('Barrel 1')).toHaveCount(0);
  await find('barrel is:dismissed', '1 asset');
  await card('Barrel 1').click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Count as an asset again' }).click();
  await expect(heading).toContainText('0 assets matching');

  // Suggestions in the inspector; History's Undo; a busy library says so in the status line.
  await find('barrel 51', '20 assets');
  await card('Barrel 51').click();
  await inspector.getByRole('button', { name: 'Accept' }).click();
  await expect(status).toContainText('accept 1 suggestion');
  await inspector.getByRole('tab', { name: 'History' }).click();
  await inspector.getByRole('button', { name: 'Undo' }).click();
  await expect(status).toContainText('Done: undo accept suggestions'); // an undo of an entry is an edit too
  await inspector.getByRole('tab', { name: 'Overview' }).click();
  await expect(inspector.getByRole('button', { name: 'Accept' })).toBeVisible();
  const notes = inspector.getByRole('textbox', { name: 'Notes' });
  await notes.fill('__busy__');
  await notes.blur();
  await expect(status).toHaveText('The library is busy: a scan is writing to it. Try again when the scan finishes.');
  await expect(status).toHaveClass(/error/);
  if (shots) await page.screenshot({ path: path.join(shots, 'curation-busy.png') });
  assert.deepEqual(errors, []);
  console.log('Exchange curation UI passed: inspector edits with revert, tags, collections, Undo/Redo by button and key, multi-select and bulk edit, the card menu and dialogs, drag onto cards and collections, not an asset, suggestions, history and a busy library.');
} finally { await browser?.close(); await service?.close(); }
