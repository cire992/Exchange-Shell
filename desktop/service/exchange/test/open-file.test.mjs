// Open in app (the Workspace's card menu): the service passes a file on to the desktop app only when
// it opens in an app. Folders, missing files, programs and shortcuts are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../../server.mjs';
import { openableFile } from '../open-file.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');

async function folder() {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const base = await mkdtemp(path.join(root, '.cache', 'exchange-open-file-'));
  for (const name of ['Dwarf Helmet.glb', 'Notes.TXT', 'setup.EXE', 'Daz Studio.lnk', 'run.bat']) await writeFile(path.join(base, name), '');
  return base;
}

test('files that open in an app pass, as their real path', async () => {
  const base = await folder();
  assert.equal(await openableFile(path.join(base, 'Dwarf Helmet.glb')), await realpath(path.join(base, 'Dwarf Helmet.glb')));
  assert.equal(await openableFile(path.join(base, 'Notes.TXT')), await realpath(path.join(base, 'Notes.TXT')));
});

test('programs, shortcuts, folders, missing files and relative paths are refused', async () => {
  const base = await folder();
  for (const name of ['setup.EXE', 'Daz Studio.lnk', 'run.bat']) await assert.rejects(openableFile(path.join(base, name)), /program or a shortcut/);
  await assert.rejects(openableFile(base), /is a folder/);
  await assert.rejects(openableFile(path.join(base, 'Missing.glb')), /not on disk/);
  await assert.rejects(openableFile('Dwarf Helmet.glb'), /Choose a file/);
  await assert.rejects(openableFile(42), /Choose a file/);
});

test('POST /api/open-file asks the desktop app to open the file', async () => {
  const base = await folder();
  const events = [];
  const repo = await mkdtemp(path.join(root, '.cache', 'exchange-open-file-repo-'));
  const service = await createService({ repo, uiDir: path.join(root, 'desktop', 'splash'), native: event => events.push(event), mcpOptions: { home: repo, env: {} } });
  try {
    const post = file => fetch(`${service.origin}/api/open-file`, { method: 'POST', headers: { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file }) });
    const opened = await post(path.join(base, 'Dwarf Helmet.glb'));
    assert.equal(opened.status, 200);
    assert.deepEqual(events.filter(e => e.type === 'open-file'), [{ type: 'open-file', path: await realpath(path.join(base, 'Dwarf Helmet.glb')) }]);
    const refused = await post(path.join(base, 'setup.EXE'));
    assert.notEqual(refused.status, 200);
    assert.match((await refused.json()).error, /program or a shortcut/);
    assert.equal(events.filter(e => e.type === 'open-file').length, 1);
  } finally {
    await service.close();
  }
});
