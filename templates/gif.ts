import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RgbaFrame {
  readonly rgba: Uint8Array;
  readonly delayMs: number;
}

const maxFramePixels = 24_000_000;
const maxStreamPixels = 64 * 1024 * 1024;
const maxGifBytes = 16 * 1024 * 1024;
const maxStreamGifBytes = 8 * 1024 * 1024;
const maxColor = 255;

export class MemeGifByteLimitError extends RangeError {
  constructor(limit = maxGifBytes) {
    super($t("templates.gif.text_ea7ba354a9", { "value1": limit / (1024 * 1024) }));
  }
}

export class MemeGifDimensionLimitError extends RangeError {
  constructor() {
    super($t("templates.gif.text_3c77a0a604"));
  }
}

function colorBin(red: number, green: number, blue: number) {
  return ((red >>> 3) << 10) | ((green >>> 3) << 5) | (blue >>> 3);
}

const channelShifts = [10, 5, 0] as const;

function colorBox(bins: number[], counts: Uint32Array) {
  let count = 0;
  const low = [31, 31, 31], high = [0, 0, 0];
  for (const bin of bins) {
    count += counts[bin]!;
    for (const [channel, shift] of channelShifts.entries()) {
      const value = (bin >>> shift) & 31;
      low[channel] = Math.min(low[channel]!, value);
      high[channel] = Math.max(high[channel]!, value);
    }
  }
  const ranges = high.map((value, index) => value - low[index]!);
  const side = Math.max(...ranges);
  return { bins, count, shift: channelShifts[ranges.indexOf(side)]!, priority: count * side };
}

function paletteAccumulator() {
  const counts = new Uint32Array(1 << 15);
  const reds = new Float64Array(counts.length), greens = new Float64Array(counts.length), blues = new Float64Array(counts.length);
  const exact = new Map<number, number>();
  let transparent = false;
  function add(rgba: Uint8Array) {
    for (let pixel = 0; pixel < rgba.length; pixel += 4) {
      if (rgba[pixel + 3]! < 128) {
        transparent = true;
        continue;
      }
      const red = rgba[pixel]!, green = rgba[pixel + 1]!, blue = rgba[pixel + 2]!;
      const bin = colorBin(red, green, blue);
      counts[bin]!++;
      reds[bin]! += red;
      greens[bin]! += green;
      blues[bin]! += blue;
      if (exact.size <= 256) exact.set((red << 16) | (green << 8) | blue, 0);
    }
  }
  function finish(limit = 256, nearest = false) {
    return makePalette(counts, reds, greens, blues, exact, transparent, limit, nearest);
  }
  return { add, finish };
}

function makePalette(counts: Uint32Array, reds: Float64Array, greens: Float64Array, blues: Float64Array,
  exact: Map<number, number>, transparent: boolean, limit: number, nearest: boolean) {
  const colors: number[] = transparent ? [0, 0, 0] : [];
  const firstColor = transparent ? 1 : 0;
  if (exact.size <= limit - firstColor) {
    for (const rgb of exact.keys()) {
      exact.set(rgb, colors.length / 3);
      colors.push(rgb >>> 16, (rgb >>> 8) & maxColor, rgb & maxColor);
    }
    return {
      colors,
      transparent,
      index: (red: number, green: number, blue: number) => exact.get((red << 16) | (green << 8) | blue)!,
    };
  }

  // Split dense color boxes at their weighted medians. A shared palette avoids
  // changing the color of a stationary pixel between consecutive frames.
  const bins: number[] = [];
  for (let bin = 0; bin < counts.length; bin++) if (counts[bin]) bins.push(bin);
  const boxes = [colorBox(bins, counts)];
  while (boxes.length < limit - firstColor) {
    const highest = boxes.reduce((best, box, i) => box.priority > boxes[best]!.priority ? i : best, 0);
    const box = boxes[highest]!;
    if (box.bins.length < 2) break;
    box.bins.sort((left, right) => ((left >>> box.shift) & 31) - ((right >>> box.shift) & 31));
    let split = 1, traversed = counts[box.bins[0]!]!;
    while (split < box.bins.length - 1 && traversed * 2 < box.count) traversed += counts[box.bins[split++]!]!;
    boxes[highest] = colorBox(box.bins.slice(0, split), counts);
    boxes.push(colorBox(box.bins.slice(split), counts));
  }
  const indexed = new Uint8Array(counts.length);
  for (const box of boxes) {
    const index = colors.length / 3;
    let red = 0, green = 0, blue = 0;
    for (const bin of box.bins) {
      indexed[bin] = index;
      red += reds[bin]!;
      green += greens[bin]!;
      blue += blues[bin]!;
    }
    colors.push(Math.round(red / box.count), Math.round(green / box.count), Math.round(blue / box.count));
  }
  if (nearest) {
    for (const bin of bins) {
      const red = reds[bin]! / counts[bin]!, green = greens[bin]! / counts[bin]!, blue = blues[bin]! / counts[bin]!;
      let closest = firstColor, best = Infinity;
      for (let i = firstColor * 3; i < colors.length; i += 3) {
        const r = red - colors[i]!, g = green - colors[i + 1]!, b = blue - colors[i + 2]!;
        const distance = r * r + g * g + b * b;
        if (distance >= best) continue;
        closest = i / 3;
        best = distance;
      }
      indexed[bin] = closest;
    }
  }
  return { colors, transparent, index: (red: number, green: number, blue: number) => indexed[colorBin(red, green, blue)]! };
}

