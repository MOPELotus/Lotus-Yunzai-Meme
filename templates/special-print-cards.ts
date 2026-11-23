import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { drawFittedText, registerFont, registerMemeTypeface, rotateExpanded, type Draw } from "./template-layout.ts";

const source = "python/meme_generator/memes/";
const image = (context: MemeTemplateContext, key: string, name: string) =>
  context.imageAsset(source + key + "/images/" + name).then(loadImage);

async function png(width: number, height: number, signal: AbortSignal, draw: Draw) {
  signal.throwIfAborted();
  const { png: bytes } = await renderExactPng(width, height, draw);
  signal.throwIfAborted();
  return bytes;
}

function localCertificateDate(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !value.trim()) return now;
  const date = value.trim();
  const relativeOffsets: Readonly<Record<string, number>> = {
    "前天": -2, "昨天": -1, "今天": 0, "明天": 1, "后天": 2, "後天": 2,
    yesterday: -1, today: 0, tomorrow: 1,
  };
  const normalized = date.toLowerCase();
  const offset = Object.hasOwn(relativeOffsets, normalized) ? relativeOffsets[normalized] : undefined;
  if (offset !== undefined) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const full = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|号)?$/u.exec(date);
  const short = /^(\d{1,2})月(\d{1,2})(?:日|号)?$/u.exec(date);
  if (full || short) {
    const year = full ? Number(full[1]) : now.getFullYear();
    const month = Number(full?.[2] ?? short?.[1]);
    const day = Number(full?.[3] ?? short?.[2]);
    const result = new Date(now.getTime());
    result.setFullYear(year, month - 1, day);
    return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : now;
  }
  const builtIn = new Date(date);
  return Number.isNaN(builtIn.getTime()) ? now : builtIn;
}

const certificateDefault = ["小王", "优秀学生", "一年一班"];
const certificateIntroduction = "　　在本学年第一学期中表现优秀，被我校决定评为";

