// All fixtures here are tiny hand-built binaries. Never put real ROM bytes in tests.
import { describe, expect, it } from "vitest";
import { NdsRom, pxDecompress, atDecompress, Kao, readStringTable, slotName, readSir0Font, wrapText, measureText, charToByte } from "../src";

function u16(n: number) { return [n & 0xff, (n >> 8) & 0xff]; }
function u32(n: number) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]; }

/** Build a minimal NDS image: root dir with "A/hello.txt" and "b.bin". */
function fakeRom(gameCode = "C2SE"): Uint8Array {
  const rom = new Uint8Array(0x400);
  const enc = new TextEncoder();
  rom.set(enc.encode("TEST TITLE"), 0);
  rom.set(enc.encode(gameCode), 0x0c);
  rom.set(enc.encode("01"), 0x10);
  const fnt = 0x200;
  // FNT main table: root (dir 0xF000) and dir 0xF001 ("A")
  // root: sub-table @ +16, first file id 0, total dirs 2
  // A:    sub-table @ +32, first file id 1, parent 0xF000
  const main = [...u32(16), ...u16(0), ...u16(2), ...u32(32), ...u16(1), ...u16(0xf000)];
  const rootSub = [0x01, ..."b".split("").map((c) => c.charCodeAt(0)), 0x81, "A".charCodeAt(0), ...u16(0xf001), 0];
  const aSub = [0x09, ...enc.encode("hello.txt"), 0];
  rom.set(main, fnt);
  rom.set(rootSub, fnt + 16);
  rom.set(aSub, fnt + 32);
  const fat = 0x280;
  rom.set([...u32(0x300), ...u32(0x304), ...u32(0x310), ...u32(0x315)], fat);
  rom.set([1, 2, 3, 4], 0x300);
  rom.set(enc.encode("hello"), 0x310);
  rom.set([...u32(fnt), ...u32(64), ...u32(fat), ...u32(16)], 0x40);
  return rom;
}

describe("NdsRom", () => {
  it("reads header and file tree", () => {
    const rom = new NdsRom(fakeRom());
    expect(rom.header.gameCode).toBe("C2SE");
    expect(rom.isSupported).toBe(true);
    expect(rom.fileCount).toBe(2);
    expect(rom.root.files.map((f) => f.path)).toEqual(["b"]);
    expect(rom.root.dirs[0]!.files[0]).toEqual({ path: "A/hello.txt", size: 5 });
    expect(new TextDecoder().decode(rom.readFile("A/hello.txt"))).toBe("hello");
  });
  it("flags unsupported game codes", () => {
    expect(new NdsRom(fakeRom("ABCE")).isSupported).toBe(false);
  });
  it("rejects non-ROM files", () => {
    expect(() => new NdsRom(new Uint8Array(10))).toThrow();
  });
});

describe("PX", () => {
  const flags = new Uint8Array([0xf, 0xe, 0xd, 0xc, 0xb, 0xa, 0x9, 0x8, 0x7]);
  it("handles literals, nibble patterns and back-references", () => {
    // ctrl 0b11100000: 3 literals, then pattern (flag 0 = 0xF, low=3 -> 33 33), then copy
    // copy: high=0 -> len 3; offset = -0x1000 + (0xF<<8) | 0xFB = -5
    const src = new Uint8Array([0b11100000, 0x41, 0x42, 0x43, 0xf3, 0x0f, 0xfb]);
    const out = pxDecompress(src, flags, 8);
    expect([...out]).toEqual([0x41, 0x42, 0x43, 0x33, 0x33, 0x41, 0x42, 0x43]);
  });
  it("supports overlapping copies", () => {
    // literal 'A', then copy len 3 from offset -1 => AAAA
    const src = new Uint8Array([0b10000000, 0x41, 0x0f, 0xff]);
    expect([...pxDecompress(src, flags, 4)]).toEqual([0x41, 0x41, 0x41, 0x41]);
  });
  it("unwraps AT4PX containers", () => {
    const body = [0b11000000, 0x10, 0x20];
    const size = 0x12 + body.length;
    const c = new Uint8Array([..."AT4PX"].map((x) => x.charCodeAt(0)).concat(u16(size), [...flags], u16(2), body));
    expect([...atDecompress(c)]).toEqual([0x10, 0x20]);
  });
});

