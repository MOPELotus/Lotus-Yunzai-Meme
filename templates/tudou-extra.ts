import { Canvas, loadImage } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate } from "../builtin-template.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { drawFittedText, jpg, registerMemeTypeface, rgbaFrameDimensions } from "./template-layout.ts";
import { createTudouComposition } from "./tudou-layered-animations.ts";
import { tudouExtraCompositions } from "./tudou-extra-specs.ts";

const assetRoot = "python/meme_generator/memes";

function captionTemplate(key: string, keyword: string, defaultText: string, render: MemeTemplate["render"]): MemeTemplate {
  return {
    info: { key, keywords: [keyword], params_type: {
      min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [defaultText], args_type: null,
    } },
    render,
    preview: context => render({ images: [], texts: [defaultText], args: {} }, context),
  };
}

const chishi = captionTemplate("chishi", "吃屎", "输入文字", async ({ texts }, context) => {
  const { signal } = context;
  const [font, ...art] = await Promise.all([
    registerMemeTypeface(context, "FZSJ-QINGCRJ.ttf", "LotusMemeWenKai"),
    ...Array.from({ length: 4 }, (_, i) => context.imageAsset(`${assetRoot}/chishi/tudou/${i}.png`).then(loadImage)),
  ]);
  const first = art[0]!;
  return renderPythonCanvasGif({
    ...rgbaFrameDimensions(first.width, first.height), signal,
    frames: art.map(value => ({ value, delayMs: 40 })),
    drawFrame: (image, draw) => {
      draw.drawImage(image, 0, 0);
      drawFittedText(draw, [216, 75, 717, 281], texts[0]!, font, 50, 200, "center", "white", {
        wrap: true, stroke: ["black", 0.08], paragraphMetrics: true,
      });
    },
  });
});

const handwriting = captionTemplate("fontqu_smile", "手写", "你好，世界！", async ({ texts }, context) => {
  const [image, font] = await Promise.all([
    context.imageAsset(`${assetRoot}/fontqu_smile/tudou/0.jpg`).then(loadImage),
    registerMemeTypeface(context, "FZSJ-QINGCRJ.ttf", "LotusMemeWenKai"),
  ]);
  if (!texts[0]) throw new MemeTemplateFeedback("该表情需要一段文字。");
  const text = [...texts[0]].slice(0, 500).join("");
  const measure = new Canvas(1, 1).getContext("2d");
  measure.font = `200px ${font}`;
  measure.textWrap = true;
  const metrics = measure.measureText(text, 2360);
  const first = metrics.lines[0];
  const width = 2000, height = 1800, angle = -17 * Math.PI / 180;
  const left = Math.floor((width - width * Math.cos(angle) - height * Math.abs(Math.sin(angle))) / 2);
  const top = Math.floor((height - width * Math.abs(Math.sin(angle)) - height * Math.cos(angle)) / 2);
  return jpg(image.width, image.height, draw => {
    draw.drawImage(image, 0, 0);
    if (!first) return;
    draw.translate(580 + width / 2 - left, 500 + height / 2 - top);
    draw.rotate(angle);
    draw.translate(-width / 2, -height / 2);
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.font = measure.font;
    draw.fillStyle = "black";
    draw.textWrap = true;
    draw.textAlign = "left";
    draw.textBaseline = "alphabetic";
    draw.fillText(text, 0, -first.ascent, 2360);
  }, context.signal);
});

export const tudouExtraTemplates = [
  ...tudouExtraCompositions.map(spec => createTudouComposition(spec)),
  chishi,
  handwriting,
];
