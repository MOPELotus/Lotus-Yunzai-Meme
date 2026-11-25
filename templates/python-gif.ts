import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import type { CanvasRenderingContext2D } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import { assertMemeGifDimensions, encodeMemeGif, MemeGifByteLimitError } from "./gif.ts";

const maxSendBytes = 8 * 1024 * 1024;
const reducedFrameCount = 100;

interface Frame<T> {
  readonly value: T;
  readonly delayMs: number;
}

interface PythonGif<T> {
  readonly width: number;
  readonly height: number;
  readonly frames: readonly Frame<T>[];
  readonly signal: AbortSignal;
  renderFrame(value: T, width: number, height: number): Promise<Uint8Array>;
}

function withinPixelBudget(width: number, height: number, count: number) {
  try {
    assertMemeGifDimensions(width, height, count);
    return true;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return false;
  }
}

function sampleSequence<T>(frames: readonly Frame<T>[]): Frame<T>[] {
  const stride = frames.length / reducedFrameCount;
  return Array.from({ length: reducedFrameCount }, (_, index) => {
    const start = Math.floor(index * stride);
    const end = index === reducedFrameCount - 1 ? frames.length : Math.floor((index + 1) * stride);
    let delayMs = 0;
    for (let source = start; source < end; source++) {
      // Use the actual GIF centiseconds of the skipped frames, including zero-delay inputs.
      delayMs += Math.max(1, Math.round(frames[source]!.delayMs / 10)) * 10;
    }
    return { value: frames[start]!.value, delayMs };
  });
}

/** Follow Python save_gif on overflow while keeping each surviving frame's original timestamp. */
export async function renderPythonGif<T>({ width, height, frames, signal, renderFrame }: PythonGif<T>) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !frames.length ||
      frames.some(({ delayMs }) => !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 655_350)) {
    throw new RangeError($t("templates.python-gif.text_aa0fc5139f"));
  }
  for (;;) {
    signal.throwIfAborted();
    if (withinPixelBudget(width, height, frames.length)) {
      const rendered = [];
      for (const { value, delayMs } of frames) {
        signal.throwIfAborted();
        rendered.push({ rgba: await renderFrame(value, width, height), delayMs });
      }
      try {
        const gif = encodeMemeGif(width, height, rendered, signal);
        if (gif.byteLength <= maxSendBytes) return gif;
      } catch (error) {
        if (!(error instanceof MemeGifByteLimitError)) throw error;
      }
    }
    if (frames.length > reducedFrameCount) {
      const sampled = sampleSequence(frames);
      if (sampled.every(({ delayMs }) => delayMs <= 655_350)) {
        frames = sampled;
        continue;
      }
    }
    if (width === 1 && height === 1) throw new RangeError($t("templates.python-gif.text_5e8150e972"));
    width = Math.max(1, Math.floor(width * 0.9));
    height = Math.max(1, Math.floor(height * 0.9));
  }
}

export function renderPythonCanvasGif<T>(
  { drawFrame, scale = 1, ...options }: Omit<PythonGif<T>, "renderFrame"> & {
    readonly scale?: number;
    drawFrame(value: T, draw: CanvasRenderingContext2D): void | Promise<void>;
  },
) {
  return renderPythonGif({
    ...options,
    async renderFrame(value, width, height) {
      const { rgba } = await renderRgba(width, height, draw => {
        draw.scale(scale * width / options.width, scale * height / options.height);
        return drawFrame(value, draw);
      });
      return rgba;
    },
  });
}
