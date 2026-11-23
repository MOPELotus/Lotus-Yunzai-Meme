import { loadImage, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate } from "../builtin-template.ts";
import { layoutMemeText } from "./bbcode-text.ts";
import { jpg, registerFont, registerMemeTypeface, type Draw } from "./template-layout.ts";

type DrawContext = Parameters<Draw>[0];
const cornerPath = "python/meme_generator/memes/youtube/images/corner.png";

function mirroredCorner(draw: DrawContext, art: Image, [left, top]: readonly [number, number],
  width: number, height: number, flipX: boolean, flipY: boolean) {
  draw.save();
  draw.translate(left + (flipX ? width : 0), top + (flipY ? height : 0));
  draw.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  draw.drawImage(art, 0, 0, width, height);
  draw.restore();
}

function wordmark(youtube: boolean): MemeTemplate {
  const defaults = youtube ? ["Porn", "Hub"] : ["You", "Tube"];
  const colors = youtube ? ["#fff", "#e62117", "#000", "#fff"] : ["#000", "#f79817", "#fff", "#000"];
  const template: MemeTemplate = {
    info: {
      key: youtube ? "youtube" : "pornhub", keywords: youtube ? ["yt", "youtube"] : ["ph", "pornhub"],
      params_type: { min_images: 0, max_images: 0, min_texts: 2, max_texts: 2, default_texts: defaults, args_type: null },
    },
    async render({ texts }, context) {
      if (texts.length !== 2) throw new MemeTemplateFeedback("该表情需要 2 段文字。");
      const [regular, bold, cjk, boldCjk, corner] = await Promise.all([
        registerMemeTypeface(context, "LiberationSans-Regular.ttf", "LotusMemeLiberationSans"),
        registerMemeTypeface(context, "LiberationSans-Bold.ttf", "LotusMemeLiberationSansBold"),
        registerFont(context),
        registerFont(context, true),
        youtube ? context.imageAsset(cornerPath).then(loadImage) : undefined,
      ]);
      const [background, badge, leftColor, rightColor] = colors;
      const layout = (text: string, color: string, useBold: boolean) => layoutMemeText(text.split(/\r\n|\r|\n/u)
        .map(line => ({ alignment: "left", spans: [{ text: line, color, bold: useBold, size: 200 }] })),
        undefined, { regular, bold, cjk, boldCjk });
      const left = layout(texts[0]!, leftColor!, false), right = layout(texts[1]!, rightColor!, true);
      const leftPadding = youtube ? 30 : 20;
      const rightPadding = youtube ? 50 : 20;
      const topPadding = youtube ? 20 : 10;
      const leftWidth = left.width + 2 * leftPadding;
      const rightWidth = Math.max(right.width + 2 * rightPadding, youtube ? 400 : 0);
      const rightHeight = right.height + 2 * topPadding;
      const height = Math.max(left.height, right.height) + 2 * topPadding + 100;
      const width = leftWidth + rightWidth + 100;
      const x = leftWidth + 50;
      const y = height - rightHeight - 50;
      return jpg(width, height, draw => {
        draw.fillStyle = background!;
        draw.fillRect(0, 0, width, height);
        left.draw(draw, 50 + leftPadding, height - 50 - topPadding - left.height);
        if (corner) {
          const cornerHeight = Math.floor(rightHeight / 2);
          const cornerWidth = Math.floor(corner.width * rightHeight / 2 / corner.height);
          for (const flipX of [false, true]) for (const flipY of [false, true]) {
            mirroredCorner(draw, corner, [flipX ? width - cornerWidth - 50 : x, flipY ? height - cornerHeight - 49 : y - 1],
              cornerWidth, cornerHeight, flipX, flipY);
          }
        }
        draw.beginPath();
        draw.roundRect(x, y, rightWidth, rightHeight, corner ? Math.floor(rightHeight / 2) : 20);
        draw.fillStyle = badge!;
        draw.fill();
        right.draw(draw, x + Math.floor((rightWidth - right.width) / 2), y + topPadding);
      }, context.signal);
    },
    preview: context => template.render({ images: [], texts: defaults, args: {} }, context),
  };
  return template;
}

export const legacyWordmarkTemplates = [wordmark(false), wordmark(true)] as const;
