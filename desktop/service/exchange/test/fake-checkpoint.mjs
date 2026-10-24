// Stands in for `python -m exchange project checkpoint --for <folder> --reason <why> --json`.
// The mode file beside the project home picks the answer: commit (default), clean, fail or old.
// Every call is appended to calls.jsonl there, so tests can see what was asked.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const folder = args[args.indexOf('--for') + 1];
const reason = args[args.indexOf('--reason') + 1];
let home = path.resolve(folder);
while (!existsSync(path.join(home, 'exchange.project.toml')) && path.dirname(home) !== home) home = path.dirname(home);
const state = path.dirname(home);
const modeFile = path.join(state, 'checkpoint-mode');
const mode = existsSync(modeFile) ? readFileSync(modeFile, 'utf8').trim() : 'commit';
appendFileSync(path.join(state, 'calls.jsonl'), JSON.stringify({ folder, reason, dataDir: process.env.EXCHANGE_DATA_DIR || null }) + '\n');
if (mode === 'fail') {
  process.stderr.write('exchange: error: git has no identity to commit with. Set the one project homes use: exchange project config --git-name NAME --git-email EMAIL\n');
  process.exit(2);
}
if (mode === 'old') {
  process.stderr.write("usage: exchange [-h]\nexchange: error: argument command: invalid choice: 'project'\n");
  process.exit(2);
}
console.log(JSON.stringify({ project: home, committed: mode === 'commit', commit: 'c0ffee0123456789c0ffee0123456789c0ffee01', changed: mode === 'commit' ? 3 : 0 }));
