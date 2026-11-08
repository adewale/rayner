// WOFF2 to SFNT at build time, so a page never ships the shaper's Brotli decoder. Lettering
// faces are cut as WOFF2 (small to commit); the build decodes each with Node's Brotli and
// rebuilds the tables WOFF2 transforms (glyf and loca, and hmtx when it is transformed), then
// writes an ordinary TrueType or CFF file, which the page's SFNT-only shaper reads. The glyphs,
// advances and layout tables are the font's own; test/woff2.test.ts shapes both forms alike.
import { brotliDecompressSync } from 'node:zlib';

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];
const fail = (why: string): never => {
  throw new Error(`woff2ToSfnt(): the face is not a WOFF2 font it can convert: ${why}; cut it again with rayner snapshots`);
};

/** A big-endian reader over bytes that refuses to read past their end. */
function reader(bytes: Uint8Array, name: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const take = (n: number) => {
    if (pos + n > bytes.length) fail(`its ${name} ends early`);
    pos += n;
    return pos - n;
  };
  return {
    get pos() { return pos; },
    u8: () => view.getUint8(take(1)),
    u16: () => view.getUint16(take(2)),
    i16: () => view.getInt16(take(2)),
    u32: () => view.getUint32(take(4)),
    bytes: (n: number) => bytes.subarray(take(n), pos),
    /** UIntBase128: at most five bytes, no leading zero. */
    base128: () => {
      let value = 0;
      for (let i = 0; i < 5; i++) {
        const code = view.getUint8(take(1));
        if (i === 0 && code === 0x80) fail('a length has a leading zero');
        if (value & 0xfe000000) fail('a length overflows');
        value = ((value << 7) | (code & 0x7f)) >>> 0;
        if (!(code & 0x80)) return value;
      }
      return fail('a length is longer than five bytes');
    },
    /** 255UInt16. */
    u255: () => {
      const code = view.getUint8(take(1));
      if (code === 253) return view.getUint16(take(2));
      if (code === 255) return view.getUint8(take(1)) + 253;
      if (code === 254) return view.getUint8(take(1)) + 506;
      return code;
    },
  };
}

/** A growing big-endian byte buffer. */
function writer() {
  let bytes = new Uint8Array(1024), length = 0;
  const room = (n: number) => {
    if (length + n <= bytes.length) return;
    const larger = new Uint8Array(Math.max(2 * bytes.length, length + n));
    larger.set(bytes.subarray(0, length));
    bytes = larger;
  };
  const view = () => new DataView(bytes.buffer);
  return {
    get length() { return length; },
    u8(v: number) { room(1); bytes[length++] = v; },
    u16(v: number) { room(2); view().setUint16(length, v); length += 2; },
    i16(v: number) { room(2); view().setInt16(length, v); length += 2; },
    u32(v: number) { room(4); view().setUint32(length, v >>> 0); length += 4; },
    bytes(b: Uint8Array) { room(b.length); bytes.set(b, length); length += b.length; },
    pad(to: number) { while (length % to) this.u8(0); },
    done: () => bytes.slice(0, length),
  };
}

/** The x and y deltas of WOFF2's triplet encoding, and whether each point is on the curve. */
function triplets(flags: Uint8Array, glyph: ReturnType<typeof reader>) {
  const n = flags.length, xs = new Int32Array(n), ys = new Int32Array(n), on = new Uint8Array(n);
  const sign = (f: number, base: number) => (f & 1 ? base : -base);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const f = flags[i]! & 0x7f;
    on[i] = flags[i]! >> 7 ? 0 : 1;
    let dx: number, dy: number;
    if (f < 10) { dx = 0; dy = sign(f, ((f & 14) << 7) + glyph.u8()); }
    else if (f < 20) { dx = sign(f, (((f - 10) & 14) << 7) + glyph.u8()); dy = 0; }
    else if (f < 84) {
      const b0 = f - 20, b1 = glyph.u8();
      dx = sign(f, 1 + (b0 & 0x30) + (b1 >> 4));
      dy = sign(f >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
    } else if (f < 120) {
      const b0 = f - 84, b1 = glyph.u8(), b2 = glyph.u8();
      dx = sign(f, 1 + (Math.floor(b0 / 12) << 8) + b1);
      dy = sign(f >> 1, 1 + (((b0 % 12) >> 2) << 8) + b2);
    } else if (f < 124) {
      const b1 = glyph.u8(), b2 = glyph.u8(), b3 = glyph.u8();
      dx = sign(f, (b1 << 4) + (b2 >> 4));
      dy = sign(f >> 1, ((b2 & 0x0f) << 8) + b3);
    } else {
      const b1 = glyph.u8(), b2 = glyph.u8(), b3 = glyph.u8(), b4 = glyph.u8();
      dx = sign(f, (b1 << 8) + b2);
      dy = sign(f >> 1, (b3 << 8) + b4);
    }
    xs[i] = x += dx;
    ys[i] = y += dy;
  }
  return { xs, ys, on };
}

