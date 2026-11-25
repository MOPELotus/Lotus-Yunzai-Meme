import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original coordinates and static JPEG output from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { jpg, previewImage, type Draw } from "./template-layout.ts";

interface Placement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly expand?: true;
  readonly alignTop?: true;
}

interface RotatedTemplate {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly placements: readonly Placement[];
}

const specs: readonly RotatedTemplate[] = [
  { key: "back_to_work", keywords: ["继续干活", "打工人"], placements: [
    { x: 56, y: 32, width: 220, height: 310, angle: 25, expand: true, alignTop: true },
  ] },
  { key: "overtime", keywords: ["加班"], placements: [
    { x: 165, y: 220, width: 250, height: 250, angle: -25, expand: true },
  ] },
  { key: "paint", keywords: ["这像画吗"], placements: [
    { x: 95, y: 107, width: 117, height: 135, angle: 4, expand: true },
  ] },
  { key: "why_at_me", keywords: ["为什么@我"], tags: ["东方Project"], placements: [
    { x: 42, y: 13, width: 265, height: 265, angle: 19 },
  ] },
  { key: "potato", keywords: ["土豆"], placements: [
    { x: 531, y: 15, width: 458, height: 458, angle: -5 },
  ] },
  { key: "rip_angrily", keywords: ["怒撕"], placements: [
    { x: 18, y: 170, width: 105, height: 105, angle: -24, expand: true },
    { x: 163, y: 65, width: 105, height: 105, angle: 24, expand: true },
  ] },
];

function expandedSide(side: number, radius: number) {
  // Pillow rounds each transformed edge independently around the original center.
  return Math.ceil(side / 2 + radius) - Math.floor(side / 2 - radius);
}

function rotatedPhoto(image: Image, { x, y, width, height, angle, expand, alignTop }: Placement): Draw {
  const ratio = Math.max(width / image.width, height / image.height);
  const imageWidth = Math.max(width, Math.trunc(image.width * ratio));
  const imageHeight = Math.max(height, Math.trunc(image.height * ratio));
  const radians = -angle * Math.PI / 180;
  const c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  const rotatedWidth = expand ? expandedSide(width, (c * width + s * height) / 2) : width;
  const rotatedHeight = expand ? expandedSide(height, (s * width + c * height) / 2) : height;
  return draw => {
    draw.save();
    draw.beginPath();
    draw.rect(x, y, rotatedWidth, rotatedHeight);
    draw.clip();
    draw.translate(x + rotatedWidth / 2, y + rotatedHeight / 2);
    draw.rotate(radians);
    draw.translate(-width / 2, -height / 2);
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, Math.trunc((width - imageWidth) / 2), alignTop ? 0 : Math.trunc((height - imageHeight) / 2), imageWidth, imageHeight);
    draw.restore();
  };
}

function template({ key, keywords, tags, placements }: RotatedTemplate): MemeTemplate {
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length) throw new Error($t("templates.rotated-insets.text_2646e324ad"));
    const { signal } = context;
    const [photo, original] = await Promise.all([
      readMemeFirstImage(images[0]!, signal), context.imageAsset(`${key}/0.png`).then(loadImage),
    ]);
    const { width, height } = original;
    let artwork = original;
    for (const [index, placement] of placements.entries()) {
      const previous = artwork;
      const masked = await renderMaskedRaster(width, height, rotatedPhoto(photo, placement), [draw => draw.drawImage(previous, 0, 0)],
        signal, { whiteBackground: index === placements.length - 1 });
      artwork = await loadImage(masked);
    }
    return jpg(width, height, draw => draw.drawImage(artwork, 0, 0), signal);
  }
  return {
    info: { key, keywords, tags, params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const rotatedInsetMemeTemplates = specs.map(template);
