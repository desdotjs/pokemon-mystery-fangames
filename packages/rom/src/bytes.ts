/** Little-endian read helpers over a Uint8Array. Keep raw offsets inside packages/rom. */
export class Bytes {
  readonly view: DataView;
  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  get length(): number {
    return this.data.length;
  }
  u8(o: number): number {
    return this.view.getUint8(o);
  }
  u16(o: number): number {
    return this.view.getUint16(o, true);
  }
  u32(o: number): number {
    return this.view.getUint32(o, true);
  }
  i32(o: number): number {
    return this.view.getInt32(o, true);
  }
  ascii(o: number, len: number): string {
    let s = "";
    for (let i = 0; i < len; i++) {
      const c = this.data[o + i]!;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  slice(start: number, end: number): Uint8Array {
    return this.data.subarray(start, end);
  }
}

export class RomFormatError extends Error {}
