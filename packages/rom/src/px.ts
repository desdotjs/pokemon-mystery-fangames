import { Bytes, RomFormatError } from "./bytes";

/**
 * PX compression and the "AT" containers that wrap it (AT4PX, PKDPX, AT4PN).
 * Format reference: skytemple-files `compression/px` and `compression_container/*` READMEs/models.
 */

const MIN_MATCH = 3;

function nibblePattern(flagIdx: number, low: number): [number, number] {
  if (flagIdx === 0) {
    const b = (low << 4) | low;
    return [b, b];
  }
  let base = low;
  if (flagIdx === 1) base += 1;
  else if (flagIdx === 5) base -= 1;
  const ns = [base, base, base, base];
  if (flagIdx >= 1 && flagIdx <= 4) ns[flagIdx - 1]! -= 1;
  else ns[flagIdx - 5]! += 1;
  return [((ns[0]! << 4) | ns[1]!) & 0xff, ((ns[2]! << 4) | ns[3]!) & 0xff];
}

/** Decompress raw PX data given its 9 control flags. */
export function pxDecompress(src: Uint8Array, flags: Uint8Array, expectedLength: number): Uint8Array {
  const out = new Uint8Array(expectedLength);
  let o = 0;
  let c = 0;
  while (c < src.length) {
    const ctrl = src[c++]!;
    for (let bit = 0x80; bit > 0; bit >>= 1) {
      if (c >= src.length) break;
      if (ctrl & bit) {
        out[o++] = src[c++]!;
        continue;
      }
      const next = src[c++]!;
      const high = next >> 4;
      const low = next & 0xf;
      const flagIdx = flags.indexOf(high);
      if (flagIdx !== -1) {
        const [b1, b2] = nibblePattern(flagIdx, low);
        out[o++] = b1;
        out[o++] = b2;
      } else {
        const offset = (-0x1000 + (low << 8)) | src[c++]!;
        const from = o + offset;
        if (from < 0) throw new RomFormatError("PX: copy reaches before start of output.");
        const n = high + MIN_MATCH;
        for (let i = 0; i < n; i++) out[o + i] = out[from + i]!; // byte-by-byte: ranges may overlap
        o += n;
      }
      if (o > expectedLength) throw new RomFormatError("PX: output longer than declared.");
    }
  }
  if (o !== expectedLength) throw new RomFormatError(`PX: expected ${expectedLength} bytes, got ${o}.`);
  return out;
}

export type AtKind = "AT4PX" | "PKDPX" | "AT4PN";

export function atKind(data: Uint8Array, offset = 0): AtKind | null {
  const magic = new Bytes(data).ascii(offset, 5);
  return magic === "AT4PX" || magic === "PKDPX" || magic === "AT4PN" ? magic : null;
}

/** Size in bytes of the AT container starting at `offset`. */
export function atContainerSize(data: Uint8Array, offset = 0): number {
  if (!atKind(data, offset)) throw new RomFormatError("Not an AT container.");
  return new Bytes(data).u16(offset + 5);
}

/** Decompress an AT container starting at `offset`. */
export function atDecompress(data: Uint8Array, offset = 0): Uint8Array {
  const kind = atKind(data, offset);
  const b = new Bytes(data);
  const size = b.u16(offset + 5);
  switch (kind) {
    case "AT4PX": {
      const flags = data.subarray(offset + 7, offset + 16);
      const outLen = b.u16(offset + 0x10);
      return pxDecompress(data.subarray(offset + 0x12, offset + size), flags, outLen);
    }
    case "PKDPX": {
      const flags = data.subarray(offset + 7, offset + 16);
      const outLen = b.u32(offset + 0x10);
      return pxDecompress(data.subarray(offset + 0x14, offset + size), flags, outLen);
    }
    case "AT4PN":
      return data.slice(offset + 7, offset + 7 + size);
    default:
      throw new RomFormatError("Unknown or unsupported compression container.");
  }
}
