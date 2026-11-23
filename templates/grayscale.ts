import { loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";

export async function grayImage(image: Image, signal: AbortSignal) {
  signal.throwIfAborted();
  const { width, height } = image;
  const { png } = await renderExactPng(width, height, (draw) => {
    draw.drawImage(image, 0, 0);
    const pixels = draw.getImageData(0, 0, width, height);
    const rgba = pixels.data;
    for (let i = 0; i < rgba.length; i += 4) {
      const gray = Math.round(rgba[i]! * 0.299 + rgba[i + 1]! * 0.587 + rgba[i + 2]! * 0.114);
      rgba[i] = rgba[i + 1] = rgba[i + 2] = gray;
      rgba[i + 3] = 255;
    }
    draw.putImageData(pixels, 0, 0);
  });
  signal.throwIfAborted();
  return loadImage(png);
}
