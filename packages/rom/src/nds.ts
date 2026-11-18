import { Bytes, RomFormatError } from "./bytes";

/**
 * NDS cartridge header + NitroFS (FNT/FAT) reader.
 * Format reference: GBATEK "DS Cartridge Header" and "DS Cartridge NitroROM and NitroARC File Systems".
 */

export interface RomHeader {
  title: string;
  gameCode: string;
  makerCode: string;
  revision: number;
}

export interface RomFile {
  path: string;
  size: number;
}

export interface RomDir {
  name: string;
  path: string;
  dirs: RomDir[];
  files: RomFile[];
}

export const SUPPORTED_GAME_CODES: Record<string, string> = {
  C2SE: "Explorers of Sky (US)",
};

export class NdsRom {
  readonly header: RomHeader;
  readonly root: RomDir;
  private readonly fileIndex = new Map<string, { start: number; end: number }>();
  private readonly b: Bytes;

  constructor(data: Uint8Array) {
    if (data.length < 0x200) throw new RomFormatError("File is too small to be a DS ROM.");
    this.b = new Bytes(data);
    this.header = {
      title: this.b.ascii(0x00, 12),
      gameCode: this.b.ascii(0x0c, 4),
      makerCode: this.b.ascii(0x10, 2),
      revision: this.b.u8(0x1e),
    };
    const fntOff = this.b.u32(0x40);
    const fatOff = this.b.u32(0x48);
    const fatSize = this.b.u32(0x4c);
    if (fntOff === 0 || fntOff >= data.length || fatOff + fatSize > data.length) {
      throw new RomFormatError("This doesn't look like a DS ROM (file tables are missing).");
    }
    this.root = this.walk(fntOff, fatOff, 0xf000, "", "");
  }

  get isSupported(): boolean {
    return this.header.gameCode in SUPPORTED_GAME_CODES;
  }

  private walk(fntOff: number, fatOff: number, dirId: number, name: string, path: string): RomDir {
    const b = this.b;
    const entry = fntOff + (dirId & 0xfff) * 8;
    let cursor = fntOff + b.u32(entry);
    let fileId = b.u16(entry + 4);
    const dir: RomDir = { name, path, dirs: [], files: [] };
    for (;;) {
      const len = b.u8(cursor++);
      if (len === 0) break;
      const n = len & 0x7f;
      const entryName = b.ascii(cursor, n);
      cursor += n;
      if (len & 0x80) {
        const subId = b.u16(cursor);
        cursor += 2;
        dir.dirs.push(this.walk(fntOff, fatOff, subId, entryName, path + entryName + "/"));
      } else {
        const start = b.u32(fatOff + fileId * 8);
        const end = b.u32(fatOff + fileId * 8 + 4);
        const p = path + entryName;
        this.fileIndex.set(p, { start, end });
        dir.files.push({ path: p, size: end - start });
        fileId++;
      }
    }
    return dir;
  }

  has(path: string): boolean {
    return this.fileIndex.has(path);
  }

  /** Returns a view (no copy) of a file's bytes. */
  readFile(path: string): Uint8Array {
    const f = this.fileIndex.get(path);
    if (!f) throw new RomFormatError(`File not found in ROM: ${path}`);
    return this.b.slice(f.start, f.end);
  }

  get fileCount(): number {
    return this.fileIndex.size;
  }
}
