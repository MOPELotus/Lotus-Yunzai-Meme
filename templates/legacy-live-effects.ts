import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Dimensions, copy and original timing from MemeCrafters/meme-generator v0.1.14.
import { renderExactPng } from "../../../packages/skia/index.ts";
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { drawAvatar, type AvatarPlacement } from "./avatar-slot.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { drawFittedText, paper, previewImage, registerFont, registerMemeTypeface, type Draw } from "./template-layout.ts";

const single = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };
const empty: Draw = () => {};

function scaleDraw(paint: Draw, x: number, y: number): Draw {
  return draw => { draw.scale(x, y); paint(draw); };
}

async function maskedImageOrGif(source: MemeImageSequence, width: number, height: number, base: Draw,
  overlays: (image: Image) => Promise<readonly Draw[]> | readonly Draw[], signal: AbortSignal) {
  if (source.frames.length === 1) {
    return renderMaskedRaster(width, height, base, await overlays(source.frames[0]), signal);
  }
  return renderPythonGif({
    width, height, signal, frames: source.frames.map(value => ({ value, delayMs: source.averageDelayMs })),
    async renderFrame(image, w, h) {
      const scale = (paint: Draw) => scaleDraw(paint, w / width, h / height);
      const rgba = await renderMaskedRgba(w, h, scale(base), (await overlays(image)).map(scale), signal);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
      return rgba;
    },
  });
}

// Extend the edge pixels before applying Skia's blur, matching Pillow's outer boundaries.
async function blurPhoto(image: Image, width: number, height: number) {
  const bleed = 30;
  const { width: iw, height: ih } = image;
  const { png } = await renderExactPng(width + bleed * 2, height + bleed * 2, draw => {
    draw.imageSmoothingQuality = "high";
    const ySpans = [[0, 1, 0, bleed], [0, ih, bleed, height], [ih - 1, 1, bleed + height, bleed]] as const;
    const xSpans = [[0, 1, 0, bleed], [0, iw, bleed, width], [iw - 1, 1, bleed + width, bleed]] as const;
    for (const [sy, sh, y, h] of ySpans) {
      for (const [sx, sw, x, w] of xSpans) draw.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    }
  });
  const expanded = await loadImage(png);
  return (draw => {
    draw.filter = "blur(10px)";
    draw.drawImage(expanded, -bleed, -bleed);
    draw.filter = "none";
  }) satisfies Draw;
}

const foggingText = $t("templates.legacy-live-effects.text_8797652c15");
const fogging: MemeTemplate = {
  info: { key: "fogging", keywords: ["回南天", "水雾"], params_type: { ...single, max_texts: 1, default_texts: [foggingText] } },
  async render({ images, texts }, context) {
    if (images.length !== 1 || texts.length > 1) throw new Error($t("templates.legacy-live-effects.text_747d549fd8"));
    const { signal } = context;
    const [source, mask, font] = await Promise.all([
      readMemeImageSequence(images[0]!, signal), context.imageAsset("fogging/0.png").then(loadImage), registerFont(context),
    ]);
    const first = source.frames[0];
    const width = Math.min(first.width, 500), height = Math.max(1, Math.trunc(first.height * width / first.width));
    const { png } = await renderExactPng(width, height, draw => {
      drawAvatar(draw, mask, { slot: [0, 0, width, height] }, false);
      drawFittedText(draw, [10, 10, width - 10, 80], texts[0] ?? foggingText, font, 12, 40, "center", "black",
        { wrap: false, paragraphMetrics: true });
    });
    const fog = await loadImage(png);
    const cover: Draw = draw => draw.drawImage(fog, 0, 0);
    if (source.frames.length === 1) return renderMaskedRaster(width, height, await blurPhoto(first, width, height), [cover], signal);
    return renderPythonGif({
      width, height, signal, frames: source.frames.map(value => ({ value, delayMs: source.averageDelayMs })),
      async renderFrame(image, w, h) {
        const base = await blurPhoto(image, width, height);
        const rgba = await renderMaskedRgba(w, h, scaleDraw(base, w / width, h / height), [scaleDraw(cover, w / width, h / height)], signal);
        for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
        return rgba;
      },
    });
  },
  async preview(context) {
    return fogging.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

const stare: MemeTemplate = {
  info: { key: "stare_at_you", keywords: ["盯着你"], params_type: single },
  async render({ images, texts }, context) {
    if (images.length !== 1 || texts.length) throw new Error($t("templates.legacy-live-effects.text_e9660604e0"));
    const { signal } = context;
    const [source, font, emoji] = await Promise.all([
      readMemeImageSequence(images[0]!, signal), registerFont(context, true),
      registerMemeTypeface(context, "NotoColorEmoji.ttf", "LotusMemeColorEmoji"),
    ]);
    const { png } = await renderExactPng(400, 400, draw => {
      paper(draw, 400, 400);
      drawFittedText(draw, [10, 0, 150, 100], $t("templates.legacy-live-effects.text_7ca7bd55a5"), font, 12, 30, "right", "black", { wrap: false, paragraphMetrics: true });
      drawFittedText(draw, [250, 0, 390, 100], $t("templates.legacy-live-effects.text_5ad27d1bab"), `${font}, ${emoji}`, 12, 30, "left", "black", { wrap: false, paragraphMetrics: true });
    });
    const layout = await loadImage(png);
    const slots: readonly AvatarPlacement[] = [{ slot: [0, 100, 400, 300] }, { slot: [160, 20, 80, 60] }];
    return maskedImageOrGif(source, 400, 400, draw => draw.drawImage(layout, 0, 0),
      image => slots.map(slot => draw => drawAvatar(draw, image, slot, false)), signal);
  },
  async preview(context) {
    return stare.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

const shake: MemeTemplate = {
  info: { key: "shake_head", keywords: ["晃脑"], params_type: single },
  async render({ images, texts }, { signal }) {
    if (images.length !== 1 || texts.length) throw new Error($t("templates.legacy-live-effects.text_1cda4eb3e6"));
    const source = await readMemeImageSequence(images[0]!, signal);
    const first = source.frames[0];
    const padX = Math.floor(first.width / 10), padY = Math.floor(first.height / 10);
    const width = first.width - 2 * padX, height = first.height - 2 * padY;
    const jitterX = Math.max(1, Math.floor(padX / 8)), jitterY = Math.max(1, Math.floor(padY / 8));
    const frameCount = 20, delayMs = 20;
    const frames = alignMemeLoop(source, frameCount, delayMs).map(({ overlay, image }) => {
      const phi = -2 * Math.PI * overlay / frameCount;
      const x = Math.round(padX * Math.sin(phi) - padX + (2 * Math.random() - 1) * jitterX);
      const y = Math.round(padY * Math.cos(phi) - padY + (2 * Math.random() - 1) * jitterY);
      return { value: { image, x, y }, delayMs };
    });
    return renderPythonGif({ width, height, frames, signal,
      async renderFrame({ image, x, y }, w, h) {
        const rgba = await renderMaskedRgba(w, h, empty, [scaleDraw(draw => draw.drawImage(image, x, y), w / width, h / height)], signal);
        for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
        return rgba;
      },
    });
  },
  async preview(context) {
    return shake.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const legacyLiveMemeTemplates = [fogging, stare, shake] as const;