class GifBytes {
  private bytes = new Uint8Array(4096);
  private length = 0;

  constructor(private readonly limit: number) {}

  byte(value: number) {
    if (this.length === this.bytes.length) {
      if (this.length >= this.limit) throw new MemeGifByteLimitError(this.limit);
      const expanded = new Uint8Array(this.bytes.length * 2);
      expanded.set(this.bytes);
      this.bytes = expanded;
    }
    this.bytes[this.length++] = value;
  }

  write(values: ArrayLike<number>) {
    for (let i = 0; i < values.length; i++) this.byte(values[i]!);
  }

  word(value: number) {
    this.byte(value);
    this.byte(value >>> 8);
  }

  result() {
    return this.bytes.subarray(0, this.length);
  }
}

function writeLzw(output: GifBytes, indexes: Uint8Array, codeSize: number) {
  output.byte(codeSize);
  const clear = 1 << codeSize;
  const end = clear + 1;
  const dictionaryLimit = 4096;
  const dictionary = new Map<number, number>();
  const block = new Uint8Array(255);
  let blockLength = 0, bitBuffer = 0, bufferedBits = 0;
  let width = codeSize + 1, nextCode = end + 1, decoderCode = end + 1, decoderHasPrefix = false;

  function pushByte(value: number) {
    block[blockLength++] = value;
    if (blockLength === block.length) {
      output.byte(blockLength);
      output.write(block);
      blockLength = 0;
    }
  }
  function emit(code: number) {
    bitBuffer |= code << bufferedBits;
    bufferedBits += width;
    while (bufferedBits >= 8) {
      pushByte(bitBuffer);
      bitBuffer >>>= 8;
      bufferedBits -= 8;
    }
    if (code === clear) {
      dictionary.clear();
      width = codeSize + 1;
      nextCode = decoderCode = end + 1;
      decoderHasPrefix = false;
    } else if (code !== end) {
      // The reader installs a dictionary entry one data code after the writer.
      if (decoderHasPrefix && decoderCode < dictionaryLimit && ++decoderCode === (1 << width) && width < 12) width++;
      decoderHasPrefix = true;
    }
  }

  emit(clear);
  let prefix = indexes[0]!;
  for (let i = 1; i < indexes.length; i++) {
    const value = indexes[i]!;
    const key = (prefix << 8) | value;
    const combined = dictionary.get(key);
    if (combined !== undefined) {
      prefix = combined;
    } else {
      emit(prefix);
      if (nextCode < dictionaryLimit) dictionary.set(key, nextCode++);
      else emit(clear);
      prefix = value;
    }
  }
  emit(prefix);
  emit(end);
  if (bufferedBits) pushByte(bitBuffer);
  if (blockLength) {
    output.byte(blockLength);
    output.write(block.subarray(0, blockLength));
  }
  output.byte(0);
}

