import * as Comlink from "comlink";
import { get, set, del } from "idb-keyval";
import RomWorker from "./rom.worker.ts?worker&inline";
import { romApi, type RomApi } from "./romApi";

// The ROM stays on this computer: it's parsed in this browser (in a Web Worker when possible)
// and remembered in this browser's IndexedDB. Every step has a timeout so the UI can never hang.

export class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`${what} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export let usingWorker = false;

async function startWorker(): Promise<RomApi> {
  const w = new RomWorker();
  const failed = new Promise<never>((_, reject) => {
    w.addEventListener("error", (e) => reject(new Error(e.message || "worker failed to start")));
  });
  const api = Comlink.wrap<RomApi>(w);
  try {
    await Promise.race([withTimeout(api.ping(), 4000, "Worker start"), failed]);
    return api;
  } catch (e) {
    w.terminate();
    throw e;
  }
}

let apiPromise: Promise<RomApi> | null = null;
/** Worker if the browser allows it, otherwise the same code on the main thread. */
export function getRomApi(): Promise<RomApi> {
  apiPromise ??= startWorker().then(
    (api) => {
      usingWorker = true;
      return api;
    },
    (e) => {
      console.warn("[sky-maker] Background worker unavailable, reading on the main thread instead:", e);
      return romApi;
    },
  );
  return apiPromise;
}

const KEY = "sky-maker/rom";

/** Remember the ROM. Never blocks loading: failures just mean you drop it again next time. */
export function saveRom(blob: Blob): void {
  // Stored as a Blob: Chrome caps a single IndexedDB value at ~127 MB, and the ROM is 128 MB.
  // Some contexts throw synchronously (storage denied), so guard both ways.
  try {
    withTimeout(set(KEY, blob), 30_000, "Saving ROM").catch((e) => console.warn("[sky-maker] Couldn't remember ROM:", e));
  } catch (e) {
    console.warn("[sky-maker] Couldn't remember ROM:", e);
  }
}

export async function loadSavedRom(): Promise<Blob | null> {
  try {
    return (await withTimeout(get<Blob>(KEY), 5000, "Reading saved ROM")) ?? null;
  } catch (e) {
    console.warn("[sky-maker] Couldn't read saved ROM:", e);
    return null;
  }
}

export async function forgetRom(): Promise<void> {
  try {
    // (del may throw synchronously where storage is denied; caught below)
    await withTimeout(del(KEY), 5000, "Forgetting ROM");
  } catch {
    /* ignore */
  }
}

export async function loadRom(blob: Blob) {
  const api = await getRomApi();
  const buf = await withTimeout(blob.arrayBuffer(), 30_000, "Reading the file");
  const payload = usingWorker ? Comlink.transfer(buf, [buf]) : buf;
  return withTimeout(api.load(payload), 60_000, "Reading the ROM");
}

const cache = new Map<string, Promise<ImageData | null>>();
export function portraitImage(entry: number, slot: number): Promise<ImageData | null> {
  const k = `${entry}:${slot}`;
  let p = cache.get(k);
  if (!p) {
    p = getRomApi()
      .then((api) => api.portrait(entry, slot))
      .then((px) => (px ? new ImageData(px, 40, 40) : null));
    cache.set(k, p);
  }
  return p;
}
