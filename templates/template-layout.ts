import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Canvas, FontLibrary, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { nativeImageRasterScale, renderExactPng, renderPng, renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplateContext } from "../builtin-template.ts";

export type Draw = (context: CanvasRenderingContext2D) => void;
type Box = readonly [left: number, top: number, right: number, bottom: number];
const maxStaticPixels = 12_000_000;
const normalFont = "LotusMemeNotoRegular";
const boldFont = "LotusMemeNotoBold";
const registeredFonts = new Map<string, Promise<void>>();

export function registerFont(context: MemeTemplateContext, bold = false) {
  return registerMemeTypeface(context, bold ? "NotoSansSC-Bold.ttf" : "NotoSansSC-Regular.ttf",
    bold ? boldFont : normalFont);
}

export async function registerMemeTypeface(context: MemeTemplateContext, asset: string, family: string) {
  if (!registeredFonts.has(family)) {
    const data = context.fontAsset(asset);
    const request = (async () => {
      const bytes = await data;
      const directory = await mkdtemp(join(tmpdir(), "lotus-meme-font-"));
      try {
        const file = join(directory, "font.ttf");
        await writeFile(file, bytes, { mode: 0o600 });
        if (!FontLibrary.use(family, file).length) throw new Error("表情字体无法加载。");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    })().catch((error) => {
      registeredFonts.delete(family);
      throw error;
    });
    registeredFonts.set(family, request);
  }
  await registeredFonts.get(family);
  context.signal.throwIfAborted();
  return family;
}

export function paper(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
}

export function drawFittedText(context: CanvasRenderingContext2D, box: Box, text: string, font: string,
  minimum: number, maximum: number, alignment: "left" | "center" | "right" = "center", fill = "#000",
  { wrap = true, stroke, vertical = "center", paragraphMetrics = false }: {
    readonly wrap?: boolean;
    readonly stroke?: readonly [color: string, ratio: number];
    readonly vertical?: "top" | "center" | "bottom";
    readonly paragraphMetrics?: boolean;
  } = {}) {
  const [left, top, right, bottom] = box;
  const width = right - left, height = bottom - top;
  context.save();
  try {
    context.textAlign = alignment;
    context.textBaseline = "alphabetic";
    context.textWrap = true;
    context.fillStyle = fill;
    for (let size = maximum; size >= minimum; size--) {
      context.font = `${size}px ${font}`;
      const measuredWidth = wrap ? width : undefined;
      const metrics = context.measureText(text, measuredWidth);
      const lines = metrics.lines;
      if (!lines.length) return;
      const last = lines[lines.length - 1]!;
      const first = lines[0]!;
      const contentTop = paragraphMetrics ? first.ascent : first.y;
      const contentBottom = paragraphMetrics ? last.descent : last.y + last.height;
      const contentHeight = paragraphMetrics ? Math.round(contentBottom - contentTop) : contentBottom - contentTop;
      const contentFits = paragraphMetrics ? metrics.width <= width : lines.every(line => line.width <= width);
      if (contentHeight <= height && contentFits) {
        const x = alignment === "left" ? left : alignment === "right" ? right : (left + right) / 2;
        const limit = height - contentHeight;
        const offset = vertical === "top" ? 0 : vertical === "bottom" ? limit : limit / 2;
        const y = top + offset - contentTop;
        if (stroke) {
          context.strokeStyle = stroke[0];
          context.lineJoin = "round";
          context.lineWidth = Math.round(size * stroke[1]) * 2;
          context.strokeText(text, x, y, measuredWidth);
        }
        context.fillText(text, x, y, measuredWidth);
        return;
      }
    }
    throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
  } finally {
    context.restore();
  }
}

export async function firstImage(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!file.size || file.size > 16 * 1024 * 1024) throw new RangeError("表情图片文件太大或为空。");
  const image = await loadImage(Buffer.from(await file.arrayBuffer()));
  signal.throwIfAborted();
  if (image.width * image.height > maxStaticPixels) throw new RangeError("表情原图尺寸超限。");
  return image;
}

export async function rasterCanvas(width: number, height: number, draw: Draw, signal: AbortSignal) {
  if (width * height > maxStaticPixels || width > 8192 || height > 8192) throw new RangeError("表情尺寸超限。");
  signal.throwIfAborted();
  const rendered = await renderPng(width, height, draw);
  const image = await loadImage(rendered.png);
  signal.throwIfAborted();
  const canvas = new Canvas(image.width, image.height);
  canvas.gpu = rendered.engine.renderer === "GPU";
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}

export async function jpg(width: number, height: number, draw: Draw, signal: AbortSignal) {
  const canvas = await rasterCanvas(width, height, draw, signal);
  const content = await canvas.toBuffer("jpg", { quality: 0.75 });
  signal.throwIfAborted();
  return content;
}

export function rgbaFrameDimensions(width: number, height: number) {
  const scale = nativeImageRasterScale() / 4;
  return { width: Math.ceil(width * scale), height: Math.ceil(height * scale), scale };
}

export async function rgbaFrame(width: number, height: number, draw: Draw, signal: AbortSignal) {
  const { width: rasterWidth, height: rasterHeight, scale } = rgbaFrameDimensions(width, height);
  signal.throwIfAborted();
  const rendered = await renderRgba(rasterWidth, rasterHeight, (context) => {
    context.scale(scale, scale);
    draw(context);
  });
  signal.throwIfAborted();
  return { width: rasterWidth, height: rasterHeight, rgba: rendered.rgba };
}

export async function previewImage(signal: AbortSignal) {
  signal.throwIfAborted();
  const { png } = await renderExactPng(500, 500, (context) => {
    paper(context, 500, 500);
    context.fillStyle = "#ccc";
    for (let y = 0; y < 20; y++) {
      for (let x = y % 2; x < 20; x += 2) context.fillRect(x * 25, y * 25, 25, 25);
    }
  });
  signal.throwIfAborted();
  return new File([new Uint8Array(png)], "preview.png", { type: "image/png" });
}
