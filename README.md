# Sky Maker

A browser-based engine and RPG Maker XP–style editor for making new Pokémon Mystery Dungeon fan games. It uses sprites, tiles, portraits and music pulled from **your own** *Explorers of Sky* (US) ROM.

- Runs entirely in the browser. Nothing to install.
- The ROM never leaves your machine. Assets are extracted locally and cached in your browser.
- **This repo contains no ROM and no ROM-derived assets.** You need your own copy of the game to use it.

**Try it:** https://desdotjs.github.io/pokemon-mystery-fangames/ (bring your own Explorers of Sky US ROM)

## New here?
Read **[GETTING_STARTED.md](GETTING_STARTED.md)**: a plain-language guide to running Sky Maker, making a game, and playing shared games. No coding needed.

## Docs
- [`docs/SPEC.md`](docs/SPEC.md): the full build spec and milestones (start here)
- [`docs/mockups/`](docs/mockups/): editor UI mockups (HTML source + PNGs in `png/`)

## Dev tools
- `scripts/verify/nitrofs_list.py <rom.nds>`: prints the ROM header and its internal file tree. Dev-only; used to check format assumptions.

## Status
- **M0 + M1 done:** load your ROM, browse its file system.
- **M2 started:** browse all Pokémon portraits.
- **M6 (story graphs) first version:** Twine-style node editor in the **Events** tab: passages with ROM portraits and expressions, choices (with "only show if"), branches, actions, random paths, warnings, undo/redo, autosave, export/import, and **Play from here** with editable flags/items.
- Not yet: maps, sprites, dungeons, music, linking graphs to NPCs on a map, Twine `[[link]]` shortcuts.

## Run it (developers)
```
pnpm install
pnpm dev        # editor at http://localhost:5173
pnpm test       # parser, schema and story-runner tests (synthetic fixtures only)
pnpm build      # single-file build at apps/editor/dist/index.html (runs by double-click)
```

Fan project. Pokémon and Pokémon Mystery Dungeon are trademarks of Nintendo, Creatures, Game Freak and The Pokémon Company. Not affiliated with or endorsed by them.
