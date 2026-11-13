# PMD Sky Fan Engine + Editor — Build Spec

> Working title: **Sky Maker**. A browser-based game engine and RPG Maker XP–style editor for making *new* Pokémon Mystery Dungeon stories, using sprites, tiles, portraits, and music extracted at runtime from the player's own *Explorers of Sky* ROM.

This file is the source of truth for the AI coding agent. Read it fully before writing code. When something here conflicts with a later instruction from the user, the user wins — then update this file.

---

## 1. Goals

1. **Editor (primary deliverable):** a complete, story-agnostic toolkit. The engine ships with **no built-in story**. The user writes everything (towns, dungeons, characters, dialogue, cutscenes, quests) with almost no code: click, paint, drag, pick from lists.
2. **Every major PMD system built in and toggleable** per project (§8): town services, missions boards, recruitment, full dungeon mechanics, starter selection.
3. **Player:** run a project as a playable game in the browser, with an overworld ("ground mode") and turn-based dungeon crawling.
5. **ROM patch export (later phase, §8b):** projects that stay within the original game's limits can also be exported as a patch file (BPS/xdelta). Players apply it to their own Explorers of Sky ROM and play on a DS emulator or real hardware.
4. **ROM-sourced assets + custom assets:** Nintendo/Chunsoft art, audio, and text come from the user's ROM, extracted in the browser. The user can also import their own PNG/OGG assets from day one. Nothing copyrighted lives in the repo or the build.

### Audience
Single user (the project owner). Optimize for her workflow: power-user shortcuts, fewer confirmation dialogs, no accounts, no collaboration or merge features.

### Non-goals (v1)
- Recreating the original Sky story.
- Online multiplayer, Wi-Fi rescues, mobile-first UI.
- Writing a DS emulator or patching the ROM.

---

## 2. Hard rules (agent must follow)

- **Never commit, bundle, fetch, or hardcode ROM-derived data.** No sprites, tiles, audio, text dumps, or offsets tables copied from extracted files into `src/`. Format *knowledge* (structure, field layouts) is fine.
- **The ROM never leaves the user's machine.** Load via file picker / drag-drop, parse in a Web Worker, cache extracted assets in IndexedDB. No uploads.
- **Project files are asset-free.** A project (`.skymaker.json` or zip) stores only IDs/references (e.g. `sprite: "monster/0025"`), plus any original art the user adds. Anyone opening it needs their own ROM.
- **Validate the ROM** by header game code before extracting. Support US first (`C2SE`), EU (`C2SP`) second. Show a friendly error otherwise.
- **Share patches, never ROMs.** The ROM export produces a patch file only. Never publish, upload, or commit a patched or clean ROM. Patched ROMs built locally for testing stay on the user's machine and are gitignored.
- **Tests use synthetic fixtures** (tiny hand-built binaries), never real ROM bytes.
- Keep tasks small; one milestone at a time; each ends with something runnable.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (strict) | Fast, simple |
| Monorepo | pnpm workspaces | Shared parser/engine code between editor & player |
| Rendering | **PixiJS v8** | Best fit for 2D pixel tilemaps + sprites. (Three.js with an ortho camera is possible but more work for this genre — only switch if we add 3D effects.) |
| Editor UI | React + Zustand | Panels, inspectors, lists; Pixi canvas embedded |
| Storage | IndexedDB via `idb-keyval` or Dexie | Asset cache + autosaved projects |
| Audio | Web Audio API | Custom sequencer for DS music (see §5.4) |
| Workers | Comlink | ROM parsing off the main thread |
| Tests | Vitest | Parsers + engine logic |
| Lint/format | ESLint + Prettier | — |

Pixel-perfect rules: `image-rendering: pixelated`, integer scaling, `TextureStyle.defaultOptions.scaleMode = 'nearest'`.

**Screen layout is a per-project toggle** (`settings.layout`):
- `single`: one widescreen-ish view (e.g. 400×240 or 256×192 scaled), with minimap, portraits, and the message log as overlays.
- `dual`: DS-style stacked 256×192 screens. Top screen shows the minimap, team status, and portraits; bottom screen shows gameplay.
Build all HUD pieces as layout-independent components that each layout arranges.

