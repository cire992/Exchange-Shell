// Stand-ins for CLIs a UI test picks in the New chat dialog, so it does not depend on what is
// installed (the CI runner has no Claude Code). They are never run: those tests replace the
// service's launch. The shell counts a CLI as installed when it finds it on PATH.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function standInClis(folder, names = ['claude']) {
  await mkdir(folder, { recursive: true });
  for (const name of names) await writeFile(path.join(folder, `${name}.cmd`), '@echo off\r\nexit /b 0\r\n');
  process.env.PATH = `${folder}${path.delimiter}${process.env.PATH || ''}`;
}
