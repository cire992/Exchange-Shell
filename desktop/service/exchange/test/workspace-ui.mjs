// The Workspace window's view of the Exchange core's service, in the real UI with a fake core:
// connected (the library view; see library-ui.mjs), the settings, a missing folder and Retry.
// Run after npm run build. No Python, library, chats or settings of the user are touched.
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
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/exchange-workspace-ui-'));
const core = path.join(repo, 'core'); await mkdir(core);
await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, '.mrmak/settings.json'), JSON.stringify({ exchangeCore: core }));
const exchange = new ExchangeCore({ command: ({ core }) => ({ file: process.execPath, args: [path.join(here, 'fake-core.mjs')], cwd: core, env: {} }) });
let service, browser;
try {
  service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} }, exchange, startExchange: true });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);
  const panel = page.getByRole('region', { name: 'Exchange service' });
  const connected = page.locator('.library-connection');
  await expect(connected).toContainText('Connected · core fake-0.1 · API v1');
  await expect(connected).toHaveAttribute('title', core);
  await expect(page.getByRole('navigation', { name: 'Library' })).toContainText('235,043');
  await expect(panel).toHaveCount(0);

  // Settings › Exchange core: a folder that does not exist is reported, and Retry is offered.
  await page.getByRole('button', { name: 'Toggle settings', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Core folder' });
  await expect(field).toHaveValue(core);
  await field.fill(path.join(repo, 'missing-core'));
  await page.getByRole('button', { name: 'Save and restart the service' }).click();
  await expect(panel).toContainText('Not running');
  await expect(panel).toContainText('does not exist');
  await expect(page.locator('.exchange-core-state')).toContainText('Service: error');

  // Back to a real folder; Retry after it stops.
  await field.fill(core);
  await page.getByRole('button', { name: 'Save and restart the service' }).click();
  await expect(connected).toBeVisible();
  await exchange.stop();
  await expect(panel).toContainText('Stopped');
  await expect(panel).toContainText(core);
  await panel.getByRole('button', { name: 'Retry' }).click();
  await expect(connected).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('Exchange Workspace UI passed: the library once connected, core settings, a missing folder, stop and Retry.');
} finally { await browser?.close(); await service?.close(); }
