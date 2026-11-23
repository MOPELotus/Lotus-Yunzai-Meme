import { ImageData } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { Draw } from "./template-layout.ts";

function pasteMask(rgba: Uint8Array, overlay: Uint8Array) {
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = overlay[i + 3]!;
    if (!alpha) continue;
    for (let channel = i; channel < i + 4; channel++) {
      rgba[channel] = Math.round((overlay[channel]! * alpha + rgba[channel]! * (255 - alpha)) / 255);
    }
  }
}

/** Reproduce the original Pillow paste with the artwork's own alpha as a mask. */
export async function renderMaskedRaster(width: number, height: number, base: Draw, layers: readonly Draw[], signal: AbortSignal,
  { whiteBackground = false } = {}) {
  signal.throwIfAborted();
  const { rgba } = await renderRgba(width, height, base);
  for (const draw of layers) {
    signal.throwIfAborted();
    pasteMask(rgba, (await renderRgba(width, height, draw)).rgba);
  }
  if (whiteBackground) {
    for (let i = 0; i < rgba.length; i += 4) {
      const alpha = rgba[i + 3]!;
      for (let channel = i; channel < i + 3; channel++) {
        rgba[channel] = Math.round((rgba[channel]! * alpha) / 255 + 255 - alpha);
      }
      rgba[i + 3] = 255;
    }
  }
  signal.throwIfAborted();
  const pixels = new ImageData(new Uint8ClampedArray(rgba), width, height);
  const { png } = await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0));
  signal.throwIfAborted();
  return png;
}
