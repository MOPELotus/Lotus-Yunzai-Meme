interface RgbaFrame {
  readonly rgba: Uint8Array;
  readonly delayMs: number;
}

const maxFramePixels = 24_000_000;
const maxGifBytes = 16 * 1024 * 1024;
const maxColor = 255;

export class MemeGifByteLimitError extends RangeError {
  constructor() {
    super("表情动图超过 16 MiB。");
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

function paletteFor(frames: readonly RgbaFrame[], signal: AbortSignal) {
  const counts = new Uint32Array(1 << 15);
  const reds = new Float64Array(counts.length), greens = new Float64Array(counts.length), blues = new Float64Array(counts.length);
  const exact = new Map<number, number>();
  let transparent = false;
  for (const { rgba } of frames) {
    signal.throwIfAborted();
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
  const colors: number[] = transparent ? [0, 0, 0] : [];
  const firstColor = transparent ? 1 : 0;
  if (exact.size <= 256 - firstColor) {
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
  while (boxes.length < 256 - firstColor) {
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
  return { colors, transparent, index: (red: number, green: number, blue: number) => indexed[colorBin(red, green, blue)]! };
}

class GifBytes {
  private bytes = new Uint8Array(4096);
  private length = 0;

  byte(value: number) {
    if (this.length === this.bytes.length) {
      if (this.length >= maxGifBytes) throw new MemeGifByteLimitError();
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

export function assertMemeGifDimensions(width: number, height: number, frames: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > 4096 || height > 4096 || !Number.isSafeInteger(frames) || frames < 1 || frames > 1_000 ||
      width * height * frames > maxFramePixels) {
    throw new RangeError("表情动图的尺寸或帧数超限。");
  }
}

/** Encode Skia RGBA frames as a looping GIF with explicitly bounded work. */
export function encodeMemeGif(width: number, height: number, frames: readonly RgbaFrame[], signal: AbortSignal): Uint8Array {
  assertMemeGifDimensions(width, height, frames.length);
  if (frames.some(frame => frame.rgba.length !== width * height * 4 ||
      !Number.isFinite(frame.delayMs) || frame.delayMs < 0 || frame.delayMs > 655_350)) {
    throw new RangeError("表情动图的帧像素或时长无效。");
  }
  const palette = paletteFor(frames, signal);
  const exponent = Math.max(1, Math.ceil(Math.log2(palette.colors.length / 3)));
  const output = new GifBytes();
  output.write([71, 73, 70, 56, 57, 97]);
  output.word(width);
  output.word(height);
  output.write([0x80 | 0x70 | (exponent - 1), 0, 0]);
  output.write(palette.colors);
  for (let i = palette.colors.length; i < (1 << exponent) * 3; i++) output.byte(0);
  output.write([0x21, 0xff, 11, ...new TextEncoder().encode("NETSCAPE2.0"), 3, 1, 0, 0, 0]);

  const indexes = new Uint8Array(width * height);
  for (const { rgba, delayMs } of frames) {
    signal.throwIfAborted();
    for (let index = 0; index < indexes.length; index++) {
      const pixel = index * 4;
      indexes[index] = rgba[pixel + 3]! < 128 ? 0 : palette.index(rgba[pixel]!, rgba[pixel + 1]!, rgba[pixel + 2]!);
    }
    output.write([0x21, 0xf9, 4, palette.transparent ? 0x09 : 0x04]);
    output.word(Math.max(1, Math.round(delayMs / 10)));
    output.write([0, 0, 0x2c, 0, 0, 0, 0]);
    output.word(width);
    output.word(height);
    output.byte(0);
    writeLzw(output, indexes, Math.max(2, exponent));
  }
  output.byte(0x3b);
  return output.result();
}
