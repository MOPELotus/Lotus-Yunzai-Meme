// Original layouts from MemeCrafters/meme-generator at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import { randomInt } from "node:crypto";
import { Canvas, ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { drawFittedText, previewImage, registerFont, registerMemeTypeface, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence } from "./transforms.ts";

const imageOnly = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };
const previewNames = ["刘一", "陈二", "张三", "李四", "王五", "赵六", "孙七", "周八", "吴九", "郑十"];
const askWidth = 640;
const askGradientHeight = 150;
const asciiWidth = 150;
const asciiFontSize = 15;
// Consolas at 15 px in the original renderer. Keep its grid when using an open typeface.
const asciiAdvance = 8.2470703125;
const asciiLineHeight = 18;
const asciiBaseline = 12.421875;
const asciiRamp = `@@$$&B88QMMGW##EE93SPPDOOU**==()+^,"--''.  `;
const maxRasterSide = 8192;

function scalePaint(scale: number, draw: Draw): Draw {
  return canvas => {
    canvas.scale(scale, scale);
    canvas.imageSmoothingQuality = "high";
    draw(canvas);
  };
}

async function renderAsk(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (input.images.length !== 1 || input.texts.length > 1) throw new MemeTemplateFeedback("该表情需要一张图片和至多一段文字。");
  const possibleUser: unknown = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
  const user = possibleUser && typeof possibleUser === "object" ? possibleUser as { name?: unknown; gender?: unknown } : undefined;
  const name = input.texts[0] ?? (typeof user?.name === "string" ? user.name : "");
  if (!name) throw new MemeTemplateFeedback("文字或昵称数量不足。");
  const pronoun = user?.gender === "male" ? "他" : "她";
  const { signal } = context;
  const [source, regular, bold] = await Promise.all([
    readMemeFirstImage(input.images[0]!, signal), registerFont(context), registerFont(context, true),
  ]);
  const photoHeight = Math.floor(source.height * askWidth / source.width);
  if (photoHeight < 1 || photoHeight + 160 > maxRasterSide) throw new MemeTemplateFeedback("表情原图长宽比超限。");
  const captionTop = photoHeight - askGradientHeight;
  const orange = "#ffa500";
  const dimmed = await renderMaskedRaster(askWidth, photoHeight,
    scalePaint(1, canvas => canvas.drawImage(source, 0, 0, askWidth, photoHeight)),
    [canvas => {
      const gradient = canvas.createLinearGradient(0, captionTop, 0, photoHeight);
      // The old image pastes the gradient using its own alpha, then softens the edge.
      for (let i = 0; i <= 8; i++) {
        const position = i / 8;
        const alpha = (220 - position * 190) / 255;
        gradient.addColorStop(position, `rgba(0, 0, 0, ${alpha * alpha})`);
      }
      canvas.filter = "blur(3px)";
      canvas.fillStyle = gradient;
      canvas.fillRect(0, captionTop, askWidth, askGradientHeight);
    }], signal);
  const backdrop = await loadImage(dimmed);
  const { png } = await renderExactPng(askWidth, photoHeight, canvas => {
    canvas.drawImage(backdrop, 0, 0);
    canvas.font = `28px ${bold}`;
    canvas.textBaseline = "alphabetic";
    const second = `${name}不知道哦。`;
    const firstMetrics = canvas.measureText(name), secondMetrics = canvas.measureText(second);
    const firstLine = firstMetrics.lines[0]!, secondLine = secondMetrics.lines[0]!;
    const height = Math.round(firstLine.descent - firstLine.ascent);
    const top = captionTop + 5;
    canvas.fillStyle = orange;
    canvas.fillText(name, 60 + Math.floor((secondMetrics.width - firstMetrics.width) / 2), top - firstLine.ascent);
    canvas.fillRect(20, top + height + 5, Math.floor(secondMetrics.width + 80), 2);
    canvas.fillStyle = "white";
    canvas.fillText(second, 60, top + height + 10 - secondLine.ascent);
  });
  const photo = await loadImage(png);
  const { width, height, scale } = rgbaFrameDimensions(askWidth + 60, photoHeight + 160);
  return renderMaskedRaster(width, height, scalePaint(scale, canvas => {
    canvas.fillStyle = "white";
    canvas.fillRect(0, 0, askWidth + 60, photoHeight + 160);
    const options = { wrap: false, paragraphMetrics: true };
    drawFittedText(canvas, [30, 0, 670, 80], `让${name}告诉你吧`, regular, 12, 35, "left", "black", options);
    drawFittedText(canvas, [30, photoHeight + 80, 670, photoHeight + 160],
      `啊这，${pronoun}说不知道`, regular, 12, 35, "left", "black", options);
  }), [scalePaint(scale, canvas => canvas.drawImage(photo, 30, 80))], signal);
}

