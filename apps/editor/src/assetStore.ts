import { create } from "zustand";
import type { GameFonts, PortraitEntry } from "./romApi";

/** ROM-derived lookups the editors need (filled once the ROM loads). */
interface AssetState {
  portraits: PortraitEntry[];
  byMonster: Map<number, PortraitEntry>;
  fonts: GameFonts | null;
  setPortraits(list: PortraitEntry[]): void;
  setFonts(f: GameFonts): void;
}

export const useAssets = create<AssetState>((set) => ({
  portraits: [],
  byMonster: new Map(),
  fonts: null,
  setFonts(fonts) {
    set({ fonts });
  },
  setPortraits(list) {
    set({ portraits: list, byMonster: new Map(list.map((p) => [p.monsterId, p])) });
  },
}));

/** Best slot for a monster + face index: that face if it exists, otherwise Normal. */
export function portraitSlot(entry: PortraitEntry | undefined, face: number): number | null {
  if (!entry) return null;
  if (entry.slots.includes(face * 2)) return face * 2;
  return entry.slots.find((s) => !(s & 1)) ?? entry.slots[0] ?? null;
}
