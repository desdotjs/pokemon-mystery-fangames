# PMD Sky Fan Engine + Editor — Build Spec

> Working title: **Sky Maker**. A browser-based game engine and RPG Maker XP–style editor for making *new* Pokémon Mystery Dungeon stories, using sprites, tiles, portraits, and music extracted at runtime from the player's own *Explorers of Sky* ROM.

This file is the source of truth for the AI coding agent. Read it fully before writing code. When something here conflicts with a later instruction from the user, the user wins — then update this file.

---

## 1. Goals

1. **Editor (primary deliverable):** a complete, story-agnostic toolkit. The engine ships with **no built-in story**. The user writes everything (towns, dungeons, characters, dialogue, cutscenes, quests) with almost no code: click, paint, drag, pick from lists.
2. **Every major PMD system built in and toggleable** per project (§8): town services, missions boards, recruitment, full dungeon mechanics, starter selection.
3. **Player:** run a project as a playable game in the browser, with an overworld ("ground mode") and turn-based dungeon crawling.
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
        pages: EventPage[] }   // RPG Maker-style pages w/ conditions

EventPage { conditions: { flag?, variable?, … },
            trigger: 'action' | 'touch' | 'auto' | 'parallel',
            commands: Command[] }

Dungeon {
  id, name, floors: number, tilesetRef, bgm,
  floorRules: { from, to, layout: 'rooms'|'cave'|'single'|…,
                roomCount, itemDensity, trapDensity,
                spawns: { species, level, weight }[],
                items: { itemId, weight }[] }[],
  bossFloor?: { floor, encounterEventId },
  onClear: Command[], onFail: Command[]
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

### Event commands (v1 set)
Show Text (speaker, portrait emotion, text) · Choice · Conditional Branch · Set Flag / Variable · Move Actor (path or to tile) · Face · Play Animation · Wait · Fade In/Out · Screen Shake · Camera Pan/Follow · Play/Stop BGM · Play SFX · Transfer Map · Enter Dungeon · Give/Take Item · Recruit Pokémon · Call Common Event · Emote bubble (!, ?, ♪) · Show Title Card.

Commands are plain JSON objects (`{ type: 'showText', … }`) run by one interpreter in the engine. Editor renders each type with a form — **no scripting required**. (Optional later: an "Advanced" raw-JSON or tiny script command.)

---

## 7. Editor (`apps/editor`)

RPG Maker XP mental model: **map list on the left, canvas in the middle, palette/inspector on the right, toolbar on top.**

### Modes
1. **Map Mode** offers two ways to build:
   - **From a ROM map:** pick any original ground map (Treasure Town, the guild, beaches, etc.) as the base. Edit collision, place exits, and optionally paint extra tile layers on top.
   - **From scratch:** paint with tiles sliced from ROM map tilesets (BPC chunks) or custom tilesets, using layers (ground, detail, overhead), collision, and exits.
   - Either way, the result is the same `GroundMap` type.
2. **Event Mode:** click a tile to create or edit an actor or trigger. The event page editor uses an **RPG Maker XP–style command list**: add, reorder, indent for branches, and double-click to edit a command's form. This is the only cutscene authoring tool for v1.
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
- Event interpreter with blocking/non-blocking commands; parallel events.
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
| M6 | Event system | Full v1 command set + page conditions; a 2-minute cutscene works end to end |
| M7 | Dungeon gen | Dungeon Designer previews random floors with ROM tilesets |
| M8 | Dungeon play | Fight through 3 floors with a partner, items, stairs, boss event |
| M9 | Music | SMD/SWD playback (or fallback) on maps and dungeons |
| M10 | Custom assets | Import a PNG sprite sheet, tileset, and portrait, plus an OGG track, and use them in a map |
| M11 | Starter flow | Quiz editor works; quiz, free-choice, and fixed modes all playable |
| M12 | Town systems | Shops, storage, bank, and vendors, each toggleable and attached to NPCs |
| M13 | Missions + ranks | Boards, generated missions, rewards, and rank-ups work end to end |
| M14 | Dungeon depth | Belly, traps, statuses, weather, monster houses, IQ, recruitment, Kecleon shops |
| M15 | Layout toggle + polish | Single/dual layout switch, title screen, 3 save slots, export/import, debug overlay |

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
- [x] Cutscenes are authored as RPG Maker–style command lists.
- [x] All PMD systems are built in and toggleable per project.
- [x] Single user (the project owner).
- [x] Starter mode is chosen per project (quiz, free choice, or fixed).
- [x] Layout is single/dual, toggleable per project.
- [x] Custom PNG/OGG assets are supported from day one.
- [x] Browser-based, with IndexedDB storage and zip export.

Still open:
- [x] US ROM (`C2SE`) first; EU later.
- [ ] Will finished games be shared publicly? This affects the license choice and the player's ROM-load screen copy.
