import { Canvas, loadImage, type Image } from "skia-canvas";

interface Frame {
  readonly bytes: Buffer;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly delayMs?: number;
  readonly dispose: "keep" | "background" | "previous";
  readonly replace?: boolean;
  readonly disposalBackground?: string | null;
}

interface Animation {
  readonly width: number;
  readonly height: number;
  readonly frames: Frame[];
  readonly background?: string;
}

export interface MemeImageSequence {
  readonly frames: readonly [Image, ...Image[]];
  readonly averageDelayMs: number;
}

const GIF_TRAILER = Buffer.from([0x3b]);
const MAX_SOURCE_PIXELS = 16_000_000;
const MAX_TOTAL_PIXELS = 64 * 1024 * 1024;
const MAX_SOURCE_BYTES = 24 * 1024 ** 2;
const MAX_SOURCE_FRAMES = 1_000;
const DEFAULT_GIF_DURATION_MS = 20;
const DEFAULT_ALIGNMENT_FRAMES = 100;

function invalid(): never {
  throw new Error("无效或过大的表情输入图片。");
}

function checkSize(width: number, height: number, frames = 1) {
  if (width < 1 || height < 1 || width * height > MAX_SOURCE_PIXELS ||
      width * height * frames > MAX_TOTAL_PIXELS || frames > MAX_SOURCE_FRAMES) invalid();
}

function skipSubBlocks(bytes: Buffer, start: number) {
  let position = start;
  while (position < bytes.length) {
    const length = bytes[position++]!;
    if (!length) return position;
    position += length;
  }
  return invalid();
}

function gifAnimation(bytes: Buffer): Animation {
  if (bytes.length < 13) invalid();
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8);
  checkSize(width, height);
  const header = bytes.subarray(0, 13);
  const flags = header[10]!;
  const globalTableEnd = 13 + (flags & 0x80 ? 3 * (2 << (flags & 7)) : 0);
  const palette = bytes.subarray(13, globalTableEnd);
  let position = globalTableEnd;
  let control: Buffer | undefined;
  let firstTransparent = false;
  let background: string | undefined;
  const frames: Frame[] = [];
  function paletteColor(colorIndex: number, colors: Buffer) {
    if (!colors.length) return;
    const index = colorIndex * 3 < colors.length ? colorIndex * 3 : 0;
    const [r, g, b] = colors.subarray(index, index + 3);
    return `rgb(${r}, ${g}, ${b})`;
  }
  while (position < bytes.length) {
    const marker = bytes[position]!;
    if (marker === 0x3b) return { width, height, frames, background };
    if (marker === 0x21) {
      const end = skipSubBlocks(bytes, position + 2);
      if (bytes[position + 1] === 0xf9) {
        if (end !== position + 8 || bytes[position + 2] !== 4) invalid();
        control = bytes.subarray(position, end);
      }
      position = end;
      continue;
    }
    if (marker !== 0x2c || position + 10 >= bytes.length) invalid();
    const image = Buffer.from(bytes.subarray(position, position + 10));
    const left = image.readUInt16LE(1), top = image.readUInt16LE(3);
    const frameWidth = image.readUInt16LE(5), frameHeight = image.readUInt16LE(7), frameFlags = image[9]!;
    if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) invalid();
    checkSize(width, height, frames.length + 1);
    const imageData = position + 10 + (frameFlags & 0x80 ? 3 * (2 << (frameFlags & 7)) : 0);
    const end = skipSubBlocks(bytes, imageData + 1);
    const frameHeader = Buffer.from(header);
    frameHeader.writeUInt16LE(frameWidth, 6);
    frameHeader.writeUInt16LE(frameHeight, 8);
    image.writeUInt32LE(0, 1);
    const disposal = (control?.[3] ?? 0) >> 2 & 7;
    const transparency = control && (control[3]! & 1) ? control[6] : undefined;
    const colors = frameFlags & 0x80 ? bytes.subarray(position + 10, imageData) : palette;
    if (!frames.length) {
      firstTransparent = transparency !== undefined;
      if (!firstTransparent) background = paletteColor(header[11]!, colors);
    }
    // An opaque first frame keeps the old decoder in RGB mode. Later GIF
    // delta frames may have a transparent palette index as an optimization.
    const disposalBackground = disposal !== 2 ? undefined : firstTransparent && transparency !== undefined
      ? null : paletteColor(transparency ?? header[11]!, colors);
    frames.push({
      bytes: Buffer.concat([frameHeader, palette, control ?? Buffer.alloc(0), image, bytes.subarray(position + 10, end), GIF_TRAILER]),
      left, top, width: frameWidth, height: frameHeight,
      delayMs: control ? control.readUInt16LE(4) * 10 : undefined,
      dispose: disposal === 2 ? "background" : disposal === 3 ? "previous" : "keep",
      disposalBackground,
    });
    control = undefined;
    position = end;
  }
  return invalid();
}

function webpFrame(payload: Buffer, width: number, height: number) {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0);
  header.write("WEBP", 8);
  let extended = Buffer.alloc(0);
  if (payload.subarray(0, 4).toString() === "ALPH") {
    extended = Buffer.alloc(18);
    extended.write("VP8X", 0);
    extended.writeUInt32LE(10, 4);
    extended[8] = 0x10;
    extended.writeUIntLE(width - 1, 12, 3);
    extended.writeUIntLE(height - 1, 15, 3);
  }
  header.writeUInt32LE(4 + extended.length + payload.length, 4);
  return Buffer.concat([header, extended, payload]);
}

