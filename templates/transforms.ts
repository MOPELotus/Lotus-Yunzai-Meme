import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Visual layout and parameters follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/f5ee44f6a3e134b9ac54032f97eab788d6454e3c/meme_generator/memes
import type { CanvasRenderingContext2D, Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { drawFittedText, jpg, previewImage, registerFont, rgbaFrameDimensions } from "./template-layout.ts";

const flatWidth = 500;
const captionHeight = 80;
const defaultCaption = $t("templates.transforms.text_d7fdb22a2d");
const flatRatioHelp = $t("templates.transforms.text_8967f82263");
const directionHelp = $t("templates.transforms.text_30a9bd7486");
const directions = [["left", $t("templates.transforms.text_e2e0c454e5")], ["right", $t("templates.transforms.text_14ab1f2bce")], ["top", $t("templates.transforms.text_db5ba671d2")], ["bottom", $t("templates.transforms.text_13c12b064b")]] as const;

type Direction = typeof directions[number][0];
type DrawFrame = (canvas: CanvasRenderingContext2D, image: Image) => void | Promise<void>;

export function readTransformSource(input: MemeTemplateInput, signal: AbortSignal) {
  if (input.images.length !== 1) throw new Error($t("templates.transforms.text_2646e324ad"));
  return readMemeImageSequence(input.images[0]!, signal);
}

export async function renderTransformSequence(sequence: MemeImageSequence, width: number, height: number, draw: DrawFrame, signal: AbortSignal) {
  if (sequence.frames.length === 1) return jpg(width, height, canvas => {
    canvas.fillStyle = "white";
    canvas.fillRect(0, 0, width, height);
    return draw(canvas, sequence.frames[0]);
  }, signal);

  const raster = rgbaFrameDimensions(width, height);
  // The old single-image animation draws each input frame once and uses the mean duration.
  const delayMs = Math.floor(sequence.averageDelayMs / 10) * 10;
  return renderPythonCanvasGif({
    ...raster, signal,
    frames: sequence.frames.map(value => ({ value, delayMs })),
    drawFrame: (frame, target) => draw(target, frame),
  });
}

export function drawHalf(ctx: CanvasRenderingContext2D, image: Image, horizontal: boolean, half: number, position: number, mirrored: boolean) {
  ctx.save();
  ctx.beginPath();
  if (horizontal) ctx.rect(position, 0, half, image.height);
  else ctx.rect(0, position, image.width, half);
  ctx.clip();
  if (mirrored) {
    // Flip the full image before cropping. The unpaired pixel still affects the flipped half.
    ctx.translate(horizontal ? image.width : 0, horizontal ? 0 : image.height);
    ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  }
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

async function renderSymmetric(input: MemeTemplateInput, context: MemeTemplateContext) {
  const direction = input.args.direction ?? "left";
  if (!directions.some(([known]) => known === direction)) throw new Error($t("templates.transforms.text_8bb8e90a97"));
  const sequence = await readTransformSource(input, context.signal);
  const { width, height } = sequence.frames[0];
  const horizontal = direction === "left" || direction === "right";
  const half = Math.floor((horizontal ? width : height) / 2);
  if (!half) throw new Error($t("templates.transforms.text_f5122dc965"));
  const original = direction === "right" || direction === "bottom" ? half : 0;
  return renderTransformSequence(sequence, horizontal ? half * 2 : width, horizontal ? height : half * 2, (canvas, image) => {
    canvas.imageSmoothingEnabled = false;
    drawHalf(canvas, image, horizontal, half, original, false);
    drawHalf(canvas, image, horizontal, half, half - original, true);
  }, context.signal);
}

async function renderLookFlat(input: MemeTemplateInput, context: MemeTemplateContext) {
  const sequence = await readTransformSource(input, context.signal);
  const { width, height } = sequence.frames[0];
  const ratio = input.args.ratio ?? 2;
  if (typeof ratio !== "number" || !Number.isSafeInteger(ratio) || ratio < 1 || ratio >= height) {
    throw new Error($t("templates.transforms.text_65cf65f049"));
  }
  const imageHeight = Math.floor(Math.floor(height * flatWidth / width) / ratio);
  if (!imageHeight) throw new Error($t("templates.transforms.text_65cf65f049"));
  const canvasHeight = imageHeight + captionHeight;
  const font = await registerFont(context, true);
  const text = input.texts[0] ?? defaultCaption;
  return renderTransformSequence(sequence, flatWidth, canvasHeight, (canvas, image) => {
    canvas.fillStyle = "white";
    canvas.fillRect(0, 0, flatWidth, canvasHeight);
    canvas.imageSmoothingQuality = "high";
    canvas.drawImage(image, 0, 0, flatWidth, imageHeight);
    drawFittedText(canvas, [10, imageHeight, flatWidth - 10, canvasHeight], text, font, 30, 55);
  }, context.signal);
}

export async function transformPreviewInput(context: MemeTemplateContext): Promise<MemeTemplateInput> {
  return { images: [await previewImage(context.signal)], texts: [], args: {} };
}

const singleInput = { min_images: 1, max_images: 1, min_texts: 0 } as const;

export const transformMemeTemplates: readonly MemeTemplate[] = [
  {
    info: {
      key: "symmetric", keywords: ["对称"],
      params_type: { ...singleInput, max_texts: 0, default_texts: [], args_type: {
        args_model: { properties: { direction: { type: "string", default: "left", enum: directions.map(([value]) => value), description: directionHelp } } },
        args_examples: directions.map(([direction]) => ({ direction })),
        parser_options: [
          { names: ["-d", "--direction"], args: [{ name: "direction", value: "str" }], help_text: directionHelp },
          ...directions.map(([value, alias]) => ({ names: [`--${value}`, alias], dest: "direction", action: { type: 0, value } })),
        ],
      } },
    },
    render: renderSymmetric,
    preview: async context => renderSymmetric(await transformPreviewInput(context), context),
  },
  {
    info: {
      key: "look_flat", keywords: ["看扁"],
      params_type: { ...singleInput, max_texts: 1, default_texts: [defaultCaption], args_type: {
        args_model: { properties: { ratio: { type: "integer", default: 2, description: flatRatioHelp } } },
        parser_options: [{ names: ["-r", "--ratio"], args: [{ name: "ratio", value: "int" }], help_text: flatRatioHelp }],
      } },
    },
    render: renderLookFlat,
    preview: async context => renderLookFlat(await transformPreviewInput(context), context),
  },
];
