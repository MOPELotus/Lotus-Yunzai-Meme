import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// The legacy catalog exposes only the line mode. Geometry, texture and seven
// mode choices come from anyliew/meme_emoji at 0734d49fb5a650a6232f7a0ae15712c1fbce0e77.
// The source credits itorr/one-last-image and su226/IdhagnBot.
import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderPng, renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, rgbaFrameDimensions } from "./template-layout.ts";

const modeHelp = $t("templates.louvre.text_72f641bd63");
const gradientColors = [
  [0, "#fbba30"], [0.4, "#fc7235"], [0.6, "#fc354e"], [0.7, "#cf36df"], [0.8, "#37b5d9"], [1, "#3eb6da"],
] as const;
const embossKernel = [1, 1, 1, 1, 1, -1, -1, -1, -1] as const;

function clampByte(value: number) {
  return Math.min(255, Math.max(0, value));
}

function gray(rgba: Uint8Array) {
  const result = new Uint8Array(rgba.length / 4);
  for (let i = 0, channel = 0; i < result.length; i++, channel += 4) {
    result[i] = Math.round(rgba[channel]! * 0.299 + rgba[channel + 1]! * 0.587 + rgba[channel + 2]! * 0.114);
  }
  return result;
}

function reflect(point: number, limit: number) {
  if (limit === 1) return 0;
  const period = 2 * (limit - 1);
  const remainder = (point % period + period) % period;
  return Math.min(remainder, period - remainder);
}

function extend(point: number, limit: number) {
  return Math.min(limit - 1, Math.max(0, point));
}

function boxBlur(input: Uint8Array, width: number, height: number, radius: number, pillow: boolean) {
  const horizontal = new Uint16Array(input.length);
  const blurred = new Uint8Array(input.length);
  const edge = pillow ? extend : reflect;
  const length = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) sum += input[row + edge(dx, width)]!;
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = pillow ? Math.round(sum / length) : sum;
      sum += input[row + edge(x + radius + 1, width)]! - input[row + edge(x - radius, width)]!;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) sum += horizontal[edge(dy, height) * width + x]!;
    for (let y = 0; y < height; y++) {
      blurred[y * width + x] = Math.round(sum / (pillow ? length : length ** 2));
      sum += horizontal[edge(y + radius + 1, height) * width + x]! - horizontal[edge(y - radius, height) * width + x]!;
    }
  }
  return blurred;
}

function denoise(input: Uint8Array, width: number, height: number) {
  const result = input.slice();
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = y * width + x;
      let sum = 0;
      for (let row = center - width; row <= center + width; row += width) {
        sum += input[row - 1]! + input[row]! + input[row + 1]!;
      }
      result[center] = Math.round(sum / 9);
    }
  }
  return result;
}

function emboss(input: Uint8Array, width: number, height: number) {
  const result = new Uint8Array(input.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let luminance = 0;
      for (let i = 0; i < embossKernel.length; i++) {
        const sample = reflect(y + Math.floor(i / 3) - 1, height) * width + reflect(x + i % 3 - 1, width);
        luminance += input[sample]! * embossKernel[i]!;
      }
      result[y * width + x] = clampByte(luminance);
    }
  }
  return result;
}

async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (input.images.length !== 1 || input.texts.length) throw new MemeTemplateFeedback($t("templates.louvre.text_455cc162ff"));
  const selectedMode = input.args.number ?? 0;
  if (typeof selectedMode !== "number" || !Number.isInteger(selectedMode) || selectedMode < 0 || selectedMode > 7) {
    throw new MemeTemplateFeedback($t("templates.louvre.text_e84d89e311"));
  }
  const mode = selectedMode || 1 + Math.floor(Math.random() * 7);
  const { signal } = context;
  const [sequence, texture] = await Promise.all([
    readMemeImageSequence(input.images[0]!, signal),
    context.imageAsset("anyliew/emoji/louvre/images/pencil-texture.jpg").then(loadImage),
  ]);
  const { width, height } = sequence.frames[0];
  const [textured, colored] = await Promise.all([
    renderRgba(width, height, draw => {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(texture, 0, 0, width, height);
    }),
    renderRgba(width, height, draw => {
      const fill = draw.createLinearGradient(0, 0, width, height);
      for (const [stop, color] of gradientColors) fill.addColorStop(stop, color);
      draw.fillStyle = fill;
      draw.fillRect(0, 0, width, height);
    }),
  ]);
  const paper = gray(textured.rgba);
  async function drawSketch(photo: Image) {
    signal.throwIfAborted();
    const original = await renderRgba(width, height, draw => {
      draw.fillStyle = "white";
      draw.fillRect(0, 0, width, height);
      draw.drawImage(photo, 0, 0);
    });
    const pixels = gray(original.rgba);
    const tone = boxBlur(pixels.map(value => value > 120 ? 0 : 255), width, height, 3, true);
    const clean = denoise(pixels, width, height);
    const filtered = mode === 6 ? emboss(clean, width, height) : boxBlur(clean, width, height, mode === 7 ? 2 : mode + 1, false);
    const output = original.rgba;
    for (let i = 0, c = 0; i < clean.length; i++, c += 4) {
      const difference = clampByte(clean[i]! - filtered[i]! + 128);
      const line = 255 - Math.trunc(clampByte((difference - 118) * 255 / 9));
      const shaded = Math.floor(Math.floor(tone[i]! * (255 - paper[i]!) / 255) * 108 / 255);
      const mask = Math.max(line, shaded);
      const textureOn = paper[i]! < 155;
      for (let channel = c; channel < c + 3; channel++) {
        const color = Math.round(255 - (255 - colored.rgba[channel]!) * mask / 255);
        output[channel] = textureOn ? Math.round(color - Math.min(20, color) * 40 / 255) : color;
      }
      output[c + 3] = 255;
    }
    signal.throwIfAborted();
    return output;
  }

  if (sequence.frames.length === 1) {
    const data = new ImageData(new Uint8ClampedArray(await drawSketch(sequence.frames[0])), width, height);
    const image = await loadImage((await renderExactPng(width, height, draw => draw.putImageData(data, 0, 0))).png);
    return (await renderPng(width, height, draw => draw.drawImage(image, 0, 0))).png;
  }

  const raster = rgbaFrameDimensions(width, height);
  return renderPythonGif({
    ...raster, signal,
    frames: sequence.frames.map(value => ({ value, delayMs: Math.floor(sequence.averageDelayMs / 10) * 10 })),
    async renderFrame(photo, outputWidth, outputHeight) {
      const data = await drawSketch(photo);
      if (width === outputWidth && height === outputHeight) return data;
      const pixels = new ImageData(new Uint8ClampedArray(data), width, height);
      const native = await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0));
      const image = await loadImage(native.png);
      return (await renderRgba(outputWidth, outputHeight, draw => draw.drawImage(image, 0, 0, outputWidth, outputHeight))).rgba;
    },
  });
}

export const louvreMemeTemplate: MemeTemplate = {
  info: { key: "louvre", keywords: ["卢浮宫"], params_type: {
    min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [],
    args_type: {
      args_model: { properties: { number: { type: "integer", default: 0, description: modeHelp } } },
      args_examples: [],
      parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: modeHelp }],
    },
  } },
  render,
  async preview(context) {
    return render({ images: [await previewImage(context.signal)], texts: [], args: { number: 1 } }, context);
  },
};
