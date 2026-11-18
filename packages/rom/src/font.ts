import { Bytes, RomFormatError } from "./bytes";

/**
 * SIR0-wrapped 12x12 text fonts (FONT/kanji.dat, kanji_b.dat, unknown.dat).
 * Format reference: skytemple-files `graphics/fonts/font_sir0`.
 *
 * SIR0 header: "SIR0", u32 content-header pointer, u32 pointer-list pointer. Pointers are file-absolute.
 * Content header: u32 entry count, u32 entries pointer.
 * Entry (12 bytes): u32 glyph data pointer, u8 char, u8 table, u32 width, u8 category, u8 padding.
 * Glyph: 72 bytes, 4bpp, low nibble first, 12x12 row-major.
 * Table 0 holds single-byte characters (Windows-1252, except 0xBD = ♂, 0xBE = ♀).
 */

export const GLYPH_SIZE = 12;
const GLYPH_PIXELS = GLYPH_SIZE * GLYPH_SIZE;

/** Symbols the game keeps in its two-byte table 0x81 (Shift-JIS codes), stored after the 256 single-byte slots. */
const SPECIALS: [sjisLow: number, ch: string][] = [
  [0xf4, "♪"], [0x60, "～"], [0xa8, "→"], [0xa9, "←"], [0xaa, "↑"], [0xab, "↓"],
];
const SLOT_COUNT = 256 + SPECIALS.length;

export interface BitmapFont {
  /** Advance width in pixels per glyph slot (0 = no glyph). Slots 0–255 = byte codes, then SPECIALS. */
  advance: Uint8Array;
  /** Glyph slots × 144 pixel values (0–15). */
  pixels: Uint8Array;
  /** Highest pixel value used. */
  maxValue: number;
  /** True if pixels use shading levels (kanji_b.dat) rather than a single ink value. */
  shaded: boolean;
}

export function readSir0Font(data: Uint8Array): BitmapFont {
  const b = new Bytes(data);
  if (b.ascii(0, 4) !== "SIR0") throw new RomFormatError("Font file isn't SIR0-wrapped.");
  const header = b.u32(4);
  const count = b.u32(header);
  const entries = b.u32(header + 4);
  const advance = new Uint8Array(SLOT_COUNT);
  const pixels = new Uint8Array(SLOT_COUNT * GLYPH_PIXELS);
  let maxValue = 0;
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const e = entries + i * 12;
    const ptr = b.u32(e);
    const code = b.u8(e + 4);
    const table = b.u8(e + 5);
    const width = b.u32(e + 6);
    let char: number;
    if (table === 0) char = code;
    else if (table === 0x81 && SPECIALS.some(([lo]) => lo === code)) char = 256 + SPECIALS.findIndex(([lo]) => lo === code);
    else continue; // other two-byte glyphs are Japanese leftovers
    let rightmost = -1;
    for (let p = 0; p < GLYPH_PIXELS; p++) {
      const byte = data[ptr + (p >> 1)]!;
      const v = p & 1 ? byte >> 4 : byte & 0xf;
      pixels[char * GLYPH_PIXELS + p] = v;
      if (v) {
        seen.add(v);
        maxValue = Math.max(maxValue, v);
        rightmost = Math.max(rightmost, p % GLYPH_SIZE);
      }
    }
    // Some fonts store the full 12px box as width; derive a proportional advance from the ink instead.
    advance[char] = width >= GLYPH_SIZE && rightmost >= 0 ? Math.min(GLYPH_SIZE, rightmost + 2) : Math.max(1, width);
  }
  return { advance, pixels, maxValue: maxValue || 15, shaded: seen.size > 1 };
}

/** Unicode → glyph slot in a BitmapFont (null if the game's fonts can't show it). */
export function charToByte(ch: string): number | null {
  const special = SPECIALS.findIndex(([, c]) => c === ch);
  if (special >= 0) return 256 + special;
  if (ch === "♂") return 0xbd;
  if (ch === "♀") return 0xbe;
  const c = ch.codePointAt(0)!;
  if (c >= 0x20 && c < 0x80) return c;
  if (c >= 0xa0 && c <= 0xff) return c;
  const cp1252: Record<string, number> = { "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "…": 0x85, "–": 0x96, "—": 0x97, "•": 0x95, "€": 0x80, "™": 0x99 };
  return cp1252[ch] ?? null;
}

export function measureText(font: BitmapFont, text: string): number {
  let w = 0;
  for (const ch of text) w += glyphAdvance(font, ch);
  return w;
}

export function glyphAdvance(font: BitmapFont, ch: string): number {
  const code = charToByte(ch);
  const fallback = font.advance[0x3f] || 6; // "?"
  return code == null ? fallback : font.advance[code] || fallback;
}

/** Word-wrap to a pixel width, keeping explicit newlines. */
export function wrapText(font: BitmapFont, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      if (line && measureText(font, (line + word).trimEnd()) > maxWidth) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line += word;
      }
      // A single word longer than the line: hard-break it.
      while (measureText(font, line.trimEnd()) > maxWidth && line.trim().length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measureText(font, line.slice(0, cut)) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