**Platform:** browser only. Projects autosave to IndexedDB. Exports are `.zip`. In Chromium, optionally offer "Save to folder" via the File System Access API for real on-disk backups.

**Distribution for non-technical users** (see `GETTING_STARTED.md`; keep it in sync):
- **Hosted:** deploy the built app to GitHub Pages. It must be an installable PWA (manifest + service worker) so it works offline after the first visit.
- **Download:** each GitHub Release attaches `SkyMaker-vX.X.zip`. It contains `Sky Maker.html` that runs by **double-clicking**, with no server and no install. Build it as a self-contained file (e.g. `vite-plugin-singlefile`) with Web Workers inlined as Blob URLs. It must work from `file://` in Chrome and Edge, including IndexedDB.
- Supported browsers: latest Chrome and Edge. Others are best-effort.
- No command line is ever required for players or creators. The ROM export CLI (§8b) is the one exception, and it gets a double-click launcher too (M20).

---

## 4. Repo layout

```
/packages
  /rom        # NDS filesystem + PMD format parsers (pure TS, no DOM)
  /assets     # Extraction pipeline: ROM -> decoded assets -> IndexedDB cache
  /engine     # Runtime: ground mode, dungeon mode, event interpreter, audio
  /schema     # Project data types + zod validators + migrations
/apps
  /editor     # RPG-Maker-style editor (React + Pixi)
  /player     # Standalone player that loads a project + user's ROM
/tools
  /rom-export # Later phase (§8b): Python CLI that applies a project to the
              # user's ROM via skytemple-files and outputs a BPS/xdelta patch.
              # Separate program, licensed GPL-3.0 (skytemple-files is GPL-3.0).
/docs
  formats.md  # Our notes on each file format as we implement it
```

---

## 5. ROM extraction layer (`packages/rom`, `packages/assets`)

**Reference implementations:** SkyTemple's `skytemple-files` (Python) documents each format in per-package READMEs; `pret/pmd-sky` is a full decompilation; `pmdsky-debug` has symbol/struct info. Use these as **references for format structure only** — we reimplement parsers in TypeScript so everything runs in-browser. (skytemple-files is GPL-3.0; don't copy its code verbatim into this repo unless we decide to license the project GPL-3.0 too.)

Optional dev-only check: a `scripts/verify/` Python script that uses `skytemple-files` locally to dump a file so we can diff our TS output against it. Never run in production, never committed output.

### 5.1 Container formats (build first)
- **NDS header + NitroFS** (FNT/FAT) → virtual filesystem `rom.readFile(path)`.
- **SIR0** pointer-wrapper.
- **PKDPX / AT4PX** compression.
- **Pack files** (`.bin` archives of many sub-files).

### 5.2 Asset formats (in order of need)
**Verified against a US ROM (`POKEDUN SORA`, game code `C2SE`, rev 0, 128 MB, 8,607 files).** Every path below exists. Record format findings in `docs/formats.md`.

ROM file counts for reference: `MAP_BG` has 441 `.bma`, 432 `.bpc`, 443 `.bpl`, 84 `.bpa`. `SOUND` has 210 `.smd`, 303 `.swd`, 42 `.sed`. `SCRIPT` has 5,959 files (original cutscene scripts, not needed for v1). `GROUND` has 549 files. `MONSTER` is 27 MB across 3 packs.

Validation: accept game code `C2SE` (US). Store a SHA-1 of the loaded ROM as the asset-cache key; do not hardcode any specific hash.

