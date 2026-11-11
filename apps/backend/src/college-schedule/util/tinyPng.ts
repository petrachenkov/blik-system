import { inflateSync } from "node:zlib";

/**
 * Minimal PNG decoder good for exactly one thing: reading a tiny solid-color
 * icon (the red/blue week-circle markers Google Sheets embeds as drawings)
 * and returning its dominant color. Not a general PNG decoder — bails out
 * (returns null) on anything it doesn't confidently understand rather than
 * risk misreading it.
 */

type Rgb = [number, number, number];

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset++];
    const rowStart = y * stride;
    const prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const raw_ = raw[rawOffset + x];
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[prevRowStart + x] : 0;
      const c = y > 0 && x >= bpp ? out[prevRowStart + x - bpp] : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = raw_;
          break;
        case 1:
          value = raw_ + a;
          break;
        case 2:
          value = raw_ + b;
          break;
        case 3:
          value = raw_ + Math.floor((a + b) / 2);
          break;
        case 4:
          value = raw_ + paethPredictor(a, b, c);
          break;
        default:
          value = raw_;
      }
      out[rowStart + x] = value & 0xff;
    }
    rawOffset += stride;
  }
  return out;
}

/** Returns the average RGB color of a simple, non-interlaced 8-bit PNG, or null if unsupported. */
export function decodePngAverageColor(buf: Buffer): Rgb | null {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null; // not a PNG

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Rgb[] | null = null;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buf.subarray(dataStart, dataStart + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "PLTE") {
      palette = [];
      for (let i = 0; i + 2 < data.length; i += 3) {
        palette.push([data[i], data[i + 1], data[i + 2]]);
      }
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4; // skip CRC
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
  if (colorType === 3 && !palette) return null;

  const channelsByType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!channels) return null;
  const bpp = channels; // bitDepth is always 8 here

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }
  const pixels = unfilter(raw, width, height, bpp);

  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * bpp;
      let pr: number, pg: number, pb: number, alpha = 255;
      switch (colorType) {
        case 0: // grayscale
          pr = pg = pb = pixels[idx];
          break;
        case 2: // truecolor
          pr = pixels[idx];
          pg = pixels[idx + 1];
          pb = pixels[idx + 2];
          break;
        case 3: {
          // indexed
          const entry = palette![pixels[idx]];
          if (!entry) continue;
          [pr, pg, pb] = entry;
          break;
        }
        case 4: // grayscale + alpha
          pr = pg = pb = pixels[idx];
          alpha = pixels[idx + 1];
          break;
        case 6: // truecolor + alpha
          pr = pixels[idx];
          pg = pixels[idx + 1];
          pb = pixels[idx + 2];
          alpha = pixels[idx + 3];
          break;
        default:
          continue;
      }
      if (alpha < 128) continue; // skip mostly-transparent pixels
      r += pr;
      g += pg;
      b += pb;
      count++;
    }
  }
  if (count === 0) return null;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

export type WeekColor = "red" | "blue";

/** Classifies a small solid-color icon as the red or blue week marker, or null if it's neither. */
export function classifyWeekColor(buf: Buffer): WeekColor | null {
  const rgb = decodePngAverageColor(buf);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  if (r > g + 40 && r > b + 40) return "red";
  if (b > r + 40 && b > g + 40) return "blue";
  return null;
}
