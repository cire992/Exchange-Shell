// Opt-in smoke test against the installed, signed-in CLIs (Claude Code, Codex,
// Kimi) and the local PowerShell. It uses an isolated service state and this
// repository as the working folder; no files are edited.
//
//   node desktop/service/exchange/test-clis.mjs [--agents claude,codex,kimi,shell] [--use-subscription]
//
// Without --use-subscription it only launches: each CLI with and without
// permission bypass, checking the CLI's own permission-mode indicator. With it,
// each agent also answers one tiny prompt before and one after its tab is closed
// and reopened from History, which proves the same native conversation resumes.
// One-time CLI questions (Claude's bypass warning, Kimi's folder trust, sign-in)
// are never answered here: answer them once yourself, then run this again.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { sleep } from '../util.mjs';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
const agents = (option('--agents') || 'claude,codex,kimi,shell').split(',');
const subscription = args.includes('--use-subscription');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// What each CLI shows when it starts, and how it marks its permission mode.
const cli = {
  claude: { ready: /❯|>\s/, bypassed: /bypass permissions on/i, blocked: [[/Bypass Permissions mode[\s\S]*Yes, I accept/, 'Claude Code is waiting for its one-time bypass acknowledgement. Accept it once in a Claude chat, then rerun.'], [/trust this folder/i, 'Claude Code asks whether to trust this folder. Answer it once, then rerun.']] },
  codex: { ready: /›/, bypassed: /YOLO mode/i, blocked: [[/Sign in with ChatGPT|Welcome to Codex/i, 'Codex needs a sign-in. Run codex once and sign in, then rerun.'], [/allow Codex to work in this folder/i, 'Codex asks about this folder. Answer it once, then rerun.']] },
  kimi: { ready: /❯|>\s|ask anything|send a message/i, bypassed: /Never Ask/, blocked: [[/Trust this folder\?/, 'Kimi asks whether to trust this folder. Answer it once in a Kimi chat, then rerun.'], [/\/login|not logged in|sign in/i, 'Kimi needs a sign-in (/login). Sign in once, then rerun.']] },
  shell: { ready: /PS [A-Z]:\\.*>/ },
};

const service = await createService({ repo, uiDir: path.join(repo, 'dist'), stateDir: path.join(repo, '.cache', `cli-check-${Date.now()}`) });
const results = [];
const screen = async id => (await service.sessions.read(id, 120)).screen;
async function until(id, test, what, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let text = '';
  while (Date.now() < deadline) {
    text = await screen(id);
    const agent = service.sessions.get(id).agent;
    for (const [pattern, message] of cli[agent].blocked || []) if (pattern.test(text)) throw Object.assign(new Error(message), { screen: text });
    if (test(text)) return text;
    if (service.sessions.get(id).status === 'exited') break;
    await sleep(500);
  }
  throw Object.assign(new Error(`Timed out waiting for ${what}`), { screen: text });
}
async function close(id) { await service.sessions.remove(id); }
async function check(name, run) {
  try { const detail = await run(); results.push({ name, ok: true, detail }); console.log(`PASS ${name}${detail ? ` · ${detail}` : ''}`); }
  catch (error) {
    results.push({ name, ok: false, detail: error.message }); console.log(`FAIL ${name} · ${error.message}`);
    if (error.screen) console.log(error.screen.split('\n').map(line => line.trimEnd()).filter(Boolean).slice(-14).map(line => `    | ${line}`).join('\n'));
  }
}

try {
  for (const agent of agents) {
    if (agent === 'shell') {
      await check('PowerShell: opens, runs a command, reopens from History', async () => {
        const chat = await service.sessions.create({ agent, name: 'CLI check PowerShell', cwd: repo });
        await until(chat.id, text => cli.shell.ready.test(text), 'the PowerShell prompt');
        service.sessions.input(chat.id, 'echo EXCHANGE_SHELL_ONE\r');
        await until(chat.id, text => /^EXCHANGE_SHELL_ONE\s*$/m.test(text), 'the echoed marker');
        await close(chat.id);
        await service.sessions.resume(chat.id);
        await until(chat.id, text => cli.shell.ready.test(text.split('EXCHANGE_SHELL_ONE').at(-1)), 'a fresh prompt after reopening');
        service.sessions.input(chat.id, 'echo EXCHANGE_SHELL_TWO\r');
        await until(chat.id, text => /^EXCHANGE_SHELL_TWO\s*$/m.test(text), 'the second marker');
        await close(chat.id);
        return 'a reopened shell starts fresh in the same folder';
      });
      continue;
    }
    const label = { claude: 'Claude Code', codex: 'Codex', kimi: 'Kimi' }[agent];
    let careful;
    await check(`${label}: starts with its own permission prompts`, async () => {
      careful = await service.sessions.create({ agent, name: `CLI check ${label}`, cwd: repo, bypass: false });
      const text = await until(careful.id, text => cli[agent].ready.test(text), `${label}'s prompt`);
      if (cli[agent].bypassed.test(text)) throw Object.assign(new Error('The bypass indicator shows on a chat started without bypass'), { screen: text });
      return careful.nativeId ? `native ID ${careful.nativeId}` : '';
    });
    await check(`${label}: bypass starts the CLI's no-prompt mode`, async () => {
      const chat = await service.sessions.create({ agent, name: `CLI check ${label} bypass`, cwd: repo, bypass: true });
      try { await until(chat.id, text => cli[agent].bypassed.test(text), `${label}'s bypass indicator`); }
      finally { await close(chat.id); }
      return 'indicator shown';
    });
    if (!subscription || !careful || !service.sessions.get(careful.id).process) continue;
    await check(`${label}: History reopens the same conversation`, async () => {
      const id = careful.id, first = `EXCHANGE_${agent.toUpperCase()}_FIRST`, second = `EXCHANGE_${agent.toUpperCase()}_SECOND`;
      service.sessions.input(id, `This is a terminal check. Reply with exactly ${first}. Do not use tools or change any files.`, { coordinator: true, submit: true });
      await until(id, text => text.split(first).length > 2, `the reply ${first}`, 120000);
      for (let i = 0; i < 40 && !service.sessions.get(id).nativeId; i++) await sleep(500);
      await close(id);
      const nativeId = service.sessions.get(id).nativeId;
      if (!nativeId) throw new Error('No native conversation ID was recorded before closing');
      await service.sessions.resume(id);
      if (service.sessions.get(id).nativeId !== nativeId) throw new Error(`Reopened with ${service.sessions.get(id).nativeId}, expected ${nativeId}`);
      await until(id, text => cli[agent].ready.test(text), `${label}'s prompt after reopening`, 45000);
      // A reopened CLI replays its history first; send only once the screen settles,
      // as a person would, or the Enter can arrive before its input box is live.
      for (let previous = '', still = 0; still < 6; await sleep(500)) { const text = await screen(id); still = text === previous ? still + 1 : 0; previous = text; }
      // No question mark: it can trigger a CLI shortcut while the text is pasted.
      service.sessions.input(id, `Repeat the exact word you replied with earlier in this conversation, then a space, then ${second}. Do not use tools.`, { coordinator: true, submit: true });
      await until(id, text => new RegExp(`${first}\\s+${second}`).test(text), `a reply naming ${first}`, 120000);
      await close(id);
      return `native ID ${nativeId} kept; the reopened chat remembered its first reply`;
    });
  }
} finally {
  await service.close();
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed${subscription ? '' : ' (launch only; add --use-subscription for resume checks)'}.`);
  process.exitCode = failed.length ? 1 : 0;
}
