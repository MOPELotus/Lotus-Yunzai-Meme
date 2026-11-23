import { randomInt } from "node:crypto";
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { nativeImageRasterScale, renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { drawFittedText, firstImage, jpg, paper, previewImage, registerFont, rgbaFrame, type Draw } from "./template-layout.ts";

const colors = ["red", "darkorange", "gold", "darkgreen", "blue", "cyan", "purple"] as const;

function drawContained(context: CanvasRenderingContext2D, image: Image, left: number, top: number) {
  // Upstream resizes into a transparent 350×400 canvas before pasting.
  const scale = Math.min(350 / image.width, 400 / image.height);
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));
  context.drawImage(image, left + Math.floor((350 - width) / 2), top + Math.floor((400 - height) / 2), width, height);
}

async function always(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (input.images.length !== 1) throw new Error("一直需要一张图片。");
  const signal = context.signal;
  const [sequence, font] = await Promise.all([readMemeImageSequence(input.images[0]!, signal), registerFont(context)]);
  const mode = input.args.mode === "circle" || input.args.mode === "loop" ? input.args.mode : "normal";
  const source = sequence.frames[0];
  const ratio = source.height / source.width;
  const big = Math.max(1, Math.floor(500 * ratio));
  const small = Math.max(1, Math.floor(100 * ratio));
  const lower = mode === "normal" ? Math.max(small, 80) : Math.max(small + Math.floor(20 * ratio) + 10, 80);
  const height = big + lower + (mode === "normal" ? 10 : 0);
  if (height > 8192) throw new RangeError("表情尺寸超限。");
  const frame = (image: Image, thumbnail: boolean): Draw => context => {
    paper(context, 500, height);
    context.drawImage(image, 0, 0, 500, big);
    if (thumbnail) {
      context.drawImage(image, 290, big + 5 + Math.floor((lower - small) / 2), 100, small);
    }
    const top = big + (thumbnail ? 5 : 0);
    const bottom = height - (thumbnail ? 5 : 0);
    drawFittedText(context, [thumbnail ? 20 : 0, top, 280, bottom], "要我一直", font, 20, 60, "right");
    drawFittedText(context, [400, top, thumbnail ? 480 : 500, bottom], "吗", font, 20, 60, "left");
  };
  const animation = mode === "loop" ? alignMemeLoop(sequence, 20, 100) :
    sequence.frames.map(image => ({ overlay: 0, image }));
  const bases = new Map<Image, Image>();
  async function draw(image: Image, overlay: number): Promise<Draw> {
    if (mode === "normal") return frame(image, true);
    let base = bases.get(image);
    if (!base) {
      base = await loadImage((await renderExactPng(500, height, frame(image, false))).png);
      bases.set(image, base);
    }
    const layer = base;
    return context => {
      paper(context, 500, height);
      let scale = 5 ** (overlay / 20);
      for (let depth = 0; depth < 4; depth++) {
        context.drawImage(layer, Math.round(358 * (1 - scale)), Math.round(height * (1 - scale)),
          Math.max(1, Math.round(500 * scale)), Math.max(1, Math.round(height * scale)));
        scale /= 5;
      }
    };
  }
  if (animation.length === 1) return jpg(500, height, await draw(animation[0]!.image, 0), signal);
  const scale = nativeImageRasterScale() / 4;
  assertMemeGifDimensions(Math.ceil(500 * scale), Math.ceil(height * scale), animation.length);
  const delayMs = mode === "loop" ? 100 : sequence.averageDelayMs;
  const frames = [];
  let size: { width: number; height: number } | undefined;
  for (const { image, overlay } of animation) {
    const raster = await rgbaFrame(500, height, await draw(image, overlay), signal);
    size ??= { width: raster.width, height: raster.height };
    frames.push({ rgba: raster.rgba, delayMs });
  }
  return encodeMemeGif(size!.width, size!.height, frames, signal);
}

