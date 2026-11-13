import { Kao, NdsRom, RomFormatError, SUPPORTED_GAME_CODES, pokemonNames, readStringTable, type RomDir } from "@sky/rom";

export interface PortraitEntry {
  entry: number;
  monsterId: number;
  name: string;
  slots: number[];
}

export type LoadResult =
  | { ok: true; title: string; gameCode: string; gameName: string; revision: number; sha1: string; fileCount: number; tree: RomDir; portraits: PortraitEntry[] }
  | { ok: false; error: string };

let rom: NdsRom | null = null;
let kao: Kao | null = null;

async function sha1(data: Uint8Array<ArrayBuffer>): Promise<string> {
  // crypto.subtle is missing in some contexts (e.g. insecure origins); the hash is only a cache key.
  if (!globalThis.crypto?.subtle) return "unavailable";
  const h = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const romApi = {
  async load(buffer: ArrayBuffer): Promise<LoadResult> {
    try {
      const data = new Uint8Array(buffer);
      const r = new NdsRom(data);
      if (!r.isSupported) {
        return {
          ok: false,
          error: `This ROM is "${r.header.title}" (${r.header.gameCode}). Sky Maker needs Pokémon Mystery Dungeon: Explorers of Sky, US version (C2SE).`,
        };
      }
      rom = r;
      kao = new Kao(r.readFile("FONT/kaomado.kao"));
      const names = pokemonNames(readStringTable(r.readFile("MESSAGE/text_e.str")), r.header.gameCode);
      const portraits: PortraitEntry[] = [];
      for (let e = 0; e < kao.entryCount; e++) {
        const slots = kao.slots(e);
        if (!slots.length) continue;
        const monsterId = e + 1;
        portraits.push({ entry: e, monsterId, name: names[monsterId] ?? `#${monsterId}`, slots });
      }
      return {
        ok: true,
        title: r.header.title,
        gameCode: r.header.gameCode,
        gameName: SUPPORTED_GAME_CODES[r.header.gameCode]!,
        revision: r.header.revision,
        sha1: await sha1(data),
        fileCount: r.fileCount,
        tree: r.root,
        portraits,
      };
    } catch (e) {
      console.error("[sky-maker] ROM load failed", e);
      const msg = e instanceof RomFormatError ? e.message : `This file couldn't be read as a DS ROM (${e instanceof Error ? e.message : String(e)}).`;
      return { ok: false, error: msg };
    }
  },

  async ping(): Promise<"pong"> {
    return "pong";
  },

  async portrait(entry: number, slot: number): Promise<Uint8ClampedArray<ArrayBuffer> | null> {
    const px = kao?.rgba(entry, slot) ?? null;
    return px;
  },
};

export type RomApi = {
  ping(): Promise<"pong">;
  load(buffer: ArrayBuffer): Promise<LoadResult>;
  portrait(entry: number, slot: number): Promise<Uint8ClampedArray<ArrayBuffer> | null>;
};