| Asset | Likely source | Output |
|---|---|---|
| Pokémon overworld sprites | `MONSTER/m_ground.bin` (WAN) | Pixi spritesheets: per-animation, 8 directions, frame timings, shadows |
| Pokémon dungeon sprites | `MONSTER/monster.bin`, `m_attack.bin` (WAN) | Same, incl. attack anims |
| Portraits | `FONT/kaomado.kao` | 40×40 PNG-equivalents per emotion |
| Ground map backgrounds | `MAP_BG/*.bma/.bpc/.bpl/.bpa` | Tile layers + palettes + palette animation |
| Dungeon tilesets | `DUNGEON/dungeon.bin` | Autotile sets (wall/floor/water variants) |
| Object sprites | `GROUND/*.wan` | Props, NPC objects |
| Text | `MESSAGE/text_e.str` | Pokémon names, move names, item names (for dropdowns) |
| Monster data | `BALANCE/monster.md` | Species, types, base stats, sprite IDs |
| Moves / items | `BALANCE/waza_p.bin`, `item_p.bin` | Database tables |
| Dungeon data | `BALANCE/mappa_s.bin` | Original floor layouts/spawn tables (reference + import presets) |
| Music | `SOUND/BGM/*.smd` + `*.swd` | See §5.4 |
| SFX | `SOUND/SE/*` | One-shot samples |

### 5.3 Extraction UX
1. First launch → "Load your Explorers of Sky ROM" drop zone + one-line explanation of why.
2. Worker extracts with a progress bar per category. Cache keyed by ROM hash; skip on later visits.
3. "Asset Browser" panel in the editor to preview every extracted sprite, tileset, portrait, and track.

### 5.3b Custom assets (day one)
- Import PNG sprite sheets (with a frame-slicing dialog: frame size, rows = directions, per-animation frame lists and durations), PNG tilesets (16×16 or 24×24 grid, plus a collision/autotile tagging tool), PNG portraits (40×40, one per emotion slot), and OGG/MP3 music with loop start/end points.
- Custom and ROM assets share one `AssetRef` type (`{ source: 'rom' | 'custom', id }`), so every picker in the editor shows both, filterable.
- Custom assets are stored in IndexedDB and included in project exports.

### 5.4 Music (highest-risk piece)
DS music is sequenced (SMD = note data, SWD = sample bank), not audio files. Plan:
1. **v1:** parse SWD samples + SMD events; build a minimal Web Audio sequencer (note on/off, tempo, program change, volume, pan, loops). Accept imperfect envelopes.
2. If it stalls: ship with SFX + a "no music" toggle and an option to drop in the user's own OGG per track, then return to it.
Keep this behind an `AudioBackend` interface so the fallback swaps cleanly.

---

## 6. Project data model (`packages/schema`)

All JSON, validated with zod, versioned with migrations.

```ts
Project {
  version, name, startMapId, startPosition,
  settings: {
    layout: 'single' | 'dual',
    systems: {               // every system toggleable (§8)
      shops, storage, bank, cafe, missionsBoard, outlawBoard,
      rankUps, recruitment, baseCamp, iqSkills, weather,
      monsterHouses, traps, belly, statuses
    }: boolean each
  },
  starter: StarterConfig,
  rankTable?: Rank[],        // names, point thresholds, unlocks
  maps: GroundMap[], dungeons: Dungeon[],
  characters: Character[], events: CommonEvent[],
  flags: FlagDef[], variables: VarDef[],
  items?: ItemOverride[], customAssets: CustomAsset[]
}

GroundMap {
  id, name, bgSource: { romMapId } | { custom },
  widthTiles, heightTiles,
  collision: Uint8 grid (0 walkable, 1 blocked, 2 water…),
  bgm: trackRef | null,
  actors: Actor[], triggers: Trigger[], exits: Exit[]
}

Actor { id, characterId | species, x, y, facing, animation,
        entries: EventEntry[] }   // which story graph runs, and when

EventEntry { graphId, startNodeId,
             trigger: 'action' | 'touch' | 'auto' | 'parallel',
             conditions: { flag?, variable?, minRank?, … } }
             // first entry whose conditions pass wins (replaces RPG Maker "pages")

StoryGraph {               // Twine-style: one canvas of connected nodes
  id, name, folder?,
  nodes: Node[], edges: Edge[],
  notes?: StickyNote[]     // free-floating comments on the canvas
}

Node { id, x, y, color?, tags?, ...one of:
  | { kind: 'passage', speaker: CharacterRef | null, emotion, text,  // Twine passage
      actions: Action[] }                 // run before the text shows (move, emote, fade…)
  | { kind: 'choice', prompt?, options: { id, label, showIf? }[] }   // one out-port per option
  | { kind: 'branch', condition }          // out-ports: true / false
  | { kind: 'switch', variable, cases }    // out-port per case + default
  | { kind: 'action', actions: Action[] }  // no text: cutscene beats, give item, set flag…
  | { kind: 'random', weights }            // out-port per weight
  | { kind: 'jump', graphId, nodeId }      // go to another graph (reusable scenes)
  | { kind: 'start' } | { kind: 'end' }
}

Edge { from: { node, port }, to: node }
```

