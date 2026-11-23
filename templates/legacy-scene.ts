// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { jpg, paper } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

const imageOnly = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };

function cropAvatar(
  draw: CanvasRenderingContext2D, image: Image, left: number, top: number, width: number, height: number,
) {
  const ratio = Math.max(width / image.width, height / image.height);
  const scaledWidth = Math.max(width, Math.trunc(image.width * ratio));
  const scaledHeight = Math.max(height, Math.trunc(image.height * ratio));
  draw.save();
  draw.beginPath();
  draw.rect(left, top, width, height);
  draw.clip();
  draw.imageSmoothingQuality = "high";
  draw.drawImage(image, left + Math.trunc((width - scaledWidth) / 2),
    top, scaledWidth, scaledHeight);
  draw.restore();
}

async function painter(input: MemeTemplateInput, context: MemeTemplateContext) {
  if (input.images.length !== 1) throw new Error("小画家需要一张图片。");
  const [image, frame] = await Promise.all([
    readMemeFirstImage(input.images[0]!, context.signal),
    context.imageAsset("painter/0.png").then(loadImage),
  ]);
  return jpg(frame.width, frame.height, draw => {
    paper(draw, frame.width, frame.height);
    cropAvatar(draw, image, 125, 91, 240, 345);
    draw.drawImage(frame, 0, 0);
  }, context.signal);
}

async function addChaos(input: MemeTemplateInput, context: MemeTemplateContext) {
  const [sequence, banner] = await Promise.all([
    readTransformSource(input, context.signal),
    context.imageAsset("add_chaos/0.png").then(loadImage),
  ]);
  const source = sequence.frames[0];
  const width = 240;
  const height = Math.max(1, Math.floor(source.height * width / source.width));
  return renderTransformSequence(sequence, width, height, (draw, image) => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, 0, 0, width, height);
    // The old paste replaces RGBA pixels, including the transparent part of the banner.
    draw.clearRect(0, 0, banner.width, banner.height);
    draw.drawImage(banner, 0, 0);
    if (sequence.frames.length === 1) {
      draw.globalCompositeOperation = "destination-over";
      draw.fillStyle = "white";
      draw.fillRect(0, 0, width, height);
    }
  }, context.signal);
}

export const legacySceneMemeTemplates: readonly MemeTemplate[] = [
  { key: "painter", keywords: ["小画家"], tags: ["米哈游", "崩坏3", "格蕾修"], render: painter },
  { key: "add_chaos", keywords: ["添乱", "给社会添乱"], render: addChaos },
].map(({ key, keywords, tags, render }) => ({
  info: { key, keywords, tags, params_type: imageOnly },
  render,
  async preview(context) {
    return render(await transformPreviewInput(context), context);
  },
}));
