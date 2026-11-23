// Geometry and JPG/GIF selection follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import type { MemeImageSequence } from "./animated-input.ts";
import { previewImage } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence } from "./transforms.ts";

interface Overlay {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly slot: readonly [left: number, top: number, width: number, height: number];
  readonly avatarAboveArt?: boolean;
  readonly blackOption?: boolean;
}

const overlays: readonly Overlay[] = [
  { key: "blood_pressure", keywords: ["高血压"], slot: [16, 17, 414, 450] },
  { key: "pinch", keywords: ["捏", "捏脸"], slot: [1080, 0, 1800, 1440] },
  { key: "think_what", keywords: ["想什么"], slot: [530, 0, 534, 493] },
  { key: "mourning", keywords: ["上香"], slot: [645, 145, 635, 725], blackOption: true },
  { key: "dont_go_near", keywords: ["不要靠近"], slot: [23, 231, 170, 170], avatarAboveArt: true },
  { key: "walnut_pad", keywords: ["胡桃平板"], tags: ["莉可丽丝", "胡桃"], slot: [368, 65, 540, 360] },
  { key: "dinosaur", keywords: ["恐龙", "小恐龙"], slot: [294, 369, 680, 578] },
  { key: "let_me_in", keywords: ["让我进去"], slot: [320, 0, 510, 810] },
];

const blackHelp = "是否将图片变为黑白";
const blackArgs = {
  args_model: { properties: { black: { type: "boolean", default: false, description: blackHelp } } },
  parser_options: [{ names: ["--black", "黑白"], dest: "black", args: [], action: { type: 0, value: true }, help_text: blackHelp }],
};

function drawAvatar(draw: CanvasRenderingContext2D, image: Image, [left, top, width, height]: Overlay["slot"]) {
  const ratio = Math.max(width / image.width, height / image.height);
  const scaledWidth = Math.max(width, Math.trunc(image.width * ratio));
  const scaledHeight = Math.max(height, Math.trunc(image.height * ratio));
  draw.save();
  draw.beginPath();
  draw.rect(left, top, width, height);
  draw.clip();
  draw.imageSmoothingQuality = "high";
  draw.drawImage(image, left + Math.trunc((width - scaledWidth) / 2), top + Math.trunc((height - scaledHeight) / 2),
    scaledWidth, scaledHeight);
  draw.restore();
}

async function grayImage(image: Image, signal: AbortSignal) {
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

async function prepareSequence(source: MemeImageSequence, grayscale: boolean, signal: AbortSignal): Promise<MemeImageSequence> {
  const frameCount = Math.min(200, source.frames.length);
  const step = source.frames.length / frameCount;
  if (!grayscale && step === 1) return source;
  const frames: Image[] = [];
  for (let index = 0; index < frameCount; index++) {
    signal.throwIfAborted();
    const image = source.frames[Math.floor(index * step)]!;
    frames.push(grayscale ? await grayImage(image, signal) : image);
  }
  return { frames: [frames[0]!, ...frames.slice(1)], averageDelayMs: source.averageDelayMs * step };
}

function overlayTemplate(overlay: Overlay): MemeTemplate {
  const { key, keywords, tags, slot, avatarAboveArt, blackOption } = overlay;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.texts.length) throw new Error("该表情不接收文字。");
    const source = await readTransformSource(input, context.signal);
    const frame = await loadImage(await context.imageAsset(`${key}/0.png`));
    const sequence = await prepareSequence(source, Boolean(blackOption && input.args.black === true), context.signal);
    // Like the old GIF exporter, keep the animation duration and shrink oversized output.
    let width = frame.width, height = frame.height;
    if (sequence.frames.length > 1) {
      while (width * height * sequence.frames.length > 24_000_000) {
        width = Math.max(1, Math.floor(width * 0.9));
        height = Math.max(1, Math.floor(height * 0.9));
      }
    }
    return renderTransformSequence(sequence, width, height, (draw, image) => {
      draw.scale(width / frame.width, height / frame.height);
      if (avatarAboveArt) draw.drawImage(frame, 0, 0);
      drawAvatar(draw, image, slot);
      if (!avatarAboveArt) draw.drawImage(frame, 0, 0);
    }, context.signal);
  }

  return {
    info: {
      key, keywords, tags,
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: blackOption ? blackArgs : null },
    },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const overlayMemeTemplates = overlays.map(overlayTemplate);
