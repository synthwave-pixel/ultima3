/**
 * png.ts
 *
 * Just enough PNG for the art tools: RGBA 8-bit, written and read with
 * node's zlib (no dependency). Reads 8-bit RGBA, RGB and paletted PNGs
 * (at 1, 2, 4 or 8 bits), not interlaced ones.
 */

import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface Image {
  width: number;
  height: number;
  /** RGBA, row by row. */
  data: Uint8Array;
}

export function newImage(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(body)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb) >>> 0);
  return Buffer.concat([len, tb, crc]);
}

export function encodePng(img: Image): Buffer {
  const { width, height, data } = img;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

export function decodePng(file: Uint8Array): Image {
  const b = Buffer.from(file);
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  let depth = 8;
  let palette: Uint8Array | null = null;
  let alpha: Uint8Array | null = null;
  const idat: Buffer[] = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at);
    const type = b.toString('ascii', at + 4, at + 8);
    const body = b.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      if (body[12] !== 0 || !(body[9] === 3 || ((body[9] === 6 || body[9] === 2) && depth === 8))) throw new Error('unsupported PNG');
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
    } else if (type === 'PLTE') palette = new Uint8Array(body);
    else if (type === 'tRNS') alpha = new Uint8Array(body);
    else if (type === 'IDAT') idat.push(body);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  if (channels === 0) return unpalette(raw, width, height, depth, palette!, alpha);
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? cur[x - channels] : 0;
      const up = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let p = v;
      if (f === 1) p = v + a;
      else if (f === 2) p = v + up;
      else if (f === 3) p = v + ((a + up) >> 1);
      else if (f === 4) {
        const pa = Math.abs(up - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + up - 2 * c);
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
      }
      cur[x] = p & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = cur[x * channels];
      out[(y * width + x) * 4 + 1] = cur[x * channels + 1];
      out[(y * width + x) * 4 + 2] = cur[x * channels + 2];
      out[(y * width + x) * 4 + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

/** A paletted image: rows filtered by bytes (one byte per pixel group), indices at `depth` bits. */
function unpalette(raw: Buffer, width: number, height: number, depth: number, palette: Uint8Array, alpha: Uint8Array | null): Image {
  const stride = Math.ceil((width * depth) / 8);
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 1 ? cur[x - 1] : 0;
      const up = prev[x];
      const c = x >= 1 ? prev[x - 1] : 0;
      let p = v;
      if (f === 1) p = v + a;
      else if (f === 2) p = v + up;
      else if (f === 3) p = v + ((a + up) >> 1);
      else if (f === 4) {
        const pa = Math.abs(up - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + up - 2 * c);
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
      }
      cur[x] = p & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const bit = x * depth;
      const idx = (cur[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      const o = (y * width + x) * 4;
      out[o] = palette[idx * 3];
      out[o + 1] = palette[idx * 3 + 1];
      out[o + 2] = palette[idx * 3 + 2];
      out[o + 3] = alpha && idx < alpha.length ? alpha[idx] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}
