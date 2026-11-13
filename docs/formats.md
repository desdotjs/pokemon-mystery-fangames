# Format notes

Findings recorded while implementing parsers. Reference used for each: SkyTemple's `skytemple-files` (v1.x) source and per-package notes. Verified against a US ROM (`C2SE`, rev 0) by comparing decoded output to `skytemple-files` output.

## NDS header + NitroFS — `packages/rom/src/nds.ts`
- Header: title `0x00` (12 bytes), game code `0x0C` (4), maker `0x10` (2), revision `0x1E`.
- FNT offset/size at `0x40`/`0x44`, FAT offset/size at `0x48`/`0x4C`.
- FNT main table: 8 bytes per directory (`u32` sub-table offset relative to FNT, `u16` first file ID, `u16` parent/total). Root directory ID is `0xF000`.
- Sub-table entries: length byte (bit 7 = directory), name, and for directories a `u16` directory ID. `0` ends the list.
- FAT: `u32 start, u32 end` per file ID.
- US ROM: 8,607 files.

## PX compression + AT containers — `packages/rom/src/px.ts`
- Containers: `AT4PX` (header `0x12` bytes, `u16` decompressed length at `0x10`), `PKDPX` (header `0x14`, `u32` length at `0x10`), `AT4PN` (raw, header 7). All have magic (5 bytes), `u16` container size at `+5`, and the PX ones have 9 control flags at `+7`.
- PX stream: control byte, read bits high to low. `1` = literal byte. `0` = read a byte: if its high nibble equals one of the 9 flags, emit a 2-byte nibble pattern; otherwise it's a back-reference of length `high + 3` at offset `(-0x1000 + (low << 8)) | nextByte`. Copy byte by byte, because ranges can overlap.

## KAO portraits (`FONT/kaomado.kao`) — `packages/rom/src/kao.ts`
- One padding entry, then entries of 40 × `i32` pointers. Entry count = (first pointer − 160) / 160. Negative pointer = empty.
- Image = 48-byte palette (16 RGB colours) + AT container (all 2,050 images in the US ROM are `AT4PX`).
- Pixels: 4bpp, low nibble first, stored as 25 tiles of 8×8 laid out 5×5 → 40×40.
- Slots interleave: `2n` = face `n`, `2n+1` = face `n` mirrored. 20 faces: Normal, Happy, Pain, Angry, Worried, Sad, Crying, Shouting, Teary-Eyed, Determined, Joyous, Inspired, Surprised, Dizzy, Special 0, Special 1, Sigh, Stunned, Special 2, Special 3.
- KAO entry `i` belongs to monster ID `i + 1`. US ROM: 1,154 entries, 652 with at least one portrait.

## Strings (`MESSAGE/text_e.str`) — `packages/rom/src/strings.ts`
- `u32` pointer table followed by null-terminated strings. The table ends at the first pointer ≥ file length.
- Encoding: Windows-1252, except `0xBD` = ♂ and `0xBE` = ♀. Strings can contain `[tag]` control codes (not handled yet).
- US: 18,451 strings. Pokémon names are indices 8734–9333, indexed by monster ID (ID 0 is a placeholder).

## Browser gotchas
- **IndexedDB value limit:** Chrome rejects a single value over ~127 MB. The ROM is 128 MB, so store it as a `Blob`, not an `ArrayBuffer`.
- **Workers from `file://`:** module workers created from Blob URLs fail when the page is opened by double-click. Build workers as classic (`worker.format: "iife"`).
