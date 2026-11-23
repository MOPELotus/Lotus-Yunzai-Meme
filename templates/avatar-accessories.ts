// Parameters, geometry and media formats follow the fixed Python templates at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { layoutMemeText, parseMemeBbcode } from "./bbcode-text.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection } from "./projective-transform.ts";
import { renderPythonCanvasGif, renderPythonGif } from "./python-gif.ts";
import { drawFittedText, jpg, previewImage, registerFont, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { drawHalf, readTransformSource } from "./transforms.ts";

const singleAvatar = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 } as const;
const hands = [["left", "左手"], ["right", "右手"], ["both", "双手"]] as const;
const sides = [["left", "左"], ["right", "右"], ["top", "上"], ["bottom", "下"]] as const;
const layers = [["front", "前"], ["behind", "后"]] as const;

function choiceArgs(field: string, options: readonly (readonly [string, string])[], defaultValue: string, help: string,
  flags: readonly string[]) {
  return {
    args_model: { properties: { [field]: { type: "string", default: defaultValue, enum: options.map(([value]) => value), description: help } } },
    args_examples: options.map(([value]) => ({ [field]: value })),
    parser_options: [
      { names: flags, args: [{ name: field, value: "str" }], help_text: help },
      ...options.map(([value, alias]) => ({ names: [`--${value}`, alias], dest: field, action: { type: 0, value } })),
    ],
  };
}

function select<T extends string>(value: unknown, options: readonly (readonly [T, string])[], fallback: T, help: string) {
  if (value === undefined) return fallback;
  const option = options.find(([key]) => key === value);
  if (!option) throw new MemeTemplateFeedback(help);
  return option[0];
}