`Action` = the same small JSON action set listed below (`{ type: 'moveActor', … }`). Graphs are data. Dungeon hooks (`onClear`, `onFail`, boss encounters) also point at a `graphId + startNodeId`.

```ts
Dungeon {
  id, name, floors: number, tilesetRef, bgm,
  floorRules: { from, to, layout: 'rooms'|'cave'|'single'|…,
                roomCount, itemDensity, trapDensity,
                spawns: { species, level, weight }[],
                items: { itemId, weight }[] }[],
  bossFloor?: { floor, encounterEventId },
  onClear: GraphRef, onFail: GraphRef
}

Character { id, displayName, species | customSpriteRef, portraitSet, defaultFacing }

StarterConfig {
  mode: 'quiz' | 'freeChoice' | 'fixed',
  partnerMode: 'choice' | 'fixed' | 'none',
  allowedSpecies: SpeciesRef[],            // for quiz results / free choice
  quiz?: { questions: { text, answers: { text, natureScores }[] }[],
           natureToSpecies: Record<Nature, SpeciesRef[]>,
           introText, resultText },
  fixed?: { leader, partner },
  allowNaming: boolean
}

Shop { id, name, keeperCharacterId, inventory: { itemRef, price, stock?, unlockFlag? }[],
       buyRate, sellRate }

Mission { id, board: 'job' | 'outlaw', title, clientCharacterId,
          type: 'rescue' | 'escort' | 'deliver' | 'find' | 'arrest',
          dungeonId, floor, target, reward: { money?, items?, rankPoints? },
          availability: { flag?, minRank?, random?: boolean } }
// plus MissionGenerator rules for auto-generated daily missions
```

### Node types and actions (v1 set)
**Flow (nodes):** Passage (speaker, portrait emotion, text) · Choice · Branch (if/else) · Switch · Random · Action · Jump to graph · Start · End.

**Actions (inside Passage/Action nodes):** Set Flag / Variable · Move Actor (path or to tile) · Face · Play Animation · Wait · Fade In/Out · Screen Shake · Camera Pan/Follow · Play/Stop BGM · Play SFX · Transfer Map · Enter Dungeon · Give/Take Item · Recruit Pokémon · Emote bubble (!, ?, ♪) · Show Title Card.

One interpreter in the engine walks the graph: run the node's actions, show its text, follow the chosen or matching edge. **No scripting required.** (Optional later: an "Advanced" expression field on Branch nodes.)

**Twine-style text shortcuts** (optional, typed inside a passage, turned into real nodes and edges on blur): `[[Option text->Target passage]]` creates a choice and links it; `[[Target passage]]` links straight through. Lets you write fast in prose and tidy the graph later.

---

## 7. Editor (`apps/editor`)

RPG Maker XP mental model for maps (**list on the left, canvas in the middle, palette/inspector on the right, toolbar on top**); Twine mental model for dialogue and events (node graph).

### Modes
1. **Map Mode** offers two ways to build:
   - **From a ROM map:** pick any original ground map (Treasure Town, the guild, beaches, etc.) as the base. Edit collision, place exits, and optionally paint extra tile layers on top.
   - **From scratch:** paint with tiles sliced from ROM map tilesets (BPC chunks) or custom tilesets, using layers (ground, detail, overhead), collision, and exits.
   - Either way, the result is the same `GroundMap` type.