/** The glyf and loca tables a transformed glyf table stands for, and each glyph's xMin (for hmtx). */
function rebuildGlyf(data: Uint8Array) {
  const head = reader(data, 'glyf header');
  head.u16();
  const optionFlags = head.u16(), numGlyphs = head.u16(), indexFormat = head.u16();
  const sizes = Array.from({ length: 7 }, () => head.u32());
  let at = head.pos;
  const streams = sizes.map((size, i) => {
    if (at + size > data.length) fail('its glyf streams overrun the table');
    const part = data.subarray(at, at + size);
    at += size;
    return reader(part, ['nContour', 'nPoints', 'flag', 'glyph', 'composite', 'bbox', 'instruction'][i]! + ' stream');
  });
  const [nContour, nPoints, flagStream, glyphStream, composite, bbox, instruction] = streams as [ReturnType<typeof reader>, ...ReturnType<typeof reader>[]];
  const overlap = optionFlags & 1 ? data.subarray(at, at + ((numGlyphs + 7) >> 3)) : undefined;
  const bitmap = bbox!.bytes(((numGlyphs + 31) >> 5) << 2);
  const glyf = writer(), offsets: number[] = [], xMin = new Int16Array(numGlyphs);
  for (let g = 0; g < numGlyphs; g++) {
    offsets.push(glyf.length);
    const contours = nContour.i16(), hasBbox = (bitmap[g >> 3]! & (0x80 >> (g & 7))) !== 0;
    if (contours === 0) {
      if (hasBbox) fail(`glyph ${g} is empty but has a box`);
      continue;
    }
    if (contours === -1) {
      if (!hasBbox) fail(`composite glyph ${g} has no box`);
      const box = [bbox!.i16(), bbox!.i16(), bbox!.i16(), bbox!.i16()] as const;
      xMin[g] = box[0];
      glyf.i16(-1);
      for (const v of box) glyf.i16(v);
      // Components as glyf stores them: flags, glyph, arguments and scale, until one says it is the last.
      let flags: number, instructions = false;
      do {
        flags = composite!.u16();
        glyf.u16(flags);
        glyf.u16(composite!.u16());
        instructions ||= (flags & 0x0100) !== 0;
        const size = (flags & 0x0001 ? 4 : 2) + (flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0);
        glyf.bytes(composite!.bytes(size));
      } while (flags & 0x0020);
      if (instructions) {
        const n = glyphStream!.u255();
        glyf.u16(n);
        glyf.bytes(instruction!.bytes(n));
      }
    } else if (contours > 0) {
      const ends: number[] = [];
      let total = 0;
      for (let c = 0; c < contours; c++) ends.push((total += nPoints!.u255()) - 1);
      const { xs, ys, on } = triplets(flagStream!.bytes(total), glyphStream!);
      const n = glyphStream!.u255(), code = instruction!.bytes(n);
      let box: readonly number[];
      if (hasBbox) box = [bbox!.i16(), bbox!.i16(), bbox!.i16(), bbox!.i16()];
      else {
        let x0 = xs[0]!, y0 = ys[0]!, x1 = x0, y1 = y0;
        for (let i = 1; i < total; i++) { x0 = Math.min(x0, xs[i]!); x1 = Math.max(x1, xs[i]!); y0 = Math.min(y0, ys[i]!); y1 = Math.max(y1, ys[i]!); }
        box = [x0, y0, x1, y1];
      }
      xMin[g] = box[0]!;
      glyf.i16(contours);
      for (const v of box) glyf.i16(v);
      for (const end of ends) glyf.u16(end);
      glyf.u16(n);
      glyf.bytes(code);
      // Flags and coordinates, each delta short (one byte and a sign bit) when it fits, nothing when zero.
      const dxs: number[] = [], dys: number[] = [];
      for (let i = 0; i < total; i++) {
        dxs.push(xs[i]! - (i ? xs[i - 1]! : 0));
        dys.push(ys[i]! - (i ? ys[i - 1]! : 0));
      }
      const overlapping = !!overlap && (overlap[g >> 3]! & (0x80 >> (g & 7))) !== 0;
      for (let i = 0; i < total; i++) {
        const dx = dxs[i]!, dy = dys[i]!;
        let f = on[i] ? 0x01 : 0;
        f |= dx === 0 ? 0x10 : Math.abs(dx) < 256 ? 0x02 | (dx > 0 ? 0x10 : 0) : 0;
        f |= dy === 0 ? 0x20 : Math.abs(dy) < 256 ? 0x04 | (dy > 0 ? 0x20 : 0) : 0;
        if (i === 0 && overlapping) f |= 0x40;
        glyf.u8(f);
      }
      for (const dx of dxs) if (dx !== 0) Math.abs(dx) < 256 ? glyf.u8(Math.abs(dx)) : glyf.i16(dx);
      for (const dy of dys) if (dy !== 0) Math.abs(dy) < 256 ? glyf.u8(Math.abs(dy)) : glyf.i16(dy);
    } else fail(`glyph ${g} has ${contours} contours`);
    glyf.pad(4);
  }
  offsets.push(glyf.length);
  const loca = writer();
  for (const o of offsets) indexFormat ? loca.u32(o) : loca.u16(o / 2);
  return { glyf: glyf.done(), loca: loca.done(), xMin, numGlyphs };
}