async function alwaysLike(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (!input.images.length || input.images.length > 6) throw new Error("我永远喜欢需要一至六张图片。");
  const rawNames = Array.isArray(input.args.user_infos) ? input.args.user_infos : [];
  const names = [...input.texts, ...rawNames.flatMap(value => typeof value?.name === "string" ? [value.name] : [""])];
  if (names.length < input.images.length) throw new Error("文字或昵称数量不足。");
  const [frame, images, font, regular] = await Promise.all([
    context.imageAsset("always_like/0.png").then(loadImage),
    Promise.all(input.images.map(file => firstImage(file, context.signal))),
    registerFont(context, true),
    registerFont(context),
  ]);
  const extras = images.slice(1).map((image, index) => ({
    image, left: 10 + randomInt(51), top: 20 + randomInt(71), y: 400 - index * 70, name: names[index + 1]!,
    line: colors[randomInt(colors.length)]!,
  }));
  const headline = "我永远喜欢" + names[0];
  const underline = colors[randomInt(colors.length)]!;
  return jpg(frame.width, frame.height, canvas => {
    paper(canvas, frame.width, frame.height);
    canvas.drawImage(frame, 0, 0);
    drawContained(canvas, images[0]!, 25, 35);
    drawFittedText(canvas, [20, 470, frame.width - 20, 570], headline, font, 30, 70);
    function length(text: string) {
      canvas.font = `70px ${regular}`;
      return canvas.measureText(text).width;
    }
    function under(x: number, y: number, width: number, color: string) {
      canvas.fillStyle = color;
      canvas.fillRect(x, y - 5, width, 10);
    }
    if (extras.length) {
      const width = length(headline);
      const ratio = Math.min((frame.width - 40) / width, 1);
      const textWidth = width * ratio;
      const nameWidth = length(names[0]!) * ratio;
      under(textWidth - nameWidth + Math.floor((frame.width - textWidth) / 2), 525, nameWidth, underline);
    }
    for (const [index, extra] of extras.entries()) {
      drawContained(canvas, extra.image, extra.left, extra.top);
      drawFittedText(canvas, [400, extra.y, frame.width - 20, extra.y + 80], extra.name, font, 30, 70);
      if (index + 1 < extras.length) {
        const nameWidth = Math.min(length(extra.name), 380);
        under(400 + Math.floor((410 - nameWidth) / 2), extra.y + 40, nameWidth, extra.line);
      }
    }
  }, context.signal);
}

async function support(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (input.images.length !== 1) throw new Error("精神支柱需要一张图片。");
  const [frame, image] = await Promise.all([
    context.imageAsset("support/0.png").then(loadImage),
    firstImage(input.images[0]!, context.signal),
  ]);
  const square = Math.min(image.width, image.height);
  const left = Math.floor((image.width - square) / 2);
  const top = Math.floor((image.height - square) / 2);
  const angle = -23 * Math.PI / 180;
  const expandedCenter = Math.ceil(Math.abs(815 / 2 * Math.cos(angle)) + Math.abs(815 / 2 * Math.sin(angle)));
  return jpg(frame.width, frame.height, canvas => {
    paper(canvas, frame.width, frame.height);
    canvas.save();
    canvas.translate(-172 + expandedCenter, -17 + expandedCenter);
    canvas.rotate(angle);
    canvas.drawImage(image, left, top, square, square, -815 / 2, -815 / 2, 815, 815);
    canvas.restore();
    canvas.drawImage(frame, 0, 0);
  }, context.signal);
}

const singleImage = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [] } as const;
const modeHelp = "生成模式，包含 normal、loop、circle";
const options = {
  args_model: {
    type: "object",
    properties: { mode: { type: "string", default: "normal", description: modeHelp, enum: ["normal", "loop", "circle"] } },
  },
  args_examples: ["normal", "circle", "loop"].map(mode => ({ mode })),
  parser_options: [
    { names: ["--mode"], args: [{ name: "mode", value: "str" }], help_text: modeHelp },
    { names: ["--circle", "套娃"], dest: "mode", action: { type: 0, value: "circle" }, help_text: "套娃模式" },
    { names: ["--loop", "循环"], dest: "mode", action: { type: 0, value: "loop" }, help_text: "循环模式" },
  ],
};

function preview(render: MemeTemplate["render"], texts: readonly string[] = []) {
  return async (context: MemeTemplateContext) => render({
    images: [await previewImage(context.signal)], texts, args: {},
  }, context);
}

// Original Python templates match the installed catalog. The equivalent
// background assets and the font are resolved through the fixed resource manifest.
export const staticMemeTemplates: readonly MemeTemplate[] = [
  {
    info: {
      key: "always", keywords: ["一直"], shortcuts: [{ key: "一直一直", args: ["--loop"] }],
      params_type: { ...singleImage, args_type: options },
    },
    render: always,
    preview: preview(always),
  },
  {
    info: {
      key: "always_like", keywords: ["我永远喜欢"],
      params_type: { ...singleImage, max_images: 6, max_texts: 6, args_type: null },
    },
    render: alwaysLike,
    preview: preview(alwaysLike, ["张三"]),
  },
  { info: { key: "support", keywords: ["精神支柱"], params_type: singleImage }, render: support, preview: preview(support) },
];
