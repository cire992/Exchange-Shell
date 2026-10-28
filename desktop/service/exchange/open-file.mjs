// Open in app (the Workspace's card menu): an asset's file opens with its Windows app, as a
// double-click in Explorer would. The desktop app does the opening, outside the service's process
// job, so the app stays open when the shell closes. A file that would run code instead of opening
// in an app is refused here, and again by the desktop app.
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

// Windows runs these, or follows them somewhere else, instead of opening them in an editor.
export const RUNNABLE = new Set(['.exe', '.com', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.msc', '.msi', '.msp', '.scr', '.pif', '.cpl', '.hta', '.jar', '.reg', '.lnk', '.url', '.appref-ms', '.application',
  '.gadget', '.inf', '.scf', '.sct', '.settingcontent-ms', '.appx', '.msix', '.library-ms', '.search-ms']);

export async function openableFile(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f]/.test(value)) throw new Error('Choose a file on this PC.');
  const file = await realpath(value).catch(() => { throw new Error(`${path.basename(value)} is not on disk: rescan its environment.`); });
  if (!(await stat(file)).isFile()) throw new Error(`${path.basename(file)} is a folder: use Show in folder.`);
  if (RUNNABLE.has(path.extname(file).toLowerCase())) throw new Error(`${path.basename(file)} is a program or a shortcut; Exchange doesn’t run those. Use Show in folder.`);
  return file;
}
