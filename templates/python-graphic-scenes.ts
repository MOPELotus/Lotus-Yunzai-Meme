import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { randomInt } from "node:crypto";
import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { buildImageMeme, loadPythonArt, positionedPhoto } from "./python-motion-scenes.ts";
import { drawFittedText, jpg, paper, registerFont, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { renderTransformSequence } from "./transforms.ts";

async function asImage(width: number, height: number, draw: Draw) {
  return loadImage((await renderExactPng(width, height, draw)).png);
}

async function pixelImage(width: number, height: number, rgba: Uint8ClampedArray) {
  return asImage(width, height, draw => draw.putImageData(new ImageData(rgba, width, height), 0, 0));
}

const renderAdjusted = async (context: MemeTemplateContext, input: File, key: string, name: string) =>
  Promise.all([readMemeImageSequence(input, context.signal), loadPythonArt(context, key, name)] as const);

async function extendEdges(source: Image, margin: number) {
  const { width, height } = source;
  const widthTiles = [[0, 1, 0, margin], [0, width, margin, width], [width - 1, 1, width + margin, margin]] as const;
  const heightTiles = [[0, 1, 0, margin], [0, height, margin, height], [height - 1, 1, height + margin, margin]] as const;
  return asImage(width + 2 * margin, height + 2 * margin, draw => {
    draw.imageSmoothingEnabled = false;
    for (const [sx, sw, dx, dw] of widthTiles) for (const [sy, sh, dy, dh] of heightTiles) {
      draw.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  });
}

const loading = buildImageMeme("loading", ["加载中"], [1, 1], async ({ images }, context) => {
  const [source, icon] = await renderAdjusted(context, images[0]!, "loading", "icon.png");
  const font = await registerFont(context);
  const first = source.frames[0];
  const height = Math.max(1, Math.trunc(first.height * 500 / first.width));
  const thumbHeight = Math.max(1, Math.trunc(first.height * 100 / first.width));
  const stripHeight = Math.max(thumbHeight, 80);
  const totalHeight = height + stripHeight + 10;
  const margin = 12;
  const resized = await asImage(500, height, draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(first, 0, 0, 500, height);
  });
  const extended = await extendEdges(resized, margin);
  const big = await loadImage(await renderMaskedRaster(500, height, draw => {
    draw.filter = "blur(3px)";
    draw.drawImage(extended, -margin, -margin);
  }, [draw => {
    draw.fillStyle = "rgba(0,0,0,0.12549)";
    draw.fillRect(0, 0, 500, height);
  }, draw => draw.drawImage(icon, 200, Math.trunc(height / 2) - 50)], context.signal));
  return renderTransformSequence(source, 500, totalHeight, async (draw, photo) => {
    const composed = await renderMaskedRaster(500, totalHeight, canvas => paper(canvas, 500, totalHeight), [
      canvas => canvas.drawImage(big, 0, 0),
      canvas => canvas.drawImage(photo, 100, height + 5 + Math.floor((stripHeight - thumbHeight) / 2), 100, thumbHeight),
    ], context.signal, { whiteBackground: source.frames.length === 1 });
    draw.drawImage(await loadImage(composed), 0, 0);
    drawFittedText(draw, [210, height + 5, 480, height + stripHeight + 5], $t("templates.python-graphic-scenes.text_e45c9b0369"), font, 12, 60, "left", "black", { wrap: false, paragraphMetrics: true });
  }, context.signal);
});

function scaledHls(red: number, green: number, blue: number) {
  const minimum = Math.min(red, green, blue), maximum = Math.max(red, green, blue);
  const delta = maximum - minimum;
  const luminosity = (minimum + maximum) / 2;
  const hue = delta === 0 ? 0 : maximum === red ? (green - blue) / delta + (green < blue ? 6 : 0) :
    maximum === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  const saturation = delta === 0 ? 0 : delta / (luminosity < 128 ? maximum + minimum : 510 - maximum - minimum);
  return [Math.round(hue * 30) / 30, Math.round(saturation * 255) / 255] as const;
}

function blueTint(rgba: Uint8Array) {
  const hueSaturation = Array.from({ length: 256 }, (_, gray) => scaledHls(Math.floor(gray * 78 / 376), Math.floor(gray * 114 / 376), Math.floor(gray * 184 / 376)));
  const tinted = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const red = rgba[i]!, green = rgba[i + 1]!, blue = rgba[i + 2]!;
    const gray = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
    const light = Math.round((Math.min(red, green, blue) + Math.max(red, green, blue)) / 2) / 255;
    const [hue, saturation] = hueSaturation[gray]!;
    const color = (1 - Math.abs(2 * light - 1)) * saturation;
    const secondary = color * (1 - Math.abs(hue % 2 - 1));
    const [r, g, b] = hue < 1 ? [color, secondary, 0] : hue < 2 ? [secondary, color, 0] : hue < 3 ? [0, color, secondary] :
      hue < 4 ? [0, secondary, color] : hue < 5 ? [secondary, 0, color] : [color, 0, secondary];
    const midpoint = light - color / 2;
    tinted[i] = 255 * (r + midpoint);
    tinted[i + 1] = 255 * (g + midpoint);
    tinted[i + 2] = 255 * (b + midpoint);
    tinted[i + 3] = 255;
  }
  return tinted;
}

