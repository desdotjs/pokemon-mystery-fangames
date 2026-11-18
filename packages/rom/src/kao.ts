import { Bytes, RomFormatError } from "./bytes";
import { atDecompress } from "./px";

/**
 * KAO portrait archive (FONT/kaomado.kao).
 * Format reference: skytemple-files `graphics/kao`.
 *
 * Layout: a table of entries, each 40 x i32 pointers (one per slot), preceded by one
 * padding entry. Negative pointer = empty slot. Each image = 48-byte RGB palette
 * (16 colours) + AT-compressed 4bpp pixels, stored as 5x5 tiles of 8x8.
 * Slots interleave faces: slot 2n = face n, slot 2n+1 = face n mirrored.
 */

export const KAO_SLOTS = 40;
export const PORTRAIT_SIZE = 40;

export const FACE_NAMES = [
  "Normal", "Happy", "Pain", "Angry", "Worried", "Sad", "Crying", "Shouting", "Teary-Eyed",
  "Determined", "Joyous", "Inspired", "Surprised", "Dizzy", "Special 0", "Special 1", "Sigh",
  "Stunned", "Special 2", "Special 3",
] as const;

export function slotName(slot: number): string {
  const face = FACE_NAMES[slot >> 1] ?? `Face ${slot >> 1}`;
  return slot & 1 ? `${face} (flipped)` : face;
}

export class Kao {
  private readonly b: Bytes;
  private readonly firstToc = KAO_SLOTS * 4;
  readonly entryCount: number;

  constructor(readonly data: Uint8Array) {
    this.b = new Bytes(data);
    const firstPointer = this.b.u32(this.firstToc);
    const n = (firstPointer - this.firstToc) / (KAO_SLOTS * 4);
    if (!Number.isInteger(n) || n <= 0) throw new RomFormatError("Portrait file has an unexpected layout.");
    this.entryCount = n;
  }

  private pointer(entry: number, slot: number): number {
    return this.b.i32(this.firstToc + (entry * KAO_SLOTS + slot) * 4);
  }

  has(entry: number, slot: number): boolean {
    return entry >= 0 && entry < this.entryCount && this.pointer(entry, slot) > 0;
  }

  /** Slots that hold an image for this entry. */
  slots(entry: number): number[] {
    const out: number[] = [];
    for (let s = 0; s < KAO_SLOTS; s++) if (this.has(entry, s)) out.push(s);
    return out;
  }

  /** Decode one portrait to 40x40 RGBA. Palette index 0 is drawn opaque (portraits have no transparency). */
  rgba(entry: number, slot: number): Uint8ClampedArray<ArrayBuffer> | null {
    if (!this.has(entry, slot)) return null;
    const p = this.pointer(entry, slot);
    const pal = this.data.subarray(p, p + 48);
    const px = atDecompress(this.data, p + 48);
    const out = new Uint8ClampedArray(new ArrayBuffer(PORTRAIT_SIZE * PORTRAIT_SIZE * 4));
    for (let i = 0; i < px.length * 2; i++) {
      const byte = px[i >> 1]!;
      const idx = i & 1 ? byte >> 4 : byte & 0xf; // low nibble first
      const tile = i >> 6;
      const inTile = i & 63;
      const x = (tile % 5) * 8 + (inTile & 7);
      const y = Math.floor(tile / 5) * 8 + (inTile >> 3);
      const d = (y * PORTRAIT_SIZE + x) * 4;
      out[d] = pal[idx * 3]!;
      out[d + 1] = pal[idx * 3 + 1]!;
      out[d + 2] = pal[idx * 3 + 2]!;
      out[d + 3] = 255;
    }
    return out;
  }
}