2. **Event Mode (node graph, Twine-style):** click a tile to create or edit an actor or trigger, then open its **story graph**:
   - Infinite canvas with pan/zoom and a minimap. Passages are cards showing speaker portrait + text preview; choices show one output port per option.
   - Drag from a port to empty space → pick the next node type from a menu (fastest way to write branching dialogue).
   - Inspector on the right edits the selected node (speaker, emotion, text, actions, conditions).
   - Graph list on the left: per-map graphs plus shared graphs (old "common events": rank-up ceremony, fainting, day end), grouped in folders.
   - **Play from here:** right-click any node to playtest starting at it, with flags/vars pre-set from a picker.
   - Highlights: unreachable nodes, dead ends that aren't an End node, and choice options with no link.
   - Copy/paste nodes across graphs; group selection into a "Jump" subgraph.
   - Auto-layout button (left-to-right) for tidying.
   This is the only event/cutscene authoring tool for v1. Canvas library: **React Flow** (`@xyflow/react`).
3. **Dungeon Designer:** a floor-range table and spawn/item/trap tables, with searchable species and item pickers that show sprite thumbnails. Each system toggle (weather, monster houses, etc.) gets per-floor settings. A **Preview floor** button generates a random floor live.
4. **Starter Setup:** pick the mode (quiz, free choice, or fixed). The quiz editor holds questions, answers, nature scores, a nature-to-species table, and intro/result text. Includes a "Take the quiz" test button.
5. **Systems panel:** on/off switches for every built-in system. Each enabled system unlocks its own editor tab:
   - **Shops & Services:** shops, storage, bank, café-style vendors, each linked to an NPC.
   - **Missions:** hand-authored job/outlaw postings plus generator rules (dungeon pool, reward curves).
   - **Ranks:** rank names, point thresholds, and what each rank unlocks.
   - **Recruitment:** per-species recruit rates, base camp areas, team size limits.
   - **IQ & Statuses:** enable/disable individual IQ skills and status effects.
6. **Database:** Characters, Flags/Variables, Items (rename or describe on top of ROM items, or add custom items), Moves (read-only from ROM, with optional overrides).
7. **Asset Browser:** every extracted ROM asset plus custom imports, searchable, with an Import button.