function assertDimensions(width: number, height: number, frames: number, budget: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > 4096 || height > 4096 || !Number.isSafeInteger(frames) || frames < 1 || frames > 1_000 ||
      width * height * frames > budget) {
    throw new MemeGifDimensionLimitError();
  }
}

export function assertMemeGifDimensions(width: number, height: number, frames: number) {
  assertDimensions(width, height, frames, maxFramePixels);
}

export function assertMemeGifStreamDimensions(width: number, height: number, frameLimit: number) {
  assertDimensions(width, height, frameLimit, maxStreamPixels);
}

function validateFrame(frame: RgbaFrame, frameBytes: number) {
  if (frame.rgba.length !== frameBytes || !Number.isFinite(frame.delayMs) || frame.delayMs < 0 || frame.delayMs > 655_350) {
    throw new RangeError($t("templates.gif.text_f2c692fa2d"));
  }
}

type Palette = ReturnType<typeof makePalette>;

function indexFrame(indexes: Uint8Array, rgba: Uint8Array, palette: Palette) {
  for (let index = 0; index < indexes.length; index++) {
    const pixel = index * 4;
    indexes[index] = rgba[pixel + 3]! < 128 ? 0 : palette.index(rgba[pixel]!, rgba[pixel + 1]!, rgba[pixel + 2]!);
  }
}

function gifWriter(width: number, height: number, palette: Palette, limit: number, preserveZeroDelay = false) {
  const exponent = Math.max(1, Math.ceil(Math.log2(palette.colors.length / 3)));
  const output = new GifBytes(limit);
  output.write([71, 73, 70, 56, 57, 97]);
  output.word(width);
  output.word(height);
  output.write([0x80 | 0x70 | (exponent - 1), 0, 0]);
  output.write(palette.colors);
  for (let i = palette.colors.length; i < (1 << exponent) * 3; i++) output.byte(0);
  output.write([0x21, 0xff, 11, ...new TextEncoder().encode("NETSCAPE2.0"), 3, 1, 0, 0, 0]);

  function add(indexes: Uint8Array, delayMs: number, { left = 0, top = 0, right = width, bottom = height } = {},
    clear = palette.transparent) {
    output.write([0x21, 0xf9, 4, (clear ? 0x08 : 0x04) | (palette.transparent ? 1 : 0)]);
    output.word(preserveZeroDelay && delayMs === 0 ? 0 : Math.max(1, Math.round(delayMs / 10)));
    output.write([0, 0, 0x2c]);
    output.word(left);
    output.word(top);
    output.word(right - left);
    output.word(bottom - top);
    output.byte(0);
    writeLzw(output, indexes, Math.max(2, exponent));
  }
  function finish() {
    output.byte(0x3b);
    return output.result();
  }
  return { add, finish };
}

/** Encode Skia RGBA frames as a looping GIF with explicitly bounded work. */
export function encodeMemeGif(width: number, height: number, frames: readonly RgbaFrame[], signal: AbortSignal,
  { preserveZeroDelay }: { readonly preserveZeroDelay?: true } = {},
): Uint8Array {
  assertMemeGifDimensions(width, height, frames.length);
  for (const frame of frames) validateFrame(frame, width * height * 4);
  const palette = paletteAccumulator();
  for (const { rgba } of frames) {
    signal.throwIfAborted();
    palette.add(rgba);
  }
  const indexes = new Uint8Array(width * height);
  const colors = palette.finish();
  const writer = gifWriter(width, height, colors, maxGifBytes, preserveZeroDelay);
  for (const { rgba, delayMs } of frames) {
    signal.throwIfAborted();
    indexFrame(indexes, rgba, colors);
    writer.add(indexes, delayMs);
  }
  return writer.finish();
}

function changedRectangle(before: Uint8Array, after: Uint8Array, width: number, height: number) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (before[row + x] === after[row + x]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = y + 1;
    }
  }
  return right === 0 ? { left: 0, top: 0, right: 1, bottom: 1 } : { left, top, right, bottom };
}

