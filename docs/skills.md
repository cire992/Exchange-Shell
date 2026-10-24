# Project skills

Eighteen skills come with the shell, kept from Mr. Mak Workspace: concept art,
planning and handoffs, and 3D and game production (see the Exchange design
spec, *Skills*). `.agents/skills` is the maintained source for Codex;
`.claude/skills` contains complete, identical copies for Claude Code, including
scripts and references. These are local project files, not global installations.

Claude reads the instructions in its own `SKILL.md` when a skill is used; a
Markdown link is just a request to read another file, not automatic inheritance.
Full folders are committed, so a normal Windows clone needs no symlinks.
See [Claude's skill format](https://code.claude.com/docs/en/skills).

For shared changes, edit `.agents/skills`, then run `npm run skills:sync`.
If you edited a Claude copy directly, first move that intended change into the
maintained source. `npm run test:repo` checks that the two copies agree and that
the set of skills is the expected one.

| Skill | Use it for |
| --- | --- |
| [3d-production-routing](../.agents/skills/3d-production-routing/SKILL.md) | Choose a practical workflow for 3D concepts, generated meshes, material maps, procedural Three.js reconstruction and game animation. |
| [blender-game-animation](../.agents/skills/blender-game-animation/SKILL.md) | Rig and animate supplied characters in Blender, revise motion from references, and deliver editable sources plus a verified game export. |
| [character-sheet-pipeline](../.agents/skills/character-sheet-pipeline/SKILL.md) | Prepare strict-front character sheets, isolated parts and optional multiview references for 3D modeling from an approved image. |
| [fal-ai-generation](../.agents/skills/fal-ai-generation/SKILL.md) | Generate and edit images, create video, audio, 3D assets or material maps through fal.ai MCP or the Python queue client. Use for fal model discovery, reference uploads, generation, recovery and local delivery. |
| [feature-handoff](../.agents/skills/feature-handoff/SKILL.md) | Prepare a precise handoff for an agent or developer implementing a feature, continuing a task or reviewing a finished change. |
| [game-animation-integration](../.agents/skills/game-animation-integration/SKILL.md) | Bring approved animation into a game, including clip mapping, turn exits, locomotion phase and gameplay event timing. |
| [game-audio-workflow](../.agents/skills/game-audio-workflow/SKILL.md) | Audition, select and integrate sounds with stable asset IDs, contact events, mixer rules and native listening checks. |
| [game-level-design](../.agents/skills/game-level-design/SKILL.md) | Build reviewable level drafts, validate scale and traversal, and apply accepted changes to the actual scene. |
| [game-ui-workflow](../.agents/skills/game-ui-workflow/SKILL.md) | Take a HUD or menu from a visual study to live game data, input behavior and native review. |
| [game-vfx-workflow](../.agents/skills/game-vfx-workflow/SKILL.md) | Develop effect layers, event timing, attachment, cleanup and in-game visual comparisons. |
| [gameplay-visual-review](../.agents/skills/gameplay-visual-review/SKILL.md) | Verify game changes with controlled native captures and separate implementation, visual review and acceptance. |
| [higgsfield-workflow](../.agents/skills/higgsfield-workflow/SKILL.md) | Use the official Higgsfield CLI or its Blender integration to discover models, generate requested assets and resume recorded jobs. |
| [image-reference-workflow](../.agents/skills/image-reference-workflow/SKILL.md) | Explore image concepts and make faithful edits of accepted references for 3D or creative production, with explicit model choices and visual review. |
| [img2threejs](../.agents/skills/img2threejs/SKILL.md) | Turn an object or character reference image into a quality-gated, animation-ready procedural Three.js model built in code. Use for image-to-3D reconstruction, detail-accurate object rebuilds, stylized/likeness-maximized human characters, sculpt specs, and staged code generation. |
| [materials-to-game](../.agents/skills/materials-to-game/SKILL.md) | Create or apply material maps and bake a textured high-poly mesh onto a game mesh, with channel, UV and export checks. |
| [motion-reference-workflow](../.agents/skills/motion-reference-workflow/SKILL.md) | Prepare and select character motion references, or transfer approved motion to a human reference for a later mocap workflow. |
| [plan](../.agents/skills/plan/SKILL.md) | Turn a broad project request into a small actionable plan with concrete deliverables, dependencies and acceptance checks. |
| [video-watch](../.agents/skills/video-watch/SKILL.md) | Inspect a local or publicly accessible video through sampled scene frames, timestamps and a visual report, especially for motion and 3D reference analysis. |

Exchange's own skills (identity interview, claim dispatch briefs, process
authoring and drift review) arrive with roadmap phase 8, when project homes and
the Exchange MCP exist.

## Game production

The game workflows connect concept work to implementation. They describe how to
inspect an existing project, preserve accepted work, hand over exact event
markers and review the result in the engine. Examples are illustrative; the
receiving project's rules remain authoritative. Exchange will adapt them to
Unreal and Bethesda targets.

Blender animation covers multiple Action owners, slots, bind-basis checks and
portable clip exports. Motion references keep a stable take ledger and separate
appearance transfer from mocap. Handoffs separate a selected proposal,
implementation, agent verification and user acceptance. The routing skill helps
an agent choose among these workflows.

These are instructions for agents, not bundled editor integrations. Use your
existing editor connection and check its available operations. Generation is
optional: a skill does not install an engine, connect an MCP server, authenticate
a provider or perform paid work by itself. Credentials and paid-job receipts stay
out of Git.
