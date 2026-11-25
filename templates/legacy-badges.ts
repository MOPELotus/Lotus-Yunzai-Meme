import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original layouts from MemeCrafters/meme-generator at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import { Canvas, loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, registerMemeTypeface, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

const red = "#e60012";
const outline = "#500000";
const fontSize = 650;
const aceDefault = $t("templates.legacy-badges.text_ada8d90ad4");
const mihoyoSize = 500;
const oldLogo = "python/meme_generator/memes/mihoyo/images/logo.png";

interface Glyph {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
}

function artworkAt(image: Image, x: number, y: number): Draw {
  return canvas => canvas.drawImage(image, x, y);
}

function rounded(value: number) {
  const floor = Math.floor(value);
  return value - floor === 0.5 && floor % 2 === 0 ? floor : Math.round(value);
}

function scaledDraw(scale: number, paint: Draw): Draw {
  return canvas => {
    canvas.scale(scale, scale);
    canvas.imageSmoothingQuality = "high";
    paint(canvas);
  };
}

async function renderGlyph(glyph: Glyph, font: string, signal: AbortSignal) {
  if (!glyph.width || !glyph.height) return undefined;
  const { text, width, height, baseline } = glyph;
  const { png } = await renderExactPng(width + 25, height + 40, canvas => {
    canvas.font = font;
    canvas.textBaseline = "alphabetic";
    canvas.lineJoin = "round";
    canvas.strokeStyle = outline;
    for (const [x, y, stroke, fill] of [[5, 20, 20, outline], [0, 0, 8, red]] as const) {
      canvas.save();
      canvas.beginPath();
      canvas.rect(x, y, width, height);
      canvas.clip();
      canvas.lineWidth = stroke;
      canvas.fillStyle = fill;
      canvas.strokeText(text, x, baseline + y);
      canvas.fillText(text, x, baseline + y);
      canvas.restore();
    }
  });
  signal.throwIfAborted();
  return loadImage(png);
}

async function combineGlyphs(glyphs: readonly Glyph[], font: string, signal: AbortSignal) {
  const overlap = (advance: number) => rounded(advance * 0.4);
  const advances = glyphs.map(glyph => glyph.width + 25);
  const width = advances.reduce((sum, advance, i) => sum + advance - (i ? overlap(advance) : 0), 0);
  const height = Math.max(...glyphs.map(glyph => glyph.height + 40));
  const layers: Draw[] = [];
  let x = 0;
  for (const [i, glyph] of glyphs.entries()) {
    signal.throwIfAborted();
    const image = await renderGlyph(glyph, font, signal);
    if (image) layers.push(artworkAt(image, x, rounded((height - image.height) / 2)));
    x += advances[i]! - overlap(advances[i]!);
  }
  const png = await renderMaskedRaster(width, height, () => {}, layers, signal);
  return loadImage(png);
}

function rotatedText(image: Image, width: number, height: number, left: number, top: number): Draw {
  return canvas => {
    canvas.translate(left + width / 2, top + height / 2);
    canvas.rotate(-Math.PI / 18);
    canvas.drawImage(image, -image.width / 2, -image.height / 2);
  };
}

function expandedLength(length: number, other: number) {
  const extent = length * Math.cos(Math.PI / 18) + other * Math.sin(Math.PI / 18);
  return Math.ceil((length + extent) / 2) - Math.floor((length - extent) / 2);
}

async function aceTextLayer(glyphs: readonly Glyph[], font: string, targetWidth: number | undefined,
    shrink: number, signal: AbortSignal) {
  let image = await combineGlyphs(glyphs, font, signal);
  if (targetWidth || shrink !== 1) {
    const width = targetWidth ?? rounded(image.width * shrink);
    const height = targetWidth ? rounded(targetWidth / image.width * image.height) : rounded(image.height * shrink);
    const { png } = await renderExactPng(width, height, scaledDraw(1, canvas => canvas.drawImage(image, 0, 0, width, height)));
    signal.throwIfAborted();
    image = await loadImage(png);
  }
  return { image, width: expandedLength(image.width, image.height), height: expandedLength(image.height, image.width) };
}

async function renderAce(input: MemeTemplateInput, context: MemeTemplateContext) {
  const { signal } = context;
  const text = input.texts[0];
  if (input.images.length || input.texts.length !== 1 || !text) throw new MemeTemplateFeedback($t("templates.legacy-badges.text_bd6df69715"));
  const family = await registerMemeTypeface(context, "PangMenZhengDao-Cu.ttf", "LotusMemePangMen");
  const font = `${fontSize}px "${family}", "Noto Sans CJK SC", "Noto Color Emoji"`;
  const measure = new Canvas(1, 1).getContext("2d");
  measure.font = font;
  const glyphs: Glyph[] = [];
  let totalWidth = 0;
  for (const char of text) {
    const metrics = measure.measureText(char);
    const line = metrics.lines[0];
    const baseline = -(line?.ascent ?? 0);
    const height = Math.ceil(baseline + (line?.descent ?? 0));
    const width = Math.ceil(metrics.width);
    totalWidth += width + 25;
    if (totalWidth > 4000) throw new MemeTemplateFeedback($t("templates.legacy-badges.text_002fc2fab2"));
    glyphs.push({ text: char, width, height, baseline });
  }
  const [bubble, mark] = await Promise.all([
    context.imageAsset("ace_attorney_dialog/bubble.png").then(loadImage),
    context.imageAsset("ace_attorney_dialog/mark.png").then(loadImage),
  ]);
  const layers: Draw[] = [];
  if (totalWidth <= 2000) {
    const { image, width, height } = await aceTextLayer(glyphs, font, totalWidth > 900 ? 900 : undefined, 1, signal);
    layers.push(rotatedText(image, width, height, rounded((bubble.width - width) / 2), rounded((bubble.height - height) / 2)),
      artworkAt(mark, 630, 230));
  } else {
    const middle = Math.ceil(glyphs.length / 2);
    const first = await aceTextLayer(glyphs.slice(0, middle), font, undefined, 0.6, signal);
    const second = await aceTextLayer(glyphs.slice(middle), font, undefined, 0.6, signal);
    layers.push(
      rotatedText(first.image, first.width, first.height, rounded((bubble.width - first.width) / 2) - 50, 775 - first.height),
      rotatedText(second.image, second.width, second.height, rounded((bubble.width - second.width) / 2) + 50, 325),
      artworkAt(mark, 680, 320),
    );
  }
  const { width, height, scale } = rgbaFrameDimensions(bubble.width, bubble.height);
  return renderMaskedRaster(width, height, scaledDraw(scale, artworkAt(bubble, 0, 0)), layers.map(draw => scaledDraw(scale, draw)), signal);
}

async function renderMihoyo(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (input.images.length !== 1 || input.texts.length) throw new MemeTemplateFeedback($t("templates.legacy-badges.text_2646e324ad"));
  const { signal } = context;
  const [sequence, logo] = await Promise.all([
    readMemeImageSequence(input.images[0]!, signal), context.imageAsset(oldLogo).then(loadImage),
  ]);
  const logoWidth = Math.floor(logo.width * 50 / logo.height);
  function paints(photo: Image, scale: number) {
    const ratio = mihoyoSize / Math.min(photo.width, photo.height);
    const photoWidth = Math.floor(photo.width * ratio), photoHeight = Math.floor(photo.height * ratio);
    const base = scaledDraw(scale, canvas => canvas.drawImage(photo,
      Math.trunc((mihoyoSize - photoWidth) / 2), Math.trunc((mihoyoSize - photoHeight) / 2), photoWidth, photoHeight));
    const layers = [
      scaledDraw(scale, canvas => {
        canvas.fillStyle = "rgba(53,49,65,0.9019607843)";
        canvas.fillRect(0, 440, mihoyoSize, 60);
      }),
      scaledDraw(scale, canvas => canvas.drawImage(logo, Math.floor((mihoyoSize - logoWidth) / 2), 445, logoWidth, 50)),
    ];
    const clip = scaledDraw(scale, canvas => {
      canvas.beginPath();
      canvas.roundRect(0, 0, mihoyoSize, mihoyoSize, 100);
      canvas.fill();
    });
    return { base, layers, clip };
  }
  const { width, height, scale } = rgbaFrameDimensions(mihoyoSize, mihoyoSize);
  if (sequence.frames.length === 1) {
    const { base, layers, clip } = paints(sequence.frames[0], scale);
    return renderMaskedRaster(width, height, base, layers, signal, { clip });
  }
  return renderPythonGif({
    width, height, signal,
    frames: sequence.frames.map(value => ({ value, delayMs: Math.floor(sequence.averageDelayMs / 10) * 10 })),
    renderFrame(photo, rasterWidth, rasterHeight) {
      const { base, layers, clip } = paints(photo, rasterWidth / mihoyoSize);
      return renderMaskedRgba(rasterWidth, rasterHeight, base, layers, signal, { clip });
    },
  });
}

export const legacyBadgeTemplates: readonly MemeTemplate[] = [
  {
    info: {
      key: "ace_attorney_dialog", keywords: ["逆转裁判气泡"],
      params_type: { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [aceDefault], args_type: null },
    },
    render: renderAce,
    preview: context => renderAce({ images: [], texts: [aceDefault], args: {} }, context),
  },
  {
    info: {
      key: "mihoyo", keywords: ["米哈游"],
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
    },
    render: renderMihoyo,
    preview: async context => renderMihoyo({ images: [await previewImage(context.signal)], texts: [], args: {} }, context),
  },
];
