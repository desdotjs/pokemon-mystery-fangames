# Sky Maker

A browser-based engine and RPG Maker XP–style editor for making new Pokémon Mystery Dungeon fan games. It uses sprites, tiles, portraits and music pulled from **your own** *Explorers of Sky* (US) ROM.

- Runs entirely in the browser. Nothing to install.
- The ROM never leaves your machine. Assets are extracted locally and cached in your browser.
- **This repo contains no ROM and no ROM-derived assets.** You need your own copy of the game to use it.

## Docs
- [`docs/SPEC.md`](docs/SPEC.md): the full build spec and milestones (start here)
- [`docs/mockups/`](docs/mockups/): editor UI mockups (HTML source + PNGs in `png/`)

## Dev tools
- `scripts/verify/nitrofs_list.py <rom.nds>`: prints the ROM header and its internal file tree. Dev-only; used to check format assumptions.

## Status
Pre-code. Next milestone: **M0 (scaffold) → M1 (ROM loader)**. ROM patch export is planned for M16–M20 (see SPEC §8b).

Fan project. Pokémon and Pokémon Mystery Dungeon are trademarks of Nintendo, Creatures, Game Freak and The Pokémon Company. Not affiliated with or endorsed by them.
