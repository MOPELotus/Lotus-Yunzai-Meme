import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { drawFittedText, jpg, previewImage, registerFont } from "./template-layout.ts";

// Py-Contrib operator_generator at 8547f2e5718bfbb3328d700fe2c21d2ec5962500.
const panelNames = ["range", "characteristic", "value", "talent", "skill", "special"] as const;
const tileWidth = 320;
const tileCount = 25;

async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
  const { signal } = context;
  const name = input.texts[0] ?? "你好";
  const [avatar, font, tiles] = await Promise.all([
    readMemeFirstImage(input.images[0]!, signal),
    registerFont(context, true),
    Promise.all(panelNames.map(async panel => {
      const index = String(Math.floor(Math.random() * tileCount)).padStart(2, "0");
      const image = await loadImage(await context.imageAsset(`operator_generator/${panel}/${index}.jpg`));
      signal.throwIfAborted();
      const halfWidth = tileWidth * 2;
      const halfHeight = Math.trunc(halfWidth * image.height / image.width);
      const height = Math.trunc(tileWidth * image.height / image.width);
      // Reducing in two steps keeps the original fine pattern from aliasing in the 320 px tile.
      const { png } = await renderExactPng(halfWidth, halfHeight, draw => {
        draw.imageSmoothingQuality = "high";
        draw.drawImage(image, 0, 0, halfWidth, halfHeight);
      });
      return { image: await loadImage(png), height };
    })),
  ]);
  const png = await renderMaskedRaster(640, 640, draw => {
    draw.imageSmoothingQuality = "high";
    draw.fillStyle = "#a0a0a0";
    draw.fillRect(0, 0, 640, 640);
    drawFittedText(draw, [120, 0, 620, 100], `${name}，你的干员信息如下：`, font, 30, 80, "center", "white",
      { stroke: ["black", 0.1], paragraphMetrics: true });
    for (const [index, { image, height }] of tiles.entries()) {
      const x = (index % 2) * tileWidth;
      const y = 100 + Math.floor(index / 2) * 180;
      draw.drawImage(image, x, y, tileWidth, height);
    }
  }, [draw => {
    draw.beginPath();
    draw.arc(60, 50, 40, 0, Math.PI * 2);
    draw.clip();
    drawAvatar(draw, avatar, { slot: [20, 10, 80, 80], fit: "square" }, false);
  }], signal, { whiteBackground: true });
  const image = await loadImage(png);
  return jpg(640, 640, draw => draw.drawImage(image, 0, 0), signal);
}

export const operatorGenerator: MemeTemplate = {
  info: {
    key: "operator_generator",
    keywords: ["合成大干员"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [], args_type: null },
  },
  render,
  async preview(context) {
    return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};