function webpAnimation(bytes: Buffer): Animation | undefined {
  if (bytes.length < 30 || bytes.subarray(12, 16).toString() !== "VP8X" || !(bytes[20]! & 2)) return;
  if (bytes.readUInt32LE(16) !== 10 || bytes.readUInt32LE(4) + 8 > bytes.length) invalid();
  const width = bytes.readUIntLE(24, 3) + 1, height = bytes.readUIntLE(27, 3) + 1;
  checkSize(width, height);
  const frames: Frame[] = [];
  const end = bytes.readUInt32LE(4) + 8;
  let background: string | undefined;
  for (let position = 30; position + 8 <= end;) {
    const kind = bytes.subarray(position, position + 4).toString();
    const length = bytes.readUInt32LE(position + 4);
    const start = position + 8;
    position = start + length + (length & 1);
    if (position > end) invalid();
    if (kind === "ANIM" && length === 6) {
      const [b, g, r, a] = bytes.subarray(start, start + 4);
      if (a) background = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    }
    if (kind !== "ANMF") continue;
    if (length < 24) invalid();
    const left = bytes.readUIntLE(start, 3) * 2, top = bytes.readUIntLE(start + 3, 3) * 2;
    const frameWidth = bytes.readUIntLE(start + 6, 3) + 1, frameHeight = bytes.readUIntLE(start + 9, 3) + 1;
    if (left + frameWidth > width || top + frameHeight > height) invalid();
    checkSize(width, height, frames.length + 1);
    const flags = bytes[start + 15]!;
    frames.push({
      bytes: webpFrame(bytes.subarray(start + 16, start + length), frameWidth, frameHeight),
      left, top, width: frameWidth, height: frameHeight,
      delayMs: bytes.readUIntLE(start + 12, 3),
      dispose: flags & 1 ? "background" : "keep",
      replace: Boolean(flags & 2),
    });
  }
  if (!frames.length) invalid();
  return { width, height, frames, background };
}

async function readMemeImageBytes(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!file.size || file.size > MAX_SOURCE_BYTES) invalid();
  const bytes = Buffer.from(await file.arrayBuffer());
  signal.throwIfAborted();
  return bytes;
}

async function readFrame(bytes: Buffer, signal: AbortSignal) {
  const image = await loadImage(bytes);
  checkSize(image.width, image.height);
  signal.throwIfAborted();
  return image;
}

export async function readMemeFirstImage(file: File, signal: AbortSignal): Promise<Image> {
  return readFrame(await readMemeImageBytes(file, signal), signal);
}

/**
 * Skia decodes each frame's original compressed bitstream. It also performs
 * the compositing for sub-frames, transparency and GIF disposal.
 */
export async function readMemeImageSequence(file: File, signal: AbortSignal, timing: "pillow" | "skia" = "pillow"): Promise<MemeImageSequence> {
  const bytes = await readMemeImageBytes(file, signal);
  const format = bytes.subarray(0, 6).toString();
  const isGif = format === "GIF87a" || format === "GIF89a";
  const keepsShortDelay = isGif && timing === "pillow";
  const animation = isGif ? gifAnimation(bytes) :
    bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? webpAnimation(bytes) : undefined;
  if (!animation || animation.frames.length <= 1) {
    return { frames: [await readFrame(bytes, signal)], averageDelayMs: 0 };
  }
  const { width, height, background, frames } = animation;
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  const result: Image[] = [];
  let totalDelay = 0;

  function clear(left: number, top: number, width: number, height: number, fill: string | null | undefined) {
    context.clearRect(left, top, width, height);
    if (fill) {
      context.fillStyle = fill;
      context.fillRect(left, top, width, height);
    }
  }

  clear(0, 0, width, height, background);
  for (const frame of frames) {
    signal.throwIfAborted();
    const image = await loadImage(frame.bytes);
    if (image.width !== frame.width || image.height !== frame.height) invalid();
    const previous = frame.dispose === "previous"
      ? context.getImageData(frame.left, frame.top, frame.width, frame.height) : undefined;
    if (frame.replace) context.clearRect(frame.left, frame.top, frame.width, frame.height);
    context.drawImage(image, frame.left, frame.top);
    result.push(await loadImage(await canvas.png));
    totalDelay += frame.delayMs ?? (keepsShortDelay ? DEFAULT_GIF_DURATION_MS : 0);
    if (frame.dispose === "background") {
      clear(frame.left, frame.top, frame.width, frame.height,
        frame.disposalBackground === undefined ? background : frame.disposalBackground);
    }
    if (previous) context.putImageData(previous, frame.left, frame.top);
  }
  const average = totalDelay / frames.length;
  // The legacy GIF duration fallback applies only to missing timing. Give
  // entirely zero-delay animations a positive cycle so alignment can finish.
  const averageDelayMs = keepsShortDelay && average > 0 ? average : Math.max(DEFAULT_GIF_DURATION_MS, average);
  return { frames: result as [Image, ...Image[]], averageDelayMs };
}

/** Preserve the old ExtendLoop rule using the source's mean frame duration. */
export function alignMemeLoop(source: MemeImageSequence, handFrames: number, frameDelayMs: number, maxFrames = DEFAULT_ALIGNMENT_FRAMES) {
  const sourceDuration = source.frames.length * source.averageDelayMs;
  let length = handFrames;
  if (sourceDuration - length * frameDelayMs >= frameDelayMs) {
    while (length + handFrames <= maxFrames) {
      length += handFrames;
      const duration = length * frameDelayMs;
      if (Math.abs(Math.round(duration / sourceDuration) * sourceDuration - duration) <= frameDelayMs) break;
    }
  }
  return Array.from({ length }, (_, frame) => ({
    overlay: frame % handFrames,
    image: source.frames.length === 1 ? source.frames[0] :
      source.frames[Math.floor((frame * frameDelayMs % sourceDuration) / source.averageDelayMs)]!,
  }));
}
