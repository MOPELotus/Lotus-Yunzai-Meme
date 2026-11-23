// Original composition from MemeCrafters/meme-generator 619fa105 (MIT).
import type { CanvasRenderingContext2D } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { layoutMemeText, parseMemeBbcode } from "./bbcode-text.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont } from "./template-layout.ts";

import { readMemeDate } from "./meme-date.ts";

const selectLastName = (args: Readonly<Record<string, unknown>>) => {
  if (typeof args.name === "string" && args.name) return args.name;
  const data: unknown = Array.isArray(args.user_infos) ? args.user_infos.at(-1) : undefined;
  return data && typeof data === "object" && "name" in data && typeof data.name === "string" ? data.name : "";
};

const fullText = { wrap: false, paragraphMetrics: true } as const;
const hint = (name: "time" | "name", short: string, help: string) =>
  ({ names: [short, "--" + name], dest: name, args: [{ name, value: "str" }], help_text: help });

function drawDate(draw: CanvasRenderingContext2D, day: Date, font: string) {
  const text = `于[u] ${day.getFullYear()} [/u]年[u] ${day.getMonth() + 1} [/u]月[u] ${day.getDate()} [/u]日请假一天,`;
  for (let size = 50; size >= 30; size--) {
    const layout = layoutMemeText(parseMemeBbcode(text, size, "left"), undefined, { regular: font, cjk: font });
    if (layout.width <= 720 && layout.height <= 100) {
      layout.draw(draw, 40, 700 + (100 - layout.height) / 2);
      return;
    }
  }
}

export const leaveNoteTemplate: MemeTemplate = {
  info: {
    key: "note_for_leave", keywords: ["请假条"],
    params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: ["想玩原神"],
      args_type: {
        args_model: { properties: { time: { type: "string", default: "", description: "指定时间" }, name: { type: "string", default: "", description: "指定名字" } } },
        parser_options: [hint("time", "-t", "指定时间"), hint("name", "-n", "指定名字")],
      },
    },
  },
  async render({ images, texts, args }, context) {
    const [avatar, regular, bold] = await Promise.all([
      readMemeFirstImage(images[0]!, context.signal), registerFont(context), registerFont(context, true),
    ]);
    const name = selectLastName(args), day = readMemeDate(args.time);
    const label = layoutMemeText([{ alignment: "left", spans: [{ text: name, size: 50 }] }], undefined, { regular, cjk: regular });
    if (label.width > 800) throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
    const nameWidth = Math.min(450, Math.max(150, label.width)) + 50;
    const ratio = Math.min(450 / avatar.width, 400 / avatar.height);
    const width = Math.max(1, Math.floor(avatar.width * ratio)), height = Math.max(1, Math.floor(avatar.height * ratio));
    return jpg(800, 950, draw => {
      paper(draw, 800, 950);
      drawFittedText(draw, [40, 20, 760, 180], "请假条", bold, 80, 100, "center", "#000", fullText);
      drawFittedText(draw, [40, 200, 150, 290], "本人", regular, 50, 50, "left", "#000", { ...fullText, vertical: "top" });
      if (name) drawFittedText(draw, [150, 200, 150 + nameWidth, 265], name, regular, 20, 50, "center", "#000", fullText);
      draw.fillStyle = "#000";
      draw.fillRect(150, 258, nameWidth + 1, 4);
      drawFittedText(draw, [160 + nameWidth, 200, 760, 290], "因", regular, 50, 50, "left", "#000", { ...fullText, vertical: "top" });
      drawFittedText(draw, [40, 300, 285, 700], texts[0] ?? "想玩原神", regular, 40, 90, "center", "#f00", { paragraphMetrics: true });
      draw.drawImage(avatar, 300 + Math.trunc((450 - width) / 2), 290 + Math.trunc((400 - height) / 2), width, height);
      drawDate(draw, day, regular);
      drawFittedText(draw, [40, 800, 800, 950], "望领导批准！！！", bold, 75, 75, "left", "#000", { ...fullText, vertical: "top" });
    }, context.signal);
  },
  async preview(context) {
    return leaveNoteTemplate.render({ images: [await previewImage(context.signal)], texts: [], args: { name: "网友" } }, context);
  },
};