async function certificate({ texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
  const [background, family] = await Promise.all([
    image(context, "certificate", "0.png"), registerFont(context),
  ]);
  const date = localCertificateDate(args.time);
  const names = [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ] as const;
  return png(background.width, background.height, context.signal, draw => {
    draw.drawImage(background, 0, 0);
    drawFittedText(draw, [340, 660, 770, 800], texts[0] ?? certificateDefault[0]!, family, 20, 80, "center", "#000", { wrap: false, paragraphMetrics: true });
    drawFittedText(draw, [565, 1040, 2100, 1320], texts[1] ?? certificateDefault[1]!, family, 60, 120, "center", "#f00", { paragraphMetrics: true });
    drawFittedText(draw, [1500, 1400, 2020, 1520], texts[2] ?? certificateDefault[2]!, family, 20, 60, "center", "#000", { wrap: false, paragraphMetrics: true });
    drawFittedText(draw, [450, 850, 2270, 1082], texts[3] ?? certificateIntroduction, family, 40, 80, "left", "#000", { vertical: "top", paragraphMetrics: true });
    drawFittedText(draw, [1565, 1525, 1700, 1600], names[0], family, 40, 60, "center", "#000", { wrap: false, paragraphMetrics: true });
    drawFittedText(draw, [1752, 1525, 1816, 1600], names[1], family, 40, 60, "center", "#000", { wrap: false, paragraphMetrics: true });
    drawFittedText(draw, [1865, 1525, 1930, 1600], names[2], family, 40, 60, "center", "#000", { wrap: false, paragraphMetrics: true });
  });
}

const yeshuDefault = ["椰子特产在海南", "正宗", "椰树", "29年", "坚持在海南岛", "用新鲜椰子肉", "鲜榨", "不用椰浆\n不加香精当生榨"];

async function yeshu({ texts }: MemeTemplateInput, context: MemeTemplateContext) {
  const family = await registerFont(context, true);
  const width = 600, height = 1200;
  const yellow = "#feef50", blue = "#0021fc", red = "#fd0000";
  return png(width, height, context.signal, draw => {
    function block(x: number, top: number, bottom: number, color: string, radius = 0) {
      draw.fillStyle = color;
      draw.beginPath();
      draw.roundRect(x, top, width - 2 * x, bottom - top, radius);
      draw.fill();
    }

    function phrase(index: number, left: number, top: number, bottom: number, min: number, max: number, color: string, outline = false, wrap = false) {
      drawFittedText(draw, [left, top, width - left, bottom], texts[index] ?? yeshuDefault[index]!, family, min, max, "center", color, {
        wrap, stroke: outline ? ["#000", 0.025] : undefined, paragraphMetrics: true,
      });
    }

    block(0, 0, 1200, yellow);
    block(4, 4, 1196, "#000");
    block(28, 16, 1000, yellow);
    block(34, 88, 999, "#000");
    block(36, 90, 997, blue);
    phrase(0, 36, 16, 88, 40, 70, "#000");
    phrase(1, 36, 90, 170, 40, 70, "#fff");
    phrase(3, 36, 390, 590, 100, 200, "#fff", true);
    phrase(4, 36, 580, 660, 40, 70, yellow);
    phrase(6, 36, 740, 1000, 150, 250, yellow, true);
    block(38, 170, 403, yellow, 30);
    block(41, 173, 400, red, 28);
    phrase(2, 51, 158, 400, 100, 230, "#fff");
    block(32, 668, 760, red, 5);
    block(36, 672, 756, yellow, 1);
    phrase(5, 36, 667, 756, 50, 100, red);
    block(10, 1000, 1188, yellow, 8);
    block(12, 1002, 1186, red, 6);
    phrase(7, 22, 992, 1186, 50, 180, "#fff", false, true);
  });
}

async function pandaDragonFigure({ texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
  const [background, family] = await Promise.all([
    image(context, "panda_dragon_figure", "0.png"), registerFont(context),
  ]);
  return png(background.width, background.height, context.signal, draw => {
    draw.drawImage(background, 0, 0);
    drawFittedText(draw, [0, 470, 470, 550], String(args.name || "责怪龙"), family, 20, 60, "center", "#fff", { wrap: false, paragraphMetrics: true });
    drawFittedText(draw, [0, 0, 550, 120], texts[0] ?? "我要玩原神", family, 20, 100, "center", "#000", { paragraphMetrics: true });
  });
}

async function atriPillow({ texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
  const yes = args.mode === "yes" || (args.mode !== "no" && Math.random() < 0.5);
  const [background, border, family] = await Promise.all([
    image(context, "atri_pillow", yes ? "yes.png" : "no.png"),
    image(context, "atri_pillow", "border.png"),
    registerMemeTypeface(context, "LXGWWenKaiLite-Regular.ttf", "LotusMemeWenKai"),
  ]);
  const color = yes ? "#f00" : "#0050ff";
  const label = await png(300, 150, context.signal, draw => {
    drawFittedText(draw, [20, 20, 280, 130], texts[0] ?? "ATRI", family, 30, 120, "center", color,
      { paragraphMetrics: true, stroke: [color, 0.025] });
  }).then(bytes => loadImage(bytes));
  return png(background.width, background.height, context.signal, draw => {
    draw.drawImage(background, 0, 0);
    draw.save();
    draw.translate(302, 288);
    rotateExpanded(draw, 300, 150, -4);
    draw.globalAlpha = 80 / 255;
    draw.drawImage(label, 0, 0);
    draw.restore();
    draw.drawImage(border, 0, 416);
  });
}

async function kokonaSeal({ texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
  const requested = Number(args.number ?? 0);
  if (!Number.isInteger(requested) || requested < 0 || requested > 12) {
    throw new MemeTemplateFeedback("图片编号错误，请选择 1~12");
  }
  const number = requested || (1 + Math.floor(Math.random() * 12));
  const [background, family] = await Promise.all([
    image(context, "kokona_seal", number + ".png"),
    registerMemeTypeface(context, "LXGWWenKaiLite-Regular.ttf", "LotusMemeWenKai"),
  ]);
  return png(background.width, background.height, context.signal, draw => {
    draw.drawImage(background, 0, 0);
    draw.save();
    draw.translate(75, 25);
    rotateExpanded(draw, 320, 155, 16);
    drawFittedText(draw, [10, 10, 310, 145], texts[0] ?? "满分", family, 50, 150, "left", "#fe0000",
      { wrap: false, paragraphMetrics: true, blockAlignment: "center", stroke: ["#fe0000", 0.018] });
    draw.restore();
  });
}

function textOption(name: string, names: readonly string[], help: string, type: "string" | "integer" = "string") {
  return {
    args_model: {
      type: "object",
      properties: { [name]: { type, default: type === "string" ? "" : 0, description: help } },
    },
    parser_options: [{ names, args: [{ name, value: type === "string" ? "str" : "int" }], help_text: help }],
  };
}

const pillowMode = {
  args_model: {
    type: "object",
    properties: { mode: { type: "string", default: "random", description: "yes or no", enum: ["yes", "no", "random"] } },
  },
  args_examples: [{ mode: "yes" }, { mode: "no" }],
  parser_options: [
    { names: ["-y", "--yes"], dest: "mode", action: { type: 0, value: "yes" } },
    { names: ["-n", "--no"], dest: "mode", action: { type: 0, value: "no" } },
  ],
};

function printCard(info: Omit<MemeTemplate["info"], "params_type">, render: MemeTemplate["render"],
  defaultText: readonly string[], argsType: unknown = null, maximumText = defaultText.length): MemeTemplate {
  return {
    info: { ...info, params_type: {
      min_images: 0, max_images: 0, min_texts: defaultText.length, max_texts: maximumText, default_texts: defaultText, args_type: argsType,
    } },
    render,
    preview: context => render({ images: [], texts: defaultText, args: {} }, context),
  };
}

export const specialPrintCardTemplates: readonly MemeTemplate[] = [
  printCard({ key: "certificate", keywords: ["奖状", "证书"] }, certificate, certificateDefault, textOption("time", ["-t", "--time"], "指定时间"), 4),
  printCard({ key: "yeshu", keywords: ["椰树椰汁"] }, yeshu, yeshuDefault),
  printCard({ key: "panda_dragon_figure", keywords: ["熊猫龙图"], shortcuts: [
    { key: "(?P<name>\\S{1,10})龙[\\s:：]+(?P<text>\\S+)", args: ["--name", "{name}龙", "{text}"], humanized: "xx龙：xx" },
  ] }, pandaDragonFigure, ["我要玩原神"], textOption("name", ["-n", "--name"], "龙图名字")),
  printCard({ key: "atri_pillow", keywords: ["亚托莉枕头"], tags: ["ATRI", "亚托莉", "萝卜子"] }, atriPillow, ["ATRI"], pillowMode),
  printCard({ key: "kokona_seal", keywords: ["心奈印章"], tags: ["春原心奈", "碧蓝档案", "春原心菜", "蔚蓝档案"] }, kokonaSeal, ["满分"],
    textOption("number", ["-n", "--number"], "图片编号，范围为 1~12", "integer")),
];