const cyan = buildImageMeme("cyan", ["群青"], [1, 1], async ({ images }, context) => {
  const { signal } = context;
  const [photo, normal, bold] = await Promise.all([
    readMemeFirstImage(images[0]!, signal), registerFont(context), registerFont(context, true),
  ]);
  const result = await renderRgba(500, 500, draw => {
    draw.fillStyle = "black";
    draw.fillRect(0, 0, 500, 500);
    positionedPhoto(photo, 0, 0, 500, 500)(draw);
  });
  const tinted = await pixelImage(500, 500, blueTint(result.rgba));
  return jpg(500, 500, draw => {
    draw.drawImage(tinted, 0, 0);
    drawFittedText(draw, [400, 40, 480, 280], $t("templates.python-graphic-scenes.text_57a6d8752a"), bold, 12, 80, "left", "white",
      { wrap: false, paragraphMetrics: true, blockAlignment: "center", stroke: ["#4e72b8", 0.04] });
    drawFittedText(draw, [200, 270, 480, 350], "YOASOBI", normal, 12, 40, "right", "white",
      { wrap: false, paragraphMetrics: true, stroke: ["#4e72b8", 0.06] });
  }, signal);
});

function roundHalfEven(value: number) {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor + floor % 2 : Math.round(value);
}

const lostDog = buildImageMeme("lost_dog", ["寻狗启事"], [1, 1], async ({ images }, context) => {
  const { signal } = context;
  const [photo, art] = await Promise.all([readMemeFirstImage(images[0]!, signal), loadPythonArt(context, "lost_dog")]);
  const width = 1080, resizedWidth = 1326;
  const { rgba } = await renderRgba(resizedWidth, width, positionedPhoto(photo, 0, 0, resizedWidth, width));
  const distorted = new Uint8ClampedArray(width * width * 4);
  for (let x = 0; x < width; x++) {
    const displacement = x - width / 2;
    const ratio = Math.cos(Math.asin(Math.abs(displacement) / 932));
    const sx = roundHalfEven(resizedWidth / 2 + displacement / ratio);
    if (sx < 0 || sx >= resizedWidth) continue;
    for (let y = 0; y < width; y++) {
      const sy = roundHalfEven(width / 2 + (y - width / 2) / ratio);
      if (sy < 0 || sy >= width) continue;
      const source = (sy * resizedWidth + sx) * 4;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) distorted[target + channel] = rgba[source + channel]!;
    }
  }
  const avatar = await pixelImage(width, width, distorted);
  const masked = await renderMaskedRaster(art.width, art.height, draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(avatar, 295, 165, 540, 540);
  }, [draw => draw.drawImage(art, 0, 0)], signal, { whiteBackground: true });
  const joined = await loadImage(masked);
  return jpg(art.width, art.height, draw => draw.drawImage(joined, 0, 0), signal);
}, ["原神", "神里绫华", "米哈游"]);

async function dominantColors(photo: Image) {
  const width = Math.min(96, photo.width);
  const height = Math.min(96, photo.height);
  const { rgba } = await renderRgba(width, height, draw => draw.drawImage(photo, 0, 0, width, height));
  const bins = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
    if (r * 0.299 + g * 0.578 + b * 0.114 >= 200 || rgba[i + 3] === 0) continue;
    const key = (r & 224) << 16 | (g & 224) << 8 | b & 224;
    const count = bins.get(key);
    if (!count) bins.set(key, [1, r, g, b]);
    else {
      count[0]++;
      count[1] += r;
      count[2] += g;
      count[3] += b;
    }
  }
  return [...bins.values()].sort((a, b) => b[0] - a[0]).slice(0, 20).map(([count, r, g, b]) =>
    `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`);
}