// A transparent GIF pixel leaves the previous screen untouched. Clear a full
// frame before any transition that removes an opaque pixel.
async function writeCompactFrames(width: number, height: number, delays: readonly number[], palette: Palette,
  readIndexes: (frame: number, indexes: Uint8Array) => Promise<void>) {
  const pixels = width * height;
  let previous = new Uint8Array(pixels), current = new Uint8Array(pixels), next = new Uint8Array(pixels);
  const cropped = new Uint8Array(pixels);
  const writer = gifWriter(width, height, palette, maxStreamGifBytes);
  let previousCleared = true;
  await readIndexes(0, current);
  for (const [frame, delay] of delays.entries()) {
    const last = frame === delays.length - 1;
    if (!last) await readIndexes(frame + 1, next);
    const clear = palette.transparent && (last || next.some((color, i) => color === 0 && current[i] !== 0));
    if (previousCleared || clear) {
      writer.add(current, delay, undefined, clear);
    } else {
      const { left, top, right, bottom } = changedRectangle(previous, current, width, height);
      const stride = right - left;
      for (let row = top; row < bottom; row++) {
        cropped.set(current.subarray(row * width + left, row * width + right), (row - top) * stride);
      }
      writer.add(cropped.subarray(0, stride * (bottom - top)), delay, { left, top, right, bottom }, clear);
    }
    previousCleared = clear;
    [previous, current, next] = [current, next, previous];
  }
  return writer.finish();
}

/** Encode a large animation with one rendered frame in memory per pass. */
export async function encodeMemeGifStream(
  width: number, height: number, frameLimit: number, frames: AsyncIterable<RgbaFrame>, signal: AbortSignal,
  { paletteLimits }: { readonly paletteLimits?: readonly [number, ...number[]] } = {},
): Promise<Uint8Array> {
  if (paletteLimits?.some(limit => !Number.isSafeInteger(limit) || limit < 2 || limit > 256)) {
    throw new RangeError($t("templates.gif.text_3e077e4f0f"));
  }
  assertMemeGifStreamDimensions(width, height, frameLimit);
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-gif-"));
  try {
    const file = await open(join(directory, "frames.rgba"), "wx+", 0o600);
    try {
      const frameBytes = width * height * 4;
      const palette = paletteAccumulator();
      const delays: number[] = [];
      for await (const frame of frames) {
        signal.throwIfAborted();
        if (delays.length >= frameLimit) throw new MemeGifDimensionLimitError();
        validateFrame(frame, frameBytes);
        palette.add(frame.rgba);
        const position = delays.length * frameBytes;
        let written = 0;
        while (written < frameBytes) {
          signal.throwIfAborted();
          const { bytesWritten } = await file.write(frame.rgba, written, frameBytes - written, position + written);
          if (!bytesWritten) throw new Error($t("templates.gif.text_36bb833a2d"));
          written += bytesWritten;
        }
        delays.push(frame.delayMs);
      }
      signal.throwIfAborted();
      if (!delays.length) throw new MemeGifDimensionLimitError();
      const rgba = Buffer.allocUnsafe(frameBytes);
      async function encode(colors: Palette) {
        async function readIndexes(index: number, indexes: Uint8Array) {
          let read = 0;
          while (read < frameBytes) {
            signal.throwIfAborted();
            const { bytesRead } = await file.read(rgba, read, frameBytes - read, index * frameBytes + read);
            if (!bytesRead) throw new Error($t("templates.gif.text_df7ae25630"));
            read += bytesRead;
          }
          signal.throwIfAborted();
          indexFrame(indexes, rgba, colors);
        }
        try {
          const writer = gifWriter(width, height, colors, maxStreamGifBytes);
          const indexes = new Uint8Array(width * height);
          for (const [index, delayMs] of delays.entries()) {
            await readIndexes(index, indexes);
            writer.add(indexes, delayMs);
          }
          return writer.finish();
        } catch (error) {
          if (!(error instanceof MemeGifByteLimitError)) throw error;
        }
        const result = await writeCompactFrames(width, height, delays, colors, readIndexes);
        signal.throwIfAborted();
        return result;
      }
      if (!paletteLimits) return await encode(palette.finish());
      let limitError = new MemeGifByteLimitError(maxStreamGifBytes);
      for (const limit of paletteLimits) {
        signal.throwIfAborted();
        try {
          return await encode(palette.finish(limit, true));
        } catch (error) {
          if (!(error instanceof MemeGifByteLimitError)) throw error;
          limitError = error;
        }
      }
      throw limitError;
    } finally {
      await file.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
