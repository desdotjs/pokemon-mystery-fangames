# Sky Maker

A browser-based engine and RPG Maker XP–style editor for making new Pokémon Mystery Dungeon fan games. It uses sprites, tiles, portraits and music pulled from **your own** *Explorers of Sky* (US) ROM.

- Runs entirely in the browser. Nothing to install.
- The ROM never leaves your machine. Assets are extracted locally and cached in your browser.
- **This repo contains no ROM and no ROM-derived assets.** You need your own copy of the game to use it.

## New here?
Read **[GETTING_STARTED.md](GETTING_STARTED.md)**: a plain-language guide to running Sky Maker, making a game, and playing shared games. No coding needed.

## Docs
- [`docs/SPEC.md`](docs/SPEC.md): the full build spec and milestones (start here)
- [`docs/mockups/`](docs/mockups/): editor UI mockups (HTML source + PNGs in `png/`)

## Dev tools
- `scripts/verify/nitrofs_list.py <rom.nds>`: prints the ROM header and its internal file tree. Dev-only; used to check format assumptions.

## Status
**M0 + M1 done, M2 started.** The editor loads your ROM, shows its file system, and browses all Pokémon portraits. Other tabs are placeholders.

## Run it (developers)
```
pnpm install
pnpm dev        # editor at http://localhost:5173
pnpm test       # parser tests (synthetic fixtures only)
pnpm build      # single-file build at apps/editor/dist/index.html (runs by double-click)
```

Fan project. Pokémon and Pokémon Mystery Dungeon are trademarks of Nintendo, Creatures, Game Freak and The Pokémon Company. Not affiliated with or endorsed by them.
