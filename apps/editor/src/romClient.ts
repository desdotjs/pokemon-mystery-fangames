import * as Comlink from "comlink";
import { get, set, del } from "idb-keyval";
import RomWorker from "./rom.worker.ts?worker&inline";
import type { RomApi } from "./rom.worker";

// The ROM stays on this computer: it's parsed in a Web Worker and kept in this browser's IndexedDB.
export const rom = Comlink.wrap<RomApi>(new RomWorker());

const KEY = "sky-maker/rom";

export async function saveRom(buf: ArrayBuffer): Promise<void> {
  try {
    // Stored as a Blob: Chrome caps a single IndexedDB value at ~127 MB, and the ROM is 128 MB.
    await set(KEY, new Blob([buf]));
  } catch {
    /* storage may be unavailable (private window) — the app still works for this session */
  }
}

export async function loadSavedRom(): Promise<ArrayBuffer | null> {
  try {
    const blob = await get<Blob>(KEY);
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function forgetRom(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    /* ignore */
  }
}

const cache = new Map<string, Promise<ImageData | null>>();
export function portraitImage(entry: number, slot: number): Promise<ImageData | null> {
  const k = `${entry}:${slot}`;
  let p = cache.get(k);
  if (!p) {
    p = rom.portrait(entry, slot).then((px) => (px ? new ImageData(px, 40, 40) : null));
    cache.set(k, p);
  }
  return p;
}
