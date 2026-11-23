// Geometry and JPG/GIF selection follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { randomInt } from "node:crypto";
import { ImageData, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import type { MemeImageSequence } from "./animated-input.ts";
import { jpg, previewImage } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence } from "./transforms.ts";

interface OverlayLayout {
  readonly slot: readonly [left: number, top: number, width: number, height: number];
  readonly fit?: "contain" | "square";
  readonly whitePadding?: boolean;
  readonly art?: string;
  readonly sticker?: readonly [asset: string, left: number, top: number];
  readonly avatarAboveArt?: boolean;
  readonly replaceSlot?: boolean;
  readonly maskedStill?: boolean;
}

interface Overlay {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly layout: OverlayLayout | ((first: Image, args: MemeTemplateInput["args"]) => OverlayLayout);
  readonly grayscale?: "optional" | "always";
  readonly argsType?: unknown;
}

const blackHelp = "是否将图片变为黑白";
const blackArgs = {
  args_model: { properties: { black: { type: "boolean", default: false, description: blackHelp } } },
  parser_options: [{ names: ["--black", "黑白"], dest: "black", args: [], action: { type: 0, value: true }, help_text: blackHelp }],
};

const numberHelp = "图片编号，1-阿罗娜，2-普拉娜";
const numberArgs = {
  args_model: { properties: { number: { type: "integer", default: 0, description: numberHelp } } },
  parser_options: [{ names: ["-n", "--number"], dest: "number", args: [{ name: "number", value: "int" }], help_text: numberHelp }],
};

const overlays: readonly Overlay[] = [
  { key: "blood_pressure", keywords: ["高血压"], layout: { slot: [16, 17, 414, 450] } },
  { key: "pinch", keywords: ["捏", "捏脸"], layout: { slot: [1080, 0, 1800, 1440] } },
  { key: "think_what", keywords: ["想什么"], layout: { slot: [530, 0, 534, 493] } },
  { key: "mourning", keywords: ["上香"], layout: { slot: [645, 145, 635, 725] }, grayscale: "optional", argsType: blackArgs },
  { key: "dont_go_near", keywords: ["不要靠近"], layout: { slot: [23, 231, 170, 170], avatarAboveArt: true } },
  { key: "walnut_pad", keywords: ["胡桃平板"], tags: ["莉可丽丝", "胡桃"], layout: { slot: [368, 65, 540, 360] } },
  { key: "dinosaur", keywords: ["恐龙", "小恐龙"], layout: { slot: [294, 369, 680, 578] } },
  { key: "let_me_in", keywords: ["让我进去"], layout: { slot: [320, 0, 510, 810] } },
  { key: "your_new_years_eve", keywords: ["你的跨年"], layout: { slot: [0, 650, 586, 430], fit: "contain", whitePadding: true } },
  {
    key: "keep_your_money", keywords: ["压岁钱不要交给"], tags: ["阿罗娜", "普拉娜", "碧蓝档案", "蔚蓝档案"], argsType: numberArgs,
    layout(_image, args) {
      const number = args.number ?? 0;
      if (number !== 0 && number !== 1 && number !== 2) throw new Error("图片编号错误，请输入1或2");
      const selected = number === 0 ? randomInt(1, 3) : number;
      return { art: selected === 1 ? "arona.png" : "plana.png", slot: [0, 440, 500, 640], fit: "contain", whitePadding: true };
    },
  },
  { key: "fight_with_sunuo", keywords: ["我打宿傩", "我打宿傩吗"], tags: ["咒术回战", "两面宿傩"],
    layout: { slot: [0, 245, 565, 1630] }, grayscale: "always" },
  { key: "luotianyi_need", keywords: ["洛天依要", "天依要"], tags: ["洛天依"],
    layout: { slot: [43, 146, 195, 195], fit: "contain", avatarAboveArt: true } },
  { key: "maimai_join", keywords: ["旅行伙伴加入"], tags: ["舞萌"], layout: { slot: [50, 50, 400, 400], fit: "square", maskedStill: true } },
  { key: "need", keywords: ["需要", "你可能需要"], layout: { slot: [327, 232, 115, 115], fit: "square" } },
  { key: "taunt", keywords: ["嘲讽"], layout: { slot: [245, 245, 230, 230], fit: "square", avatarAboveArt: true, replaceSlot: true } },
  {
    key: "sekaiichi_kawaii", keywords: ["世界第一可爱"], tags: ["藤田琴音", "学园偶像大师"],
    layout(image) {
      return image.width / image.height > 1.155
        ? { slot: [45, 45, 810, 416], whitePadding: true, maskedStill: true }
        : { art: "1.png", slot: [45, 45, 585, 810], whitePadding: true, maskedStill: true };
    },
  },
  { key: "distracted", keywords: ["注意力涣散"], tags: ["明日方舟"],
    layout: { art: "1.png", slot: [0, 0, 500, 500], fit: "square", sticker: ["0.png", 140, 320], maskedStill: true } },
];

