import { inflateSync } from "node:zlib";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const channelsByType = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
const adam7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] as const;
const plain = [[0, 0, 1, 1]] as const;

function unfilter(input: Buffer, stride: number, height: number, byteStep: number) {
  const pixels = Buffer.allocUnsafe(stride * height);
  for (let row = 0; row < height; row++) {
    const typeOffset = row * (stride + 1), filter = input[typeOffset]!;
    if (filter > 4) return;
    if (filter === 0) {
      input.copy(pixels, row * stride, typeOffset + 1, typeOffset + 1 + stride);
      continue;
    }
    for (let x = 0, offset = row * stride; x < stride; x++, offset++) {
      const left = x >= byteStep ? pixels[offset - byteStep]! : 0;
      const above = row > 0 ? pixels[offset - stride]! : 0;
      const corner = row > 0 && x >= byteStep ? pixels[offset - stride - byteStep]! : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above :
        filter === 3 ? (left + above) >>> 1 : paeth(left, above, corner);
      pixels[offset] = input[typeOffset + 1 + x]! + predictor;
    }
  }
  return pixels;
}

function paeth(left: number, above: number, corner: number) {
  const estimate = left + above - corner;
  const a = Math.abs(estimate - left), b = Math.abs(estimate - above), c = Math.abs(estimate - corner);
  return a <= b && a <= c ? left : b <= c ? above : corner;
}

/** Keep hidden RGB for algorithms that use it even when the decoded alpha is zero. */
export function readStraightPng(bytes: Buffer, width: number, height: number): Buffer | undefined {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height || width < 1 || height < 1 || width * height > 16_000_000) return;
  const depth = bytes[24]!, type = bytes[25]!, interlaced = bytes[28]!;
  const channels = channelsByType.get(type);
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || bytes[26] || bytes[27] || interlaced > 1 ||
      (type === 3 && depth === 16) || (channels > 1 && depth < 8)) return;

  const data: Buffer[] = [];
  let palette: Buffer | undefined, transparency: Buffer | undefined;
  for (let start = 33; start + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(start);
    const name = bytes.toString("ascii", start + 4, start + 8);
    const end = start + 8 + length;
    if (end + 4 > bytes.length) return;
    const payload = bytes.subarray(start + 8, end);
    if (name === "IEND") break;
    if (name === "IDAT") data.push(payload);
    if (name === "PLTE") palette = payload;
    if (name === "tRNS") transparency = payload;
    start = end + 4;
  }
  if (!data.length || (type === 3 && !palette)) return;

  const passes = (interlaced ? adam7 : plain).flatMap(([left, top, xStep, yStep]) => {
    const columns = Math.ceil((width - left) / xStep), rows = Math.ceil((height - top) / yStep);
    if (columns <= 0 || rows <= 0) return [];
    const stride = Math.ceil(columns * channels * depth / 8);
    return [{ left, top, xStep, yStep, columns, rows, stride, encodedLength: (stride + 1) * rows }];
  });
  const byteStep = Math.max(1, Math.ceil(channels * depth / 8));
  const expected = passes.reduce((sum, pass) => sum + pass.encodedLength, 0);
  let filtered: Buffer;
  try {
    filtered = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  } catch {
    return;
  }
  if (filtered.length !== expected) return;
  if (!interlaced && type === 6 && depth === 8) return unfilter(filtered, width * 4, height, 4);

  const output = Buffer.allocUnsafe(width * height * 4);
  const max = (1 << depth) - 1;
  function normalized(sample: number) {
    // Pillow exposes 16-bit grayscale as integers, clipping conversion to RGB at 255.
    if (depth === 16) return type === 0 ? Math.min(255, sample) : sample >>> 8;
    return depth === 8 ? sample : Math.round(sample * 255 / max);
  }
  function sample(pixels: Buffer, start: number, index: number) {
    if (depth === 16) return pixels.readUInt16BE(start + index * 2);
    const bits = index * depth;
    return (pixels[start + (bits >>> 3)]! >>> (8 - depth - bits % 8)) & max;
  }
  const masked = transparency && transparency.length >= 2 ? transparency.readUInt16BE(0) : -1;
  let start = 0;
  for (const { left, top, xStep, yStep, columns, rows, stride, encodedLength } of passes) {
    const pixels = unfilter(filtered.subarray(start, start + encodedLength), stride, rows, byteStep);
    if (!pixels) return;
    start += encodedLength;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const offset = ((top + y * yStep) * width + left + x * xStep) * 4;
      const row = y * stride, index = x * channels;
      const red = sample(pixels, row, index);
      if (type === 3) {
        const paletteOffset = red * 3;
        if (paletteOffset + 2 >= palette!.length) return;
        output[offset] = palette![paletteOffset]!;
        output[offset + 1] = palette![paletteOffset + 1]!;
        output[offset + 2] = palette![paletteOffset + 2]!;
        output[offset + 3] = transparency?.[red] ?? 255;
      } else if (type === 0 || type === 4) {
        output[offset] = output[offset + 1] = output[offset + 2] = normalized(red);
        output[offset + 3] = type === 4 ? normalized(sample(pixels, row, index + 1)) : red === masked ? 0 : 255;
      } else {
        const green = sample(pixels, row, index + 1), blue = sample(pixels, row, index + 2);
        output[offset] = normalized(red);
        output[offset + 1] = normalized(green);
        output[offset + 2] = normalized(blue);
        const transparent = red === masked && transparency && transparency.length >= 6 &&
          green === transparency.readUInt16BE(2) && blue === transparency.readUInt16BE(4);
        output[offset + 3] = type === 6 ? normalized(sample(pixels, row, index + 3)) : transparent ? 0 : 255;
      }
    }
  }
  return output;
}
