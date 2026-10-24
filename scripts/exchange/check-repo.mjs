// Repository checks for the Exchange shell: kept skills, safe defaults, no
// committed credentials, Exchange naming and the upstream license files.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

// Skills Exchange keeps from the fork: concept art, planning and handoffs,
// 3D and game production (DESIGN_SPEC "Skills").
const keptSkills = [
  '3d-production-routing', 'blender-game-animation', 'character-sheet-pipeline', 'fal-ai-generation',
  'feature-handoff', 'game-animation-integration', 'game-audio-workflow', 'game-level-design',
  'game-ui-workflow', 'game-vfx-workflow', 'gameplay-visual-review', 'higgsfield-workflow',
  'image-reference-workflow', 'img2threejs', 'materials-to-game', 'motion-reference-workflow',
  'plan', 'video-watch',
];
const skillNames = (await readdir(path.join(root, '.agents/skills'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert.deepEqual(skillNames, [...keptSkills].sort(), 'Shared skills changed; update keptSkills if that was intended.');
for (const name of skillNames) {
  const skill = await read(`.agents/skills/${name}/SKILL.md`);
  assert.match(skill, /^---\r?\nname:/, `${name}: SKILL.md needs front matter`);
  assert.equal(await read(`.claude/skills/${name}/SKILL.md`), skill, `${name}: run npm run skills:sync`);
  assert.doesNotMatch(skill, /[A-Z]:[\\/]Users[\\/]/i, `${name}: shared skills must not contain a local account path`);
}

assert.deepEqual(JSON.parse(await read('.mcp.json')), { mcpServers: {} }, 'No MCP connections are committed.');
assert.doesNotMatch(await read('.env.example'), /^\w+=(?!\s*$)\S+/m, 'The example env must contain no assigned values.');

// Permission bypass is never on unless chosen for a session.
assert.match(await read('src/desktop/client.ts'), /defaultBypass: false/);
assert.match(await read('desktop/service/server.mjs'), /defaultBypass: false/);
assert.match(await read('desktop/service/sessions.mjs'), /bypass: options\.bypass === true/);
assert.match(await read('desktop/service/sessions.mjs'), /pinned = false, bypass = false/);

const config = JSON.parse(await read('src-tauri/tauri.conf.json'));
assert.equal(config.productName, 'Exchange');
assert.equal(config.identifier, 'com.exchange.shell');
assert.deepEqual(config.bundle.targets, ['nsis'], 'Exchange is Windows only.');
assert.ok((await stat(path.join(root, 'exchange-shell.json'))).isFile(), 'The shell finds its root by exchange-shell.json.');

for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.ok((await read(file)).trim(), `${file} must stay`);
assert.match(await read('LICENSE'), /MIT License/);

console.log(`Repository passed: ${skillNames.length} shared skills, empty connections and account placeholders, bypass off by default, Exchange naming, license files.`);