function drawAvatar(draw: CanvasRenderingContext2D, image: Image, layout: OverlayLayout, isStill: boolean) {
  const { slot: [left, top, width, height], fit, whitePadding, replaceSlot } = layout;
  draw.save();
  draw.beginPath();
  draw.rect(left, top, width, height);
  draw.clip();
  draw.imageSmoothingQuality = "high";
  if (replaceSlot) {
    if (isStill) {
      draw.fillStyle = "white";
      draw.fillRect(left, top, width, height);
    } else draw.clearRect(left, top, width, height);
  }
  if (fit === "square") {
    const square = Math.min(image.width, image.height);
    draw.drawImage(image, Math.floor((image.width - square) / 2), Math.floor((image.height - square) / 2), square, square,
      left, top, width, height);
  } else {
    const ratio = fit === "contain" ? Math.min(width / image.width, height / image.height) : Math.max(width / image.width, height / image.height);
    const scaledWidth = Math.max(fit === "contain" ? 1 : width, Math.trunc(image.width * ratio));
    const scaledHeight = Math.max(fit === "contain" ? 1 : height, Math.trunc(image.height * ratio));
    const x = left + Math.trunc((width - scaledWidth) / 2), y = top + Math.trunc((height - scaledHeight) / 2);
    if (whitePadding) {
      draw.fillStyle = "white";
      draw.fillRect(left, top, width, height);
      if (fit === "contain" && !isStill) draw.clearRect(x, y, scaledWidth, scaledHeight);
    }
    draw.drawImage(image, x, y, scaledWidth, scaledHeight);
  }
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

function pasteMask(rgba: Uint8Array, overlay: Uint8Array) {
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = overlay[i + 3]!;
    if (!alpha) continue;
    for (let channel = i; channel < i + 4; channel++) {
      rgba[channel] = Math.round((overlay[channel]! * alpha + rgba[channel]! * (255 - alpha)) / 255);
    }
  }
}

async function renderMaskedStill(image: Image, frame: Image, extra: Image | undefined, layout: OverlayLayout, signal: AbortSignal) {
  // Pillow pastes the artwork using its own alpha as a mask for all four channels.
  // Preserve that matte before flattening the static JPEG onto white.
  const { width, height } = frame;
  const [avatar, art] = await Promise.all([
    renderRgba(width, height, draw => drawAvatar(draw, image, layout, true)),
    renderRgba(width, height, draw => draw.drawImage(frame, 0, 0)),
  ]);
  const rgba = avatar.rgba;
  pasteMask(rgba, art.rgba);
  const { sticker } = layout;
  if (sticker && extra) {
    signal.throwIfAborted();
    const label = await renderRgba(width, height, draw => draw.drawImage(extra, sticker[1], sticker[2]));
    pasteMask(rgba, label.rgba);
  }
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3]!;
    for (let channel = i; channel < i + 3; channel++) {
      rgba[channel] = Math.round((rgba[channel]! * alpha) / 255 + 255 - alpha);
    }
    rgba[i + 3] = 255;
  }
  signal.throwIfAborted();
  const pixels = new ImageData(new Uint8ClampedArray(rgba), width, height);
  const { png } = await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0));
  const composed = await loadImage(png);
  return jpg(width, height, draw => draw.drawImage(composed, 0, 0), signal);
}

function overlayTemplate({ key, keywords, tags, layout: getLayout, grayscale, argsType }: Overlay): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.texts.length) throw new Error("该表情不接收文字。");
    const source = await readTransformSource(input, context.signal);
    const layout = typeof getLayout === "function" ? getLayout(source.frames[0], input.args) : getLayout;
    const { art = "0.png", sticker, avatarAboveArt } = layout;
    const [frame, extra, sequence] = await Promise.all([
      context.imageAsset(`${key}/${art}`).then(loadImage),
      sticker && context.imageAsset(`${key}/${sticker[0]}`).then(loadImage),
      prepareSequence(source, grayscale === "always" || (grayscale === "optional" && input.args.black === true), context.signal),
    ]);
    // Like the old GIF exporter, keep the animation duration and shrink oversized output.
    let width = frame.width, height = frame.height;
    const isStill = sequence.frames.length === 1;
    if (isStill && layout.maskedStill) return renderMaskedStill(sequence.frames[0], frame, extra, layout, context.signal);
    if (!isStill) {
      while (width * height * sequence.frames.length > 24_000_000) {
        width = Math.max(1, Math.floor(width * 0.9));
        height = Math.max(1, Math.floor(height * 0.9));
      }
    }
    return renderTransformSequence(sequence, width, height, (draw, image) => {
      draw.scale(width / frame.width, height / frame.height);
      if (avatarAboveArt) draw.drawImage(frame, 0, 0);
      drawAvatar(draw, image, layout, isStill);
      if (!avatarAboveArt) draw.drawImage(frame, 0, 0);
      if (sticker && extra) draw.drawImage(extra, sticker[1], sticker[2]);
    }, context.signal);
  }

  return {
    info: {
      key, keywords, tags,
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: argsType ?? null },
    },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const overlayMemeTemplates = overlays.map(overlayTemplate);