### Must-haves
- Undo/redo (command pattern) for every edit.
- Autosave to IndexedDB; export/import project as `.zip` (JSON + user's custom art only).
- **Playtest** button: launches player from the current map with a debug overlay (flags, vars, FPS, tile coords).
- Keyboard shortcuts: B brush, E eraser, F fill, Ctrl+Z/Y, Space-drag pan, scroll zoom.
- Sprite pickers always show the animated sprite, not just a name.

---

## 8. Engine / player (`packages/engine`, `apps/player`)

### Ground mode
- Tile collision movement, 8-directional, PMD walk speed feel.
- Interact (A / Enter / Space), dialogue box with portrait + typewriter text + per-character blip.
- Graph interpreter: walks nodes, runs blocking/non-blocking actions, waits for choices; parallel graphs for ambient NPC behaviour.
- Map transitions with fade.

### Dungeon mode: core (always on)
- Procedural floors: rooms + corridors, cave, and single-room layouts. Stairs, items.
- Turn-based grid: the player acts, then partners act (follow + attack AI), then enemies act (approach + attack). Speed and turn order follow PMD conventions.
- Stats: HP, level, Attack/Defense/Sp.Atk/Sp.Def, EXP. Four moves per Pokémon, PP, the full type chart, move data from the ROM.
- Items: data from the ROM item table. Bag capacity.
- Minimap, message log. Fainting triggers `onFail`.
- A boss floor triggers an event, then a fight.

### Toggleable systems (each behind `settings.systems.*`)
Build these as separate modules with a shared interface (`init`, `onTurn`, `onFloorStart`, `onEnterTown`, `serialize`), so turning one off removes it cleanly.

| System | Notes |
|---|---|
| Belly | Hunger drain, food items, starvation damage |
| Traps | Full trap set, Wonder Tiles |
| Statuses | Sleep, poison, burn, paralysis, confusion, etc. Each individually toggleable |
| Weather | Per-floor weather and its effects on moves and HP |
| Monster Houses | Chance per floor, spawn burst |
| IQ Skills | IQ points from gummis, skill unlocks, AI behaviour changes |
| Recruitment | Recruit chance on defeat, team roster, base camp areas, team size limit |
| Shops / Kecleon | Town shops and in-dungeon Kecleon shops, including theft response |
| Storage / Bank | Kangaskhan-style storage and Duskull-style bank equivalents, NPC-agnostic |
| Café / vendors | Configurable trade or recycle vendors |
| Missions | Job and outlaw boards, mission generation, client appearing in-dungeon, rewards |
| Ranks | Points, rank-ups, unlock flags |

### Starter flow
Runs from `StarterConfig`. Quiz mode shows the questions, tallies nature scores, and assigns a species. A partner-pick screen follows if enabled, then naming if enabled.

### Saves
Three save slots per project in IndexedDB. Each stores map, position, flags, vars, party, roster, bag, storage, bank, rank, active missions, and dungeon progress.

### Controls
Keyboard first (arrows/WASD, Z/X/Enter/Esc), gamepad via Gamepad API second.

---

## 8b. ROM patch export (later phase)

Two export targets share one project:

| Target | Output | Runs on | Feature set |
|---|---|---|---|
| **Web** (primary) | Hosted player link + project file | Any browser; player loads their own ROM | Everything in this spec |
| **ROM patch** | `.bps` / `.xdelta` patch | DS emulator (melonDS, DeSmuME) or real hardware, after the player patches their own clean US ROM | Only what the original engine can do |

### How it works
1. **Compatibility checker (in the editor).** A "ROM export" panel lints the project and lists everything that won't translate, with a link to each item. A project-level switch, **"Keep ROM-compatible"**, warns the moment you use a web-only feature.
2. **Manifest export (in the editor).** The editor writes `export/rom-manifest.json`: maps, actors, event pages, dungeons, text, starter quiz, shop tables, custom images. It holds references and the user's own art only.
3. **`tools/rom-export` CLI (on the user's machine).** `python -m rom_export --rom clean.nds --manifest rom-manifest.json --out build/`. It uses `skytemple-files` to write the changes into a copy of the ROM:
   - Story graphs compile to **ExplorerScript** (each node becomes a label; edges become jumps, choices become menus, branches become `if`), then to SSB scripts.
   - Ground maps either reuse a ROM map (BMA/BPC/BPL) or quantize painted maps into DS tile/palette limits (SkyTemple's `tilequant` approach).
   - Dungeons go into existing dungeon slots and floor tables (`mappa_s.bin`).
   - Text goes into `text_e.str`. Custom sprites and portraits are imported into the WAN/KAO packs.
   - The starter quiz goes into the original personality-test data.
4. **Patch output.** The CLI diffs the result against the clean ROM and writes `build/<project>.bps` (plus `.xdelta`). It deletes the patched ROM unless `--keep-rom` is passed for local testing.
5. **Test.** Boot the patched ROM in melonDS with a smoke-test checklist: title screen, new game, starter flow, first map, first dungeon.

### Translates to the ROM (target set; verify each during implementation)
- Ground maps built on ROM backgrounds; painted maps within tile and palette limits.
- Actors, story graphs, and most v1 nodes/actions (passages, choices, branches, switches, flags/vars, movement, camera, fades, BGM/SFX from the ROM, transfers, enter dungeon, items, emotes). Random nodes map to the engine's RNG if available; otherwise the checker flags them.
- Dungeons within the available slots: floor layouts, spawns, items, traps, weather, monster houses.
- Starter quiz questions, nature-to-species tables, fixed starters.
- Shop inventories, missions, ranks, and recruitment rates, where the original data tables allow.
- Custom sprites, portraits, and tiles that fit the DS formats.

### Web-only (the checker flags these)
- Turning off core systems the original engine always runs (e.g. belly, IQ), unless an existing SkyTemple ASM patch covers it.
- Custom OGG/MP3 music (the ROM only plays SMD/SWD sequences).
- Single-screen layout (the ROM is always dual-screen).
- More dungeons, maps, or species than the ROM has slots for.
- Any future web-only node types, actions, or mechanics.

### Distribution checklist (README template the export generates)
- Requires a clean **US** Explorers of Sky ROM (game code `C2SE`).
- Apply with Rom Patcher JS, Flips, or xdelta.
- No ROM is included or linked.
- Non-commercial fan project; not affiliated with Nintendo, Creatures, Game Freak, The Pokémon Company, or Spike Chunsoft.

---

## 9. Milestones

Each milestone ends with a demo the user can click through.

| # | Milestone | Done when… |
|---|---|---|
| M0 | Scaffold | Monorepo builds; editor + player apps open blank screens; CI runs tests |
| M1 | ROM loader | Drop ROM → validated → NitroFS file tree listed in a debug panel |
| M2 | Sprites + portraits | Asset Browser shows animated Pokémon (all directions) + portraits |
| M3 | Ground maps | Pick any ROM town BG and render it with palette animation |
| M4 | Map editor | Paint collision, place actors, save/load project |
| M5 | Ground runtime | Walk around a custom map, talk to an NPC with portrait dialogue |
| M6 | Story graphs | Node editor (React Flow) with all v1 node types + actions, entry conditions, play-from-node; a branching 2-minute cutscene works end to end |
| M7 | Dungeon gen | Dungeon Designer previews random floors with ROM tilesets |
| M8 | Dungeon play | Fight through 3 floors with a partner, items, stairs, boss event |
| M9 | Music | SMD/SWD playback (or fallback) on maps and dungeons |
| M10 | Custom assets | Import a PNG sprite sheet, tileset, and portrait, plus an OGG track, and use them in a map |
| M11 | Starter flow | Quiz editor works; quiz, free-choice, and fixed modes all playable |
| M12 | Town systems | Shops, storage, bank, and vendors, each toggleable and attached to NPCs |
| M13 | Missions + ranks | Boards, generated missions, rewards, and rank-ups work end to end |
| M14 | Dungeon depth | Belly, traps, statuses, weather, monster houses, IQ, recruitment, Kecleon shops |
| M15 | Layout toggle + polish + release | Single/dual layout switch, title screen, 3 save slots, export/import, debug overlay. GitHub Pages PWA deploy and a double-click `Sky Maker.html` release zip, both following `GETTING_STARTED.md` |
| M16 | ROM compatibility checker | "ROM export" panel lists every web-only feature in a project; "Keep ROM-compatible" switch warns live |
| M17 | ROM export: data | CLI applies text, starter quiz, dungeon floor tables, and shop tables; outputs a `.bps` that boots in melonDS |
| M18 | ROM export: maps + scripts | Maps, actors, and event pages compile to ExplorerScript/SSB; a custom cutscene plays in the emulator |
| M19 | ROM export: custom art | Custom sprites, portraits, and painted tilesets import into the ROM formats |
| M20 | ROM export: release | Export button produces patch + README; full sandbox-slice project plays start to finish on emulator |

**First playable target ("sandbox slice"):** a test project built entirely in the editor that exercises every tool: a remixed ROM town, a from-scratch map, NPCs with conditional event pages, a cutscene, a starter quiz, one 3-floor dungeon with a boss, a shop, and one mission. It is a test project, not a story.

---

## 10. Working agreement for the AI agent

- Before each milestone, write a short plan in `docs/plan-MX.md`; then implement.
- When reverse-engineering a format, document fields in `docs/formats.md` with the reference you used.
- Parsers return typed objects; never let raw `DataView` offsets leak outside `packages/rom`.
- If a format is unclear, stop and ask rather than guess silently.
- Prefer boring, readable code over clever code — the user will read and tweak it.
- After each task: run tests, run the app, and list what to click to verify.

---

## 11. Open questions (fill in as we go)

Decided:
- [x] No built-in story; the editor is a story-agnostic toolkit.
- [x] Maps can come from a ROM base or be painted from scratch.
- [x] Dialogue and events are authored as **Twine-style node graphs** (changed from RPG Maker command lists).
- [x] All PMD systems are built in and toggleable per project.
- [x] Single user (the project owner).
- [x] Starter mode is chosen per project (quiz, free choice, or fixed).
- [x] Layout is single/dual, toggleable per project.
- [x] Custom PNG/OGG assets are supported from day one.
- [x] Browser-based, with IndexedDB storage and zip export.

Still open:
- [x] US ROM (`C2SE`) first; EU later.
- [x] Two export targets: web (primary) and ROM patch (later phase, M16–M20). Share patches, never ROMs.
- [ ] Will finished games be shared publicly? This affects the license choice and the player's ROM-load screen copy.