describe("Kao", () => {
  it("decodes a portrait with tile layout and palette", () => {
    // One padding entry + one real entry, slot 0 filled with an AT4PN image (uncompressed).
    const toc = 40 * 4;
    const imgPtr = toc + 40 * 4;
    const header = new Uint8Array(imgPtr);
    header.fill(0xff); // padding + empty slots = negative pointers
    header.set(u32(imgPtr), toc); // entry 0, slot 0
    const pal = new Uint8Array(48);
    pal.set([10, 20, 30], 3); // colour 1
    const pixels = new Uint8Array(800);
    pixels[0] = 0x01; // pixel (0,0) = colour 1 (low nibble first), pixel (1,0) = colour 0
    pixels[32] = 0x10; // second tile, pixel index 1 -> (9,0) = colour 1
    const at = new Uint8Array([..."AT4PN"].map((x) => x.charCodeAt(0)).concat(u16(800), [...pixels]));
    const kao = new Kao(new Uint8Array([...header, ...pal, ...at]));
    expect(kao.entryCount).toBe(1);
    expect(kao.slots(0)).toEqual([0]);
    const rgba = kao.rgba(0, 0)!;
    const at_ = (x: number, y: number) => [...rgba.subarray((y * 40 + x) * 4, (y * 40 + x) * 4 + 3)];
    expect(at_(0, 0)).toEqual([10, 20, 30]);
    expect(at_(1, 0)).toEqual([0, 0, 0]);
    expect(at_(9, 0)).toEqual([10, 20, 30]);
    expect(kao.rgba(0, 1)).toBeNull();
  });
  it("names slots", () => {
    expect(slotName(0)).toBe("Normal");
    expect(slotName(3)).toBe("Happy (flipped)");
  });
});

describe("strings", () => {
  it("reads a pointer table", () => {
    const enc = new TextEncoder();
    const data = new Uint8Array([...u32(12), ...u32(15), ...u32(18), ...enc.encode("ab"), 0, ...enc.encode("cd"), 0]);
    expect(readStringTable(data)).toEqual(["ab", "cd"]);
  });
  it("maps the game's gender symbols", () => {
    const data = new Uint8Array([...u32(8), ...u32(11), 0x41, 0xbd, 0, 0x42, 0xbe, 0]);
    expect(readStringTable(data)).toEqual(["A♂", "B♀"]);
  });
});

describe("SIR0 font", () => {
  // Header(16) + glyph 'A' (72) + glyph ' ' (72) + content header + 2 entries.
  function fakeFont(): Uint8Array {
    const glyphA = new Uint8Array(72);
    glyphA[0] = 0xf0; // pixel (1,0) = 15
    glyphA[1] = 0x0f; // pixel (2,0) = 15
    const glyphSpace = new Uint8Array(72);
    const gA = 16, gS = gA + 72, entries = gS + 72, header = entries + 24;
    const e = (ptr: number, ch: number, w: number) => [...u32(ptr), ch, 0, ...u32(w), 2, 0xff];
    const body = [...glyphA, ...glyphSpace, ...e(gA, 0x41, 4), ...e(gS, 0x20, 3), ...u32(2), ...u32(entries)];
    return new Uint8Array([..."SIR0"].map((c) => c.charCodeAt(0)).concat(u32(header), u32(0), u32(0), body));
  }
  it("reads glyph pixels and widths", () => {
    const f = readSir0Font(fakeFont());
    expect(f.advance[0x41]).toBe(4);
    expect(f.advance[0x20]).toBe(3);
    const A = f.pixels.subarray(0x41 * 144, 0x41 * 144 + 4);
    expect([...A]).toEqual([0, 15, 15, 0]);
    expect(f.maxValue).toBe(15);
  });
  it("measures and wraps by pixel width", () => {
    const f = readSir0Font(fakeFont());
    expect(measureText(f, "A A")).toBe(11);
    expect(wrapText(f, "A A A", 11)).toEqual(["A A", "A"]);
    expect(wrapText(f, "AAAA", 8)).toEqual(["AA", "AA"]);
  });
  it("maps the game's gender symbols", () => {
    expect(charToByte("♂")).toBe(0xbd);
    expect(charToByte("é")).toBe(0xe9);
    expect(charToByte("漢")).toBeNull();
    expect(charToByte("♪")).toBe(256);
  });
});
