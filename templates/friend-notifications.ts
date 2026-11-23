// Dimensions, text and shortcuts follow the fixed Python sources at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { layoutMemeText } from "./bbcode-text.ts";
import { jpg, previewImage, registerFont } from "./template-layout.ts";

const nicknameHelp = "指定名字";
const nicknameArgs = {
  args_model: { properties: { name: { type: "string", description: nicknameHelp, default: "" } } },
  parser_options: [{ names: ["-n", "--name"], args: [{ name: "name", value: "str" }], help_text: nicknameHelp }],
};
const steamShortcut = "(?P<name>\\S+)正在玩(?P<game>\\S+)";

function nickname(input: MemeTemplateInput, pick: number, defaultName: string) {
  if (typeof input.args.name === "string" && input.args.name) return input.args.name;
  const selected: unknown = Array.isArray(input.args.user_infos) ? input.args.user_infos.at(pick) : undefined;
  return selected && typeof selected === "object" && "name" in selected && typeof selected.name === "string"
    ? selected.name || defaultName : defaultName;
}

function written(text: string, size: number, font: string, color = "black", wrapWidth?: number) {
  return layoutMemeText(text.split(/\r\n?|\n/u).map(line => ({
    alignment: "left", spans: [{ text: line || " ", size, color }],
  })), wrapWidth, { regular: font, cjk: font });
}

function avatar(draw: CanvasRenderingContext2D, image: Image, x: number, y: number, size: number, circle: boolean) {
  draw.save();
  draw.imageSmoothingQuality = "high";
  draw.beginPath();
  if (circle) draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  else draw.rect(x, y, size, size);
  draw.clip();
  const scale = Math.max(size / image.width, size / image.height);
  const width = Math.trunc(image.width * scale), height = Math.trunc(image.height * scale);
  draw.drawImage(image, x + Math.floor((size - width) / 2), y + Math.floor((size - height) / 2), width, height);
  draw.restore();
}

function validate(input: MemeTemplateInput, maxTexts: number) {
  if (input.images.length !== 1 || !input.texts.length || input.texts.length > maxTexts) {
    throw new MemeTemplateFeedback("表情图片或文字数量不符合要求。");
  }
}

const steamMessage: MemeTemplate = {
  info: { key: "steam_message", keywords: ["steam消息"],
    shortcuts: [{ key: steamShortcut, args: ["--name", "{name}", "{game}"], humanized: "xx正在玩xx" }],
    params_type: { min_images: 1, max_images: 1, min_texts: 1, max_texts: 1,
      default_texts: ["黑神话：悟空"], args_type: nicknameArgs },
  },
  async render(input, context) {
    validate(input, 1);
    const { signal } = context;
    const [portrait, background, font] = await Promise.all([
      readMemeFirstImage(input.images[0]!, signal), context.imageAsset("steam_message/logo.png").then(loadImage),
      registerFont(context),
    ]);
    const name = written(nickname(input, 0, "好友"), 65, font, "#e3ffc2");
    const playing = written("正在玩", 62, font, "#d1d1c0");
    const game = written(input.texts[0]!, 65, font, "#91c257");
    const textX = 431;
    const width = textX + Math.max(name.width, playing.width, game.width, 1300) + 50;
    const height = 440;
    return jpg(width, height, draw => {
      draw.fillStyle = "#14161f";
      draw.fillRect(0, 0, width, height);
      draw.fillStyle = "#191b23";
      draw.fillRect(50, 80, 280, 280);
      avatar(draw, portrait, 50, 80, 280, false);
      draw.fillStyle = "#6cbe48";
      draw.fillRect(336, 80, 16, 281);
      draw.drawImage(background, width - 870, -370);
      name.draw(draw, textX, 120 - Math.floor(name.height / 2));
      playing.draw(draw, textX, Math.floor((height - playing.height) / 2));
      game.draw(draw, textX, height - 120 - Math.floor(game.height / 2));
    }, signal);
  },
  async preview(context) {
    return demo(steamMessage, "黑神话：悟空", context);
  },
};

const myFriend: MemeTemplate = {
  info: { key: "my_friend", keywords: ["我朋友说"], params_type: {
    min_images: 1, max_images: 1, min_texts: 1, max_texts: 10, default_texts: ["让我康康"], args_type: nicknameArgs,
  } },
  async render(input, context) {
    validate(input, 10);
    const { signal } = context;
    const [portrait, assets, font] = await Promise.all([
      readMemeFirstImage(input.images[0]!, signal),
      Promise.all(["corner1", "corner2", "corner3", "corner4", "label"].map(name =>
        context.imageAsset(`my_friend/${name}.png`).then(loadImage))),
      registerFont(context),
    ]);
    const [corner1, corner2, corner3, corner4, label] = assets as [Image, Image, Image, Image, Image];
    const name = written(nickname(input, -1, "朋友"), 25, font, "#868894");
    if (name.width >= 600) throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
    const dialogs = input.texts.map(value => {
      const text = written(value, 40, font, "black", 600);
      return { text, width: Math.max(text.width, name.width + 15) + 140, height: Math.max(text.height + 103, 150) };
    });
    const width = Math.max(...dialogs.map(dialog => dialog.width)) + 130;
    const height = dialogs.reduce((sum, dialog) => sum + dialog.height + 60, 0);
    return jpg(width, height, draw => {
      draw.fillStyle = "#eaedf4";
      draw.fillRect(0, 0, width, height);
      let y = 0;
      for (const { text, height: boxHeight } of dialogs) {
        avatar(draw, portrait, 20, y + 20, 100, true);
        const top = y + 60;
        draw.drawImage(corner1, 130, top);
        draw.drawImage(corner2, 130, top + boxHeight - 75);
        draw.drawImage(corner3, 200 + text.width, top);
        draw.drawImage(corner4, 200 + text.width, top + boxHeight - 75);
        draw.fillStyle = "white";
        draw.fillRect(200, top + 20, text.width, boxHeight - 40);
        draw.fillRect(157, top + 75, text.width + 88, boxHeight - 150);
        text.draw(draw, 200, top + 17 + Math.floor((boxHeight - 40 - text.height) / 2));
        draw.drawImage(label, 160, y + 25);
        name.draw(draw, 260, y + 22 + Math.floor((35 - name.height) / 2));
        y += boxHeight + 60;
      }
    }, signal);
  },
  async preview(context) {
    return demo(myFriend, "让我康康", context);
  },
};

async function demo(template: MemeTemplate, text: string, context: MemeTemplateContext) {
  return template.render({ images: [await previewImage(context.signal)], texts: [text], args: {} }, context);
}

export const friendNotificationMemeTemplates = [myFriend, steamMessage] as const;