function avatarTemplate(info: MemeTemplate["info"], render: MemeTemplate["render"]): MemeTemplate {
  return {
    info,
    async render(input, context) {
      if (input.images.length !== 1 || input.texts.length > info.params_type.max_texts) {
        throw new MemeTemplateFeedback("表情图片或文字数量不符合要求。");
      }
      return render(input, context);
    },
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

function drawSquare(draw: CanvasRenderingContext2D, image: Image, size: number, inside = false) {
  const ratio = (inside ? Math.min : Math.max)(size / image.width, size / image.height);
  const width = Math.max(1, Math.trunc(image.width * ratio)), height = Math.max(1, Math.trunc(image.height * ratio));
  draw.imageSmoothingQuality = "high";
  draw.drawImage(image, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
}

function drawCircle(draw: CanvasRenderingContext2D, image: Image, size: number) {
  draw.beginPath();
  draw.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  draw.clip();
  drawSquare(draw, image, size);
}

function handAccessory(key: "bubble_tea" | "gun", keyword: string, original: "left" | "right") {
  const help = `${keyword}的位置，包含 left、right、both`;
  return avatarTemplate({ key, keywords: [keyword], params_type: { ...singleAvatar,
    args_type: choiceArgs("position", hands, original, help, ["-p", "--position"]),
  } }, async ({ images, args }, context) => {
    const position = select(args.position, hands, original, help);
    const [avatar, art] = await Promise.all([
      readMemeFirstImage(images[0]!, context.signal), context.imageAsset(`${key}/0.png`).then(loadImage),
    ]);
    const drawOriginal: Draw = draw => draw.drawImage(art, 0, 0);
    const drawMirror: Draw = draw => {
      draw.translate(500, 0);
      draw.scale(-1, 1);
      draw.drawImage(art, 0, 0);
    };
    const artLayers = position === "both" ? [drawOriginal, drawMirror] : [position === original ? drawOriginal : drawMirror];
    const merged = await renderMaskedRaster(500, 500, draw => drawSquare(draw, avatar, 500), artLayers, context.signal,
      { whiteBackground: true });
    const image = await loadImage(merged);
    return jpg(500, 500, draw => draw.drawImage(image, 0, 0), context.signal);
  });
}

const clownHelp = "小丑在前/后，front/behind";
const clownProjection = screenProjection(496, 546, [[282, 0], [496, 154], [214, 546], [0, 392]]);
const clownMask = avatarTemplate({ key: "clown_mask", keywords: ["小丑面具"], params_type: { ...singleAvatar,
  args_type: choiceArgs("mode", layers, "front", clownHelp, ["--mode"]),
} }, async (input, context) => {
  const front = select(input.args.mode, layers, "front", clownHelp) === "front";
  const { signal } = context;
  const [source, art, foreground] = await Promise.all([
    readTransformSource(input, signal), context.imageAsset(front ? "clown_mask/0.png" : "clown_mask/1.png").then(loadImage),
    !front && context.imageAsset("clown_mask/2.png").then(loadImage),
  ]);
  const angle = -(front ? 15 : 6) * Math.PI / 180;
  const width = front ? 440 : 496, height = front ? 440 : 546;
  const artDraw: Draw = draw => draw.drawImage(art, 0, 0);
  function composition(avatar: Image) {
    const head: Draw = draw => {
      draw.save();
      draw.translate(front ? 16 : 214, front ? 104 : 100);
      draw.beginPath();
      draw.rect(0, 0, width, height);
      draw.clip();
      draw.translate(width / 2, height / 2);
      draw.rotate(angle);
      draw.translate(-width / 2, -height / 2);
      if (front) drawCircle(draw, avatar, width);
      else {
        draw.setTransform(draw.getTransform().multiply(clownProjection));
        draw.scale(1, height / width);
        drawCircle(draw, avatar, width);
      }
      draw.restore();
    };
    if (front) return [head, [artDraw]] as const;
    const decoration: Draw = draw => { if (foreground) draw.drawImage(foreground, -85, 20); };
    return [artDraw, [head, decoration]] as const;
  }

  if (source.frames.length === 1) {
    const [base, overlays] = composition(source.frames[0]);
    return renderMaskedRaster(art.width, art.height, base, overlays, signal);
  }

  return renderPythonGif({ width: art.width, height: art.height, signal,
    frames: source.frames.map(value => ({ value, delayMs: Math.floor(source.averageDelayMs / 10) * 10 })),
    renderFrame(avatar, width, height) {
      const [base, overlays] = composition(avatar);
      const scale = (draw: Draw): Draw => canvas => { canvas.scale(width / art.width, height / art.height); draw(canvas); };
      return renderMaskedRgba(width, height, scale(base), overlays.map(scale), signal);
    },
  });
});

const guichuHelp = "鬼畜对称方向，包含 left、right、top、bottom";
const guichu = avatarTemplate({ key: "guichu", keywords: ["鬼畜"], params_type: { ...singleAvatar,
  args_type: choiceArgs("direction", sides, "left", guichuHelp, ["-d", "--direction"]),
} }, async ({ images, args }, context) => {
  const direction = select(args.direction, sides, "left", guichuHelp);
  const image = await readMemeFirstImage(images[0]!, context.signal);
  const { width, height } = image;
  const horizontal = direction === "left" || direction === "right";
  const half = Math.floor((horizontal ? width : height) / 2);
  const original = direction === "right" || direction === "bottom" ? half : 0;

  const frames = [
    ...Array.from({ length: 6 }, (_, index) => ({ value: index % 2, delayMs: 600 })),
    ...Array.from({ length: 6 }, (_, index) => ({ value: index % 2, delayMs: 200 })),
    ...Array.from({ length: 4 }, (_, index) => ({ value: index % 2 + 2, delayMs: 400 })),
  ];
  return renderPythonCanvasGif({
    ...rgbaFrameDimensions(width, height), signal: context.signal, frames,
    drawFrame(index, draw) {
      if (index < 2) {
        if (index) {
          draw.translate(horizontal ? width : 0, horizontal ? 0 : height);
          draw.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
        }
        draw.drawImage(image, 0, 0);
        return;
      }
      if (index === 3) {
        draw.translate(Math.floor(-width / 2), Math.floor(-height / 2));
        draw.scale(2, 2);
      }
      drawHalf(draw, image, horizontal, half, original, false);
      drawHalf(draw, image, horizontal, half, half - original, true);
    },
  });
});

const namedDates: Readonly<Record<string, number>> = {
  今天: 0, 昨天: -1, 前天: -2, 明天: 1, 后天: 2, 上周: -7, 下周: 7,
  today: 0, yesterday: -1, tomorrow: 1,
};
const chineseTimeUnits: Readonly<Record<string, string>> = {
  年: "year", 月: "month", 个月: "month", 周: "week", 星期: "week", 天: "day", 日: "day",
  小时: "hour", 分钟: "minute",
};

function monthLastDay(year: number, month: number) {
  const date = new Date(0);
  date.setFullYear(year, month + 1, 0);
  return date.getDate();
}

function moveDate(date: Date, unit: string, amount: number) {
  if (unit === "year" || unit === "month") {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount * (unit === "year" ? 12 : 1));
    date.setDate(Math.min(day, monthLastDay(date.getFullYear(), date.getMonth())));
  } else if (unit === "day" || unit === "week") {
    date.setDate(date.getDate() + amount * (unit === "week" ? 7 : 1));
  } else {
    date.setMinutes(date.getMinutes() + amount * (unit === "hour" ? 60 : 1));
  }
  return date;
}

export function readAbstinenceDate(value: unknown, baseline = new Date()) {
  const now = new Date(baseline);
  if (typeof value !== "string" || !value.trim()) return now;
  const text = value.normalize("NFKC").trim().toLowerCase();
  if (Object.hasOwn(namedDates, text)) return moveDate(now, "day", namedDates[text]!);
  if (text === "上个月" || text === "下个月") return moveDate(now, "month", text.startsWith("上") ? -1 : 1);
  const chinese = /^(\d{1,4})\s*(年|个月|月|周|星期|天|日|小时|分钟)\s*(前|后)$/u.exec(text);
  if (chinese) return moveDate(now, chineseTimeUnits[chinese[2]!]!, Number(chinese[1]) * (chinese[3] === "前" ? -1 : 1));
  const english = /^(in\s+)?(\d{1,4})\s+(year|month|week|day|hour|minute)s?(\s+ago)?$/u.exec(text);
  if (english && !(english[1] && english[4])) return moveDate(now, english[3]!, Number(english[2]) * (english[4] ? -1 : 1));

  function calendar(year: number, month: number, day: number) {
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLastDay(year, month - 1)) return now;
    const result = new Date(now);
    result.setFullYear(year, month - 1, day);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  const isoTime = /^(\d{4})-(\d{2})-(\d{2})[t ]\d{2}:\d{2}/u.exec(text);
  if (isoTime) return Number.isFinite(Date.parse(text)) ? calendar(Number(isoTime[1]), Number(isoTime[2]), Number(isoTime[3])) : now;
  const date = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})日?$/u.exec(text);
  if (date) return calendar(Number(date[1]), Number(date[2]), Number(date[3]));
  const partial = /^(\d{1,2})[-/.月](\d{1,2})日?$/u.exec(text);
  if (partial) return calendar(now.getFullYear(), Number(partial[1]), Number(partial[2]));
  const month = /^(\d{4})[-/.年](\d{1,2})月?$/u.exec(text);
  if (month) return calendar(Number(month[1]), Number(month[2]),
    Math.min(now.getDate(), monthLastDay(Number(month[1]), Number(month[2]) - 1)));
  if (/[a-z]{3}/u.test(text)) {
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return now;
}

function profileName({ args }: MemeTemplateInput) {
  if (typeof args.name === "string" && args.name) return args.name;
  const sender: unknown = Array.isArray(args.user_infos) ? args.user_infos.at(-1) : undefined;
  return sender && typeof sender === "object" && "name" in sender && typeof sender.name === "string" ? sender.name : "";
}

function drawCertificateText(draw: CanvasRenderingContext2D, text: string, top: number, font: string) {
  for (let size = 20; size >= 10; size--) {
    const written = layoutMemeText(parseMemeBbcode(text, size, "center"), 610, { regular: font, cjk: font });
    if (written.height <= 800 - top && written.width <= 610) {
      written.draw(draw, 150 + Math.floor((610 - written.width) / 2), top + Math.floor((800 - top - written.height) / 2));
      return;
    }
  }
  throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
}

const abstinence = avatarTemplate({ key: "abstinence", keywords: ["戒导"], params_type: { ...singleAvatar,
  args_type: { args_model: { properties: { time: { type: "string", default: "", description: "指定时间" },
    name: { type: "string", default: "", description: "指定名字" } } },
  parser_options: [
    { names: ["-t", "--time"], args: [{ name: "time", value: "str" }], help_text: "指定时间" },
    { names: ["-n", "--name"], args: [{ name: "name", value: "str" }], help_text: "指定名字" },
  ] },
} }, async (input, context) => {
  const { signal } = context;
  const [avatar, art, stamp, font] = await Promise.all([
    readMemeFirstImage(input.images[0]!, signal), context.imageAsset("abstinence/base.png").then(loadImage),
    context.imageAsset("abstinence/stamp.png").then(loadImage), registerFont(context),
  ]);
  const date = readAbstinenceDate(input.args.time);
  const name = profileName(input);
  return jpg(art.width, art.height, draw => {
    draw.drawImage(art, 0, 0);
    draw.save();
    draw.translate(80, 400);
    draw.fillStyle = "white";
    draw.fillRect(0, 0, 300, 300);
    drawSquare(draw, avatar, 300, true);
    draw.restore();
    drawCertificateText(draw, `戒导人：[u] ${name} [/u]`, 650, font);
    drawCertificateText(draw, `[u] ${date.getFullYear()} [/u]年[u] ${date.getMonth() + 1} [/u]月[u] ${date.getDate()} [/u]日`, 750, font);
    draw.drawImage(stamp, 350, 650, 200, 200);
  }, signal);
});

const headCaption = "怎么说话的你";
const headPositions = [[160, 121, 76], [172, 124, 69], [208, 166, 52]] as const;
const beatHead = avatarTemplate({ key: "beat_head", keywords: ["拍头"], params_type: { ...singleAvatar,
  max_texts: 1, default_texts: [headCaption], args_type: null,
} }, async ({ images, texts }, context) => {
  const [avatar, art, font] = await Promise.all([
    readMemeFirstImage(images[0]!, context.signal),
    Promise.all(headPositions.map((_, index) => context.imageAsset(`beat_head/${index}.png`).then(loadImage))),
    registerFont(context),
  ]);
  return renderPythonGif({ width: art[0]!.width, height: art[0]!.height, signal: context.signal,
    frames: headPositions.map((position, index) => ({ value: { position, frame: art[index]! }, delayMs: 50 })),
    renderFrame({ position: [x, y, size], frame }, width, height) {
      return renderMaskedRgba(width, height, draw => {
        draw.scale(width / frame.width, height / frame.height);
        draw.translate(x, y);
        drawCircle(draw, avatar, size);
      }, [draw => {
        draw.scale(width / frame.width, height / frame.height);
        draw.drawImage(frame, 0, 0);
      }, draw => {
        draw.scale(width / frame.width, height / frame.height);
        drawFittedText(draw, [175, 28, 316, 82], texts[0] ?? headCaption, font, 10, 50);
      }], context.signal);
    },
  });
});

export const avatarAccessoryMemeTemplates = [
  abstinence, handAccessory("bubble_tea", "奶茶", "right"), clownMask, guichu, handAccessory("gun", "手枪", "left"), beatHead,
] as const;