const dontTouch = buildImageMeme("dont_touch", ["别碰"], [1, 1], async ({ images }, context) => {
  const { signal } = context;
  const [[source, art], mask] = await Promise.all([
    renderAdjusted(context, images[0]!, "dont_touch", "0.png"), loadPythonArt(context, "dont_touch", "mask.png"),
  ]);
  const { rgba } = await renderRgba(mask.width, mask.height, draw => draw.drawImage(mask, 0, 0));
  return renderTransformSequence(source, art.width, art.height, async (draw, photo) => {
    const palette = await dominantColors(photo);
    draw.drawImage(art, 0, 0);
    const positions: [number, number][] = [];
    for (let attempt = 0; palette.length > 0 && attempt < 150; attempt++) {
      const x = randomInt(200, 401), y = randomInt(300, 651);
      if (!rgba[(y * mask.width + x) * 4] || positions.some(([tx, ty]) => Math.abs(x - tx) < 13 && Math.abs(y - ty) < 13)) continue;
      positions.push([x, y]);
      draw.save();
      draw.translate(x + 8, y + 8);
      draw.rotate(-Math.PI / 4);
      draw.fillStyle = palette[randomInt(palette.length)]!;
      draw.fillRect(-5, -5, 10, 10);
      draw.restore();
    }
    positionedPhoto(photo, 25, 460, 250, 250, true)(draw);
  }, signal);
});

function reflectIndex(index: number, length: number) {
  return index < 0 ? -index : index >= length ? 2 * length - index - 2 : index;
}

function motionPixels(rgba: Uint8Array, size: number, angle: number, degree: number) {
  if (degree === 0) return new Uint8ClampedArray(rgba);
  const center = degree / 2;
  const rotation = (angle + 45) * Math.PI / 180;
  const sine = Math.sin(rotation), cosine = Math.cos(rotation);
  const taps: [dx: number, dy: number, weight: number][] = [];
  for (let x = 0; x < degree; x++) {
    for (let y = 0; y < degree; y++) {
      const u = Math.round((center + cosine * (x - center) - sine * (y - center)) * 32) / 32;
      const v = Math.round((center + sine * (x - center) + cosine * (y - center)) * 32) / 32;
      const start = Math.max(0, Math.floor(Math.min(u, v)));
      const end = Math.min(degree - 1, Math.ceil(Math.max(u, v)));
      let weight = 0;
      for (let tap = start; tap <= end; tap++) weight += Math.max(0, 1 - Math.abs(u - tap)) * Math.max(0, 1 - Math.abs(v - tap));
      if (weight > 0) taps.push([x - Math.floor(center), y - Math.floor(center), weight / degree]);
    }
  }
  const buffer = new Uint8ClampedArray(rgba.length);
  let minimum = 255, maximum = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy, weight] of taps) {
        const i = (reflectIndex(y + dy, size) * size + reflectIndex(x + dx, size)) * 4;
        r += rgba[i]! * weight;
        g += rgba[i + 1]! * weight;
        b += rgba[i + 2]! * weight;
        a += rgba[i + 3]! * weight;
      }
      const i = (y * size + x) * 4;
      buffer[i] = r; buffer[i + 1] = g; buffer[i + 2] = b; buffer[i + 3] = a;
      minimum = Math.min(minimum, buffer[i]!, buffer[i + 1]!, buffer[i + 2]!, buffer[i + 3]!);
      maximum = Math.max(maximum, buffer[i]!, buffer[i + 1]!, buffer[i + 2]!, buffer[i + 3]!);
    }
  }
  const delta = maximum - minimum;
  if (!delta) return buffer.fill(0);
  for (let i = 0; i < buffer.length; i++) buffer[i] = 255 * (buffer[i]! - minimum) / delta;
  return buffer;
}

const shock = buildImageMeme("shock", ["震惊"], [1, 1], async ({ images }, context) => {
  const { signal } = context;
  const size = 300;
  const photo = await readMemeFirstImage(images[0]!, signal);
  const { rgba } = await renderRgba(size, size, positionedPhoto(photo, 0, 0, size, size));
  const frames = Array.from({ length: 30 }, () => ({
    value: { direction: randomInt(-90, 91), intensity: randomInt(51), rotation: randomInt(-20, 21) }, delayMs: 10,
  }));
  return renderPythonCanvasGif({ ...rgbaFrameDimensions(size, size), frames, signal, async drawFrame(value, draw) {
    const blurred = await pixelImage(size, size, motionPixels(rgba, size, value.direction, value.intensity));
    draw.translate(size / 2, size / 2);
    draw.rotate(-value.rotation * Math.PI / 180);
    draw.drawImage(blurred, -size / 2, -size / 2);
  } });
});

export const pythonGraphicSceneTemplates = [cyan, dontTouch, loading, lostDog, shock] as const;
