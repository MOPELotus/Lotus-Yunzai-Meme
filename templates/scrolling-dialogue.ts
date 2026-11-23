// Conversation and scrolling layouts from the fixed MemeCrafters v0.1.14 templates.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { randomInt } from "node:crypto";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { Canvas, loadImage, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { encodeMemeGifStream, MemeGifByteLimitError } from "./gif.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { paper, previewImage, registerFont, type Draw } from "./template-layout.ts";

function paragraph(text: string, font: string, size: number, wrapWidth?: number, color = "black") {
  const measure = new Canvas(1, 1).getContext("2d");
  measure.textWrap = true;
  measure.font = `${size}px ${font}`;
  const lines = measure.measureText(text, wrapWidth).lines;
  const ascent = lines[0]?.ascent ?? 0;
  const descent = lines.at(-1)?.descent ?? 0;
  const width = Math.max(1, Math.ceil(Math.max(...lines.map(line => line.width), 0)));
  const height = Math.max(1, Math.round(descent - ascent));
  return {
    width, height,
    at(x: number, y: number): Draw {
      return draw => {
        draw.save();
        draw.textWrap = true;
        draw.textAlign = "left";
        draw.textBaseline = "alphabetic";
        draw.font = `${size}px ${font}`;
        draw.fillStyle = color;
        draw.fillText(text, x, y - ascent, wrapWidth);
        draw.restore();
      };
    },
  };
}

function roundAvatar(image: Image, x: number, y: number, size: number): Draw {
  const side = Math.min(image.width, image.height);
  const left = Math.floor((image.width - side) / 2), top = Math.floor((image.height - side) / 2);
  return draw => {
    draw.save();
    draw.beginPath();
    draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    draw.clip();
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, left, top, side, side, x, y, size, size);
    draw.restore();
  };
}

const randomNames = ["刘一", "陈二", "张三", "李四", "王五", "赵六", "孙七", "周八", "吴九", "郑十"];
const repeatText = "救命啊";

const repeat: MemeTemplate = {
  info: { key: "repeat", keywords: ["复读"], params_type: {
    min_images: 1, max_images: 5, min_texts: 1, max_texts: 1, default_texts: [repeatText], args_type: null,
  } },
  async render({ images, texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
    if (!images.length || images.length > 5 || texts.length !== 1) throw new Error("复读需要一至五张图片和一段文字。");
    const { signal } = context;
    const [avatars, inputBox, font] = await Promise.all([
      Promise.all(images.map(image => readMemeFirstImage(image, signal))),
      context.imageAsset("repeat/0.jpg").then(loadImage), registerFont(context),
    ]);
    const content = paragraph(texts[0]!, font, 50);
    if (content.width > 900) throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
    const users: unknown[] = Array.isArray(args.user_infos) ? args.user_infos : [];
    const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const clockText = paragraph(clock, font, 40, undefined, "gray");
    const names = avatars.map((_image, index) => {
      const user = users[index];
      const name = user && typeof user === "object" && "name" in user && typeof user.name === "string" ? user.name : randomNames[randomInt(randomNames.length)]!;
      return paragraph(name, font, 40);
    });
    const width = 1079, height = 1192;
    const { png } = await renderExactPng(width, 1000, draw => {
      draw.fillStyle = "#f8f9fb";
      draw.fillRect(0, 0, width, 1000);
      for (let index = 0; index < 5; index++) {
        const user = index % avatars.length;
        const y = index * 200;
        roundAvatar(avatars[user]!, 50, y + 50, 100)(draw);
        const name = names[user]!;
        name.at(175, y + 45)(draw);
        clockText.at(200 + name.width, y + 50)(draw);
        content.at(175, y + 100)(draw);
      }
    });
    const rows = await loadImage(png);
    const footerAvatar = roundAvatar(avatars[0]!, 15, 1040, 75);
    const frames = Array.from({ length: 50 }, (_, value) => ({ value, delayMs: 80 }));
    function drawFrame(index: number, draw: Parameters<Draw>[0]) {
      const offset = 20 * index;
      paper(draw, width, height);
      draw.drawImage(rows, 0, -offset);
      draw.drawImage(rows, 0, 1000 - offset);
      draw.drawImage(inputBox, 0, 1000);
      footerAvatar(draw);
    }
    async function* originalFrames() {
      for (const frame of frames) {
        signal.throwIfAborted();
        const { rgba } = await renderRgba(width, height, draw => drawFrame(frame.value, draw));
        yield { rgba, delayMs: frame.delayMs };
      }
    }
    try {
      return await encodeMemeGifStream(width, height, frames.length, originalFrames(), signal);
    } catch (error) {
      if (!(error instanceof MemeGifByteLimitError)) throw error;
      return renderPythonCanvasGif({ width, height, signal, frames, drawFrame });
    }
  },
  async preview(context) {
    const image = await previewImage(context.signal);
    return repeat.render({ images: [image], texts: [repeatText], args: { user_infos: [{ name: "群友" }] } }, context);
  },
};

const scrollText = "你们说话啊";
const scroll: MemeTemplate = {
  info: { key: "scroll", keywords: ["滚屏"], params_type: {
    min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [scrollText], args_type: null,
  } },
  async render({ images, texts }, context) {
    if (images.length || texts.length !== 1) throw new Error("滚屏需要一段文字。");
    const { signal } = context;
    const [font, corners] = await Promise.all([
      registerFont(context), Promise.all([1, 2, 3, 4].map(i => context.imageAsset(`scroll/corner${i}.png`).then(loadImage))),
    ]);
    const caption = paragraph(texts[0]!, font, 40, 600);
    if (caption.height > 200) throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
    const width = caption.width + 140;
    const boxHeight = Math.max(caption.height + 103, 150);
    const height = boxHeight * 4;
    const { png } = await renderExactPng(width, boxHeight, draw => {
      draw.fillStyle = "#eaedf4";
      draw.fillRect(0, 0, width, boxHeight);
      draw.drawImage(corners[0]!, 0, 0);
      draw.drawImage(corners[1]!, 0, boxHeight - 75);
      draw.drawImage(corners[2]!, caption.width + 70, 0);
      draw.drawImage(corners[3]!, caption.width + 70, boxHeight - 75);
      draw.fillStyle = "white";
      draw.fillRect(70, 20, caption.width, boxHeight - 40);
      draw.fillRect(27, 75, caption.width + 88, boxHeight - 150);
      caption.at(70, 17 + Math.floor((boxHeight - 40 - caption.height) / 2))(draw);
    });
    const box = await loadImage(png);
    const step = Math.floor(height / 30);
    return renderPythonCanvasGif({
      width, height, signal, frames: Array.from({ length: 30 }, (_, value) => ({ value, delayMs: 50 })),
      drawFrame(index, draw) {
        const y = -(step * index % boxHeight);
        for (let row = 0; row < 5; row++) draw.drawImage(box, 0, y + row * boxHeight);
      },
    });
  },
  preview: context => scroll.render({ images: [], texts: [scrollText], args: {} }, context),
};

export const scrollingDialogueMemeTemplates = [repeat, scroll] as const;