async function greyscale(source: Image, rows: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const height = Math.floor(source.height * asciiWidth / source.width);
  const { rgba } = await renderRgba(asciiWidth, height, scalePaint(1, canvas =>
    canvas.drawImage(source, 0, 0, asciiWidth, height)));
  for (let i = 0; i < rgba.length; i += 4) {
    // This is the old Pillow's RGBA-to-L conversion, before the vertical resampling.
    const grey = (rgba[i]! * 19_595 + rgba[i + 1]! * 38_470 + rgba[i + 2]! * 7_471 + 32_768) >>> 16;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = grey;
    rgba[i + 3] = 255;
  }
  const pixels = new ImageData(new Uint8ClampedArray(rgba), asciiWidth, height);
  const { png } = await renderExactPng(asciiWidth, height, canvas => canvas.putImageData(pixels, 0, 0));
  const greyImage = await loadImage(png);
  const { rgba: resized } = await renderRgba(asciiWidth, rows, scalePaint(1, canvas =>
    canvas.drawImage(greyImage, 0, 0, asciiWidth, rows)));
  signal.throwIfAborted();
  return resized;
}

async function renderCharpic(input: MemeTemplateInput, context: MemeTemplateContext) {
  const { signal } = context;
  const [sequence, family] = await Promise.all([
    readTransformSource(input, signal), registerMemeTypeface(context, "consola.ttf", "LotusMemeConsolas"),
  ]);
  const measure = new Canvas(1, 1).getContext("2d");
  const font = `${asciiFontSize}px ${family}`;
  measure.font = font;
  const widthScale = asciiAdvance / measure.measureText("@").width;
  const source = sequence.frames[0];
  const height = Math.floor(source.height * asciiWidth / source.width);
  const rows = Math.round(height * asciiAdvance / asciiLineHeight);
  const outputWidth = Math.ceil(asciiWidth * asciiAdvance);
  const outputHeight = asciiLineHeight * rows;
  if (!rows || outputHeight > maxRasterSide) throw new MemeTemplateFeedback("表情原图长宽比超限。");
  return renderTransformSequence(sequence, outputWidth, outputHeight, async (canvas, picture) => {
    const greys = await greyscale(picture, rows, signal);
    canvas.font = font;
    canvas.textBaseline = "alphabetic";
    canvas.fillStyle = "black";
    canvas.scale(widthScale, 1);
    for (let row = 0; row < rows; row++) {
      let text = "";
      for (let column = 0; column < asciiWidth; column++) {
        const grey = greys[(row * asciiWidth + column) * 4]!;
        text += grey ? asciiRamp[Math.floor(asciiRamp.length * grey / 256)]! : " ";
      }
      canvas.fillText(text, 0, row * asciiLineHeight + asciiBaseline);
    }
  }, signal);
}

export const legacyPortraitEffectTemplates: readonly MemeTemplate[] = [
  {
    info: { key: "ask", keywords: ["问问"], params_type: { ...imageOnly, max_texts: 1 } },
    render: renderAsk,
    preview: async context => renderAsk({
      images: [await previewImage(context.signal)], texts: [previewNames[randomInt(previewNames.length)]!], args: {},
    }, context),
  },
  {
    info: { key: "charpic", keywords: ["字符画"], params_type: imageOnly },
    render: renderCharpic,
    preview: async context => renderCharpic({ images: [await previewImage(context.signal)], texts: [], args: {} }, context),
  },
];