/** The hmtx table a transformed one stands for: absent side bearings are their glyphs' xMin. */
function rebuildHmtx(data: Uint8Array, numGlyphs: number, metrics: number, xMin: Int16Array): Uint8Array {
  const r = reader(data, 'hmtx table'), flags = r.u8();
  const proportional = !(flags & 1), monospaced = !(flags & 2);
  const advances = Array.from({ length: metrics }, () => r.u16());
  const out = writer();
  const lsbs = Array.from({ length: metrics }, (_, g) => (proportional ? r.i16() : xMin[g]!));
  for (let g = 0; g < metrics; g++) { out.u16(advances[g]!); out.i16(lsbs[g]!); }
  for (let g = metrics; g < numGlyphs; g++) out.i16(monospaced ? r.i16() : xMin[g]!);
  return out.done();
}

/** The sum of a table's big-endian 32-bit words, its last word padded with zeros. */
function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4)
    sum = (sum + (((bytes[i]! << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0)) >>> 0;
  return sum;
}

/** An SFNT (TrueType or CFF) file with the same tables as a WOFF2 one. */
export function woff2ToSfnt(woff2: Uint8Array): Uint8Array {
  const r = reader(woff2, 'header');
  if (r.u32() !== 0x774f4632) fail('it does not start with wOF2');
  const flavor = r.u32();
  if (flavor === 0x74746366) fail('it is a collection');
  r.u32();
  const numTables = r.u16();
  r.u16(); r.u32();
  const compressedSize = r.u32();
  r.bytes(24);
  const directory = Array.from({ length: numTables }, () => {
    const flags = r.u8(), index = flags & 0x3f, version = flags >> 6;
    const tag = index === 63 ? String.fromCharCode(...r.bytes(4)) : KNOWN_TAGS[index]!;
    const length = r.base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    if (transformed && !(tag === 'glyf' || tag === 'loca' || (tag === 'hmtx' && version === 1))) fail(`its ${tag} table has transform ${version}`);
    return { tag, length, transformed, stored: transformed ? r.base128() : length };
  });
  const stream = brotliDecompressSync(r.bytes(compressedSize));
  const tables = new Map<string, Uint8Array>();
  let at = 0;
  for (const t of directory) {
    if (at + t.stored > stream.length) fail('its tables overrun the compressed stream');
    tables.set(t.tag, stream.subarray(at, (at += t.stored)));
  }
  const transformed = new Set(directory.filter((t) => t.transformed).map((t) => t.tag));
  if (transformed.has('glyf')) {
    const rebuilt = rebuildGlyf(tables.get('glyf')!);
    tables.set('glyf', rebuilt.glyf);
    tables.set('loca', rebuilt.loca);
    if (transformed.has('hmtx')) {
      const hhea = tables.get('hhea') ?? fail('it has no hhea table');
      tables.set('hmtx', rebuildHmtx(tables.get('hmtx')!, rebuilt.numGlyphs, (hhea[34]! << 8) | hhea[35]!, rebuilt.xMin));
    }
  } else if (transformed.has('hmtx') || transformed.has('loca')) fail('it transforms hmtx or loca without glyf');
  // The SFNT: offset table, records sorted by tag, then each table padded to four bytes.
  const tags = [...tables.keys()].sort();
  const out = writer();
  const select = Math.floor(Math.log2(tags.length)), range = 16 << select;
  out.u32(flavor);
  out.u16(tags.length);
  out.u16(range);
  out.u16(select);
  out.u16(tags.length * 16 - range);
  let offset = 12 + 16 * tags.length;
  const head = tags.indexOf('head');
  if (head < 0) fail('it has no head table');
  const headBytes = tables.get('head')!.slice();
  headBytes.fill(0, 8, 12);
  tables.set('head', headBytes);
  for (const tag of tags) {
    const data = tables.get(tag)!;
    for (let i = 0; i < 4; i++) out.u8(tag.charCodeAt(i));
    out.u32(checksum(data));
    out.u32(offset);
    out.u32(data.length);
    offset += (data.length + 3) & ~3;
  }
  for (const tag of tags) {
    out.bytes(tables.get(tag)!);
    out.pad(4);
  }
  const font = out.done();
  // head.checkSumAdjustment makes the whole file sum to 0xB1B0AFBA.
  const headOffset = new DataView(font.buffer).getUint32(12 + 16 * head + 8);
  new DataView(font.buffer).setUint32(headOffset + 8, (0xb1b0afba - checksum(font)) >>> 0);
  return font;
}

/** Base64 WOFF2 as base64 SFNT; any other font (already SFNT) is returned as it is. */
export function sfntBase64(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  return bytes.readUInt32BE(0) === 0x774f4632 ? Buffer.from(woff2ToSfnt(bytes)).toString('base64') : base64;
}
