import { Bytes } from "./bytes";

/**
 * MESSAGE/text_*.str: a list of u32 offsets followed by null-terminated strings.
 * Format reference: skytemple-files `data/str`.
 */
export function readStringTable(data: Uint8Array): string[] {
  const b = new Bytes(data);
  const pointers: number[] = [];
  for (let c = 0; c + 4 <= data.length; c += 4) {
    const p = b.u32(c);
    if (p >= data.length) break;
    pointers.push(p);
  }
  const dec = new TextDecoder("windows-1252");
  return pointers.map((p) => {
    let e = p;
    while (e < data.length && data[e] !== 0) e++;
    // The game's text encoding is Windows-1252 except 0xBD = ♂ and 0xBE = ♀.
    return dec.decode(data.subarray(p, e)).replace(/\u00bd/g, "♂").replace(/\u00be/g, "♀");
  });
}

/**
 * Where named string blocks begin, per game code. These are index positions
 * (format knowledge from SkyTemple's pmd2data.xml), not game text.
 */
export const STRING_BLOCKS: Record<string, { pokemonNames: [number, number] }> = {
  C2SE: { pokemonNames: [8734, 9334] },
};

/** Monster names indexed by monster ID (0 = placeholder). */
export function pokemonNames(strings: string[], gameCode: string): string[] {
  const block = STRING_BLOCKS[gameCode];
  if (!block) return [];
  return strings.slice(block.pokemonNames[0], block.pokemonNames[1]);
}
