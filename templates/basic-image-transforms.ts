// Visual layout and parameters follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/f5ee44f6a3e134b9ac54032f97eab788d6454e3c/meme_generator/memes
import { loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { drawFittedText, paper, registerFont } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

const numberHelp = "像素化大小，默认为 10";
const upsideCaption = "我看你们是反了！";
const width = 500;
const captionHeight = 80;
const singleImage = { min_images: 1, max_images: 1, min_texts: 0 } as const;
const nearestTieOffset = 1 / 128;

async function renderPixelate(input: MemeTemplateInput, context: MemeTemplateContext) {
  const { signal } = context;
  const sequence = await readTransformSource(input, signal);
  const first = sequence.frames[0];
  const { width, height } = first;
  const size = input.args.number ?? 10;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size >= Math.min(width, height)) {
    throw new Error("请输入合适的像素化大小。");
  }
  let source = sequence;
  if (size !== 1) {
    const sampleWidth = Math.floor(width / size), sampleHeight = Math.floor(height / size);
    const images: Image[] = [];
    for (const image of sequence.frames) {
      signal.throwIfAborted();
      const rendered = await renderExactPng(sampleWidth, sampleHeight, canvas => {
        canvas.imageSmoothingEnabled = false;
        canvas.drawImage(image, -nearestTieOffset, -nearestTieOffset, sampleWidth, sampleHeight);
      });
      images.push(await loadImage(rendered.png));
    }
    source = { ...sequence, frames: [images[0]!, ...images.slice(1)] };
  }
  return renderTransformSequence(source, width, height, (target, image) => {
    target.imageSmoothingEnabled = false;
    // Pillow nearest samples at the pixel center, choosing the higher sample at exact ties.
    const offset = size === 1 ? 0 : nearestTieOffset;
    target.drawImage(image, -offset, -offset, width, height);
  }, signal);
}

async function renderUpsideDown(input: MemeTemplateInput, context: MemeTemplateContext) {
  const sequence = await readTransformSource(input, context.signal);
  const first = sequence.frames[0];
  const imageHeight = Math.floor(first.height * width / first.width);
  if (imageHeight < 1) throw new Error("图片太扁，无法生成表情。");
  const height = imageHeight + captionHeight;
  const font = await registerFont(context);
  return renderTransformSequence(sequence, width, height, (canvas, image) => {
    paper(canvas, width, height);
    drawFittedText(canvas, [20, 0, width - 20, captionHeight], input.texts[0] ?? upsideCaption, font, 30, 55);
    canvas.save();
    canvas.translate(width, height);
    canvas.scale(-1, -1);
    canvas.drawImage(image, 0, 0, width, imageHeight);
    canvas.restore();
  }, context.signal);
}

export const basicImageMemeTemplates: readonly MemeTemplate[] = [
  {
    info: {
      key: "pixelate", keywords: ["像素化"],
      params_type: { ...singleImage, max_texts: 0, default_texts: [], args_type: {
        args_model: { properties: { number: { type: "integer", default: 10, description: numberHelp } } },
        parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: numberHelp }],
      } },
    },
    render: renderPixelate,
    preview: async context => renderPixelate(await transformPreviewInput(context), context),
  },
  {
    info: { key: "upside_down", keywords: ["反了"], params_type: { ...singleImage, max_texts: 1, default_texts: [upsideCaption] } },
    render: renderUpsideDown,
    preview: async context => renderUpsideDown(await transformPreviewInput(context), context),
  },
];
