import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Layouts from AnyLiew/meme_emoji under the pinned revision in backend-extra-assets.ts.
import { ImageData, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, registerFont, registerMemeTypeface, rgbaFrameDimensions } from "./template-layout.ts";
import { readTransformSource, transformPreviewInput } from "./transforms.ts";

export type CaptionBox = readonly [number, number, number, number];
type Box = CaptionBox;
type Caption = (name: string) => string;
const cjkFonts = {
  child: ["FZSEJW.ttf", "LotusMemeChild"],
  slender: ["FZXS14.ttf", "LotusMemeSlender"],
  cartoon: ["FZKATJW.ttf", "LotusMemeCartoon"],
} as const;

export interface AnyLiewDialogue {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly avatar: Box;
  readonly caption: Caption;
  readonly box: Box | ((width: number, height: number) => Box);
  readonly sizes: readonly [min: number, max: number];
  readonly color?: string;
  readonly leftLines?: boolean;
  readonly bottom?: boolean;
  readonly font?: keyof typeof cjkFonts;
  readonly emoji?: boolean;
  readonly cropAvatar?: boolean;
  readonly defaultText?: string;
  readonly defaultName?: string;
  readonly maleName?: string;
  readonly asset?: string;
  readonly circle?: "square-first" | "stretch-first";
  readonly avatarOnTop?: boolean;
  readonly jpeg?: boolean;
  readonly wrap?: boolean;
}

type Dialogue = AnyLiewDialogue;

const lowerCaption = (width: number, height: number): Box => [5, height - 60, width - 5, height - 10];
const genshin = ["米哈游", "原神"];
const yuzu = ["柚子社"];
const outlinedCaption = { box: lowerCaption, sizes: [12, 40], color: "#fff", leftLines: true, cropAvatar: true } as const;

const dialogues: readonly Dialogue[] = [
  {
    key: "ai_ace", keywords: ["AI高手", "ai高手"], avatar: [1142, 151, 650, 650],
    caption: name => $t("templates.anyliew-dialogue.text_3f5cd8d4a8", { "name": name }),
    box: [115, 83, 1104, 744], sizes: [20, 200], color: "#3a3a3a", leftLines: true, font: "child",
  },
  {
    key: "allegiance", keywords: ["충성", "忠橙", "敬礼"], avatar: [279, 159, 436, 400],
    caption: name => $t("templates.anyliew-dialogue.text_f67a72dd95", { "name": name, "value2": name, "value3": name, "value4": name }),
    box: [1, 774, 1061, 942], sizes: [15, 120], leftLines: true, font: "slender",
  },
  {
    ...outlinedCaption, key: "atri_like", keywords: ["亚托莉喜欢"], tags: ["ATRI", "亚托莉", "萝卜子"],
    avatar: [106, 72, 305, 235], caption: text => text, defaultText: $t("templates.anyliew-dialogue.text_fa215fea06"),
  },
  {
    key: "beloveds", keywords: ["挚爱"], avatar: [330, 140, 330, 330], caption: name => `だいじなひと${name}👩‍❤️‍💋‍👨`,
    box: [0, 614, 638, 761], sizes: [20, 100], leftLines: true, bottom: true, font: "cartoon", emoji: true,
  },
  {
    key: "doro_contact", keywords: ["交往", "doro交往", "Doro交往", "DORO交往", "桃乐丝交往"], avatar: [145, 278, 108, 108],
    caption: name => $t("templates.anyliew-dialogue.text_1287a7c3c3", { "name": name, "value2": name, "value3": name, "value4": name, "value5": name }),
    box: [1, 1, 677, 207], sizes: [15, 60], leftLines: true, font: "child",
  },
  {
    key: "doro_dear", keywords: ["最爱", "doro最爱", "Doro最爱", "DORO最爱", "桃乐丝最爱"], avatar: [576, 529, 100, 100],
    caption: name => $t("templates.anyliew-dialogue.text_c8b2e81d61", { "name": name }),
    box: [1, 675, 1200, 812], sizes: [15, 60], font: "child", emoji: true,
  },
  {
    key: "doro_orange", keywords: ["欧润吉", "润吉", "润橘", "橘子", "橘", "🍊"], avatar: [588, 65, 270, 270],
    caption: name => $t("templates.anyliew-dialogue.text_76904f3fcb", { "name": name, "value2": name }),
    box: [1, 585, 949, 792], sizes: [20, 100], leftLines: true, font: "slender",
  },
  {
    ...outlinedCaption, key: "ikun_like", keywords: ["坤坤喜欢"], tags: ["ikun", "坤坤", "真爱粉", "喜欢"],
    avatar: [106, 72, 305, 235], caption: text => text, defaultText: $t("templates.anyliew-dialogue.text_c27fe7c359"),
  },
  {
    key: "ikun_need_tv", keywords: ["坤坤想要"], avatar: [614, 118, 518, 488], caption: name => $t("templates.anyliew-dialogue.text_4181511629", { "name": name, "value2": name }),
    box: [2, 2, 572, 250], sizes: [5, 50], color: "#fff", leftLines: true, font: "slender", emoji: true,
  },
  {
    key: "mihoyo_keqing_pointo", keywords: ["刻晴指"], tags: genshin, avatar: [26, 171, 230, 290],
    caption: name => $t("templates.anyliew-dialogue.text_10537aed28", { "name": name }),
    box: [1, 538, 577, 711], sizes: [15, 60], leftLines: true, font: "slender",
  },
  {
    key: "mihoyo_navia_caspar_persuade", keywords: ["说服"], tags: genshin, avatar: [141, 85, 350, 350],
    caption: name => $t("templates.anyliew-dialogue.text_0073f8cff2", { "name": name }),
    box: [1, 492, 544, 616], sizes: [20, 100], font: "child",
  },
  {
    key: "pay_to_watch", keywords: ["付费观看"], avatar: [150, 240, 185, 185],
    caption: name => $t("templates.anyliew-dialogue.text_f52746553a", { "name": name }),
    box: [36, 5, 1051, 141], sizes: [20, 100], leftLines: true, font: "slender",
  },
  {
    key: "rune", keywords: ["符咒"], avatar: [456, 816, 185, 185], caption: name => $t("templates.anyliew-dialogue.text_30b74513a9", { "name": name }),
    box: [1, 1151, 1080, 1273], sizes: [20, 100], color: "#fff", font: "slender",
  },
  {
    key: "something", keywords: ["什么东西"], avatar: [118, 471, 308, 308],
    caption: name => $t("templates.anyliew-dialogue.text_4df7398d30", { "name": name }), box: [117, 0, 845, 190], sizes: [20, 90], font: "child",
  },
  {
    key: "yes", keywords: ["yes", "Yes", "YES"], avatar: [396, 452, 165, 165], caption: name => `${name} YES!👍🏻👍🏻`,
    box: [295, 817, 980, 936], sizes: [15, 120], font: "slender", emoji: true,
  },
  {
    ...outlinedCaption, key: "yuzu_soft_murasame_dislike", keywords: ["丛雨讨厌"], tags: yuzu,
    avatar: [99, 60, 346, 264], caption: text => text, defaultText: $t("templates.anyliew-dialogue.text_35acc1d76a"),
  },
  {
    ...outlinedCaption, key: "yuzu_soft_murasame_like", keywords: ["丛雨喜欢"], tags: yuzu,
    avatar: [47, 51, 275, 275], caption: text => text, defaultText: $t("templates.anyliew-dialogue.text_b6060f7e2e"),
  },
  {
    key: "yuzu_soft_ticket", keywords: ["准考证"], tags: yuzu, avatar: [72, 330, 300, 300],
    caption: name => name, defaultName: $t("templates.anyliew-dialogue.text_dafaaeb6ef"), box: [485, 544, 625, 583], sizes: [30, 100], font: "child",
  },
];

function captionText(input: MemeTemplateInput, definition: Dialogue) {
  const user = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
  const nickname = typeof user?.name === "string" ? user.name : undefined;
  const pronoun = user && user.gender !== "male" ? $t("templates.anyliew-dialogue.text_2ab425e0c6") : definition.maleName ?? $t("templates.anyliew-dialogue.text_8b7b91e000");
  return definition.caption(input.texts[0] ?? definition.defaultText ?? (nickname || (user ? pronoun : definition.defaultName ?? $t("templates.anyliew-dialogue.text_8b7b91e000"))));
}

export type AnyLiewCaptionStyle = Pick<Dialogue, "sizes" | "color" | "leftLines" | "bottom" | "cropAvatar" | "wrap" | "font"> & {
  readonly lineHeight?: number;
};

export async function anyLiewCaptionFonts(context: MemeTemplateContext, font?: Dialogue["font"], withEmoji?: boolean) {
  const typeface = font && cjkFonts[font];
  const [fallback, primary, emoji] = await Promise.all([
    registerFont(context),
    typeface && registerMemeTypeface(context, typeface[0], typeface[1]),
    withEmoji && registerMemeTypeface(context, "NotoColorEmoji.ttf", "LotusMemeColorEmoji"),
  ]);
  return [primary, fallback, emoji, "sans-serif"].filter(Boolean).join(", ");
}

export function paintAnyLiewCaption(draw: CanvasRenderingContext2D, box: Box, text: string, family: string,
  definition: AnyLiewCaptionStyle,
) {
  const [left, top, right, bottom] = box;
  const [minimum, maximum] = definition.sizes;
  draw.textWrap = true;
  draw.textBaseline = "alphabetic";
  draw.textAlign = definition.leftLines ? "left" : "center";
  draw.fillStyle = definition.color ?? "#000";
  for (let size = maximum; size >= minimum; size--) {
    const leading = definition.lineHeight === undefined ? undefined : Math.round(size * definition.lineHeight);
    draw.font = `${size}px${leading === undefined ? "" : `/${leading}px`} ${family}`;
    const availableWidth = right - left;
    const full = draw.measureText(text);
    const wrapWidth = definition.wrap && full.lines.some(line => line.width > availableWidth) ? availableWidth : undefined;
    const { lines } = wrapWidth ? draw.measureText(text, wrapWidth) : full;
    const first = lines[0], last = lines.at(-1);
    if (!first || !last) return;
    const height = leading === undefined ? last.y + last.height - first.y : lines.length * leading;
    const contentTop = leading === undefined ? first.y : (first.ascent + first.descent - leading) / 2;
    const width = Math.max(...lines.map(line => line.width));
    if (height > bottom - top || width > right - left) continue;
    // PIL centers the widest block while leaving the individual lines left-aligned.
    const x = (left + right - (definition.leftLines ? wrapWidth ?? width : 0)) / 2;
    const y = bottom - height - contentTop - (definition.bottom ? 0 : (bottom - top - height) / 2);
    if (definition.cropAvatar) {
      draw.strokeStyle = "#000";
      draw.lineWidth = Math.round(size * 0.06) * 2;
      draw.strokeText(text, x, y, wrapWidth);
    }
    draw.fillText(text, x, y, wrapWidth);
    return;
  }
  throw new MemeTemplateFeedback($t("templates.anyliew-dialogue.text_002fc2fab2"));
}

function drawAvatar(draw: CanvasRenderingContext2D, image: Image, definition: Dialogue) {
  const [left, top, width, height] = definition.avatar;
  draw.imageSmoothingQuality = "high";
  if (definition.circle === "stretch-first") {
    draw.beginPath();
    draw.arc(left + width / 2, top + height / 2, width / 2, 0, Math.PI * 2);
    draw.clip();
  }
  if (!definition.cropAvatar) {
    draw.drawImage(image, left, top, width, height);
    return;
  }

  const scale = Math.max(width / image.width, height / image.height);
  const scaledWidth = Math.max(width, Math.trunc(image.width * scale));
  const scaledHeight = Math.max(height, Math.trunc(image.height * scale));
  draw.beginPath();
  draw.rect(left, top, width, height);
  draw.clip();
  draw.drawImage(image, left + Math.floor((width - scaledWidth) / 2),
    top + Math.floor((height - scaledHeight) / 2), scaledWidth, scaledHeight);
}

async function squareCircle(image: Image) {
  const size = Math.min(image.width, image.height);
  const { png } = await renderExactPng(size, size, draw => {
    draw.beginPath();
    draw.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    draw.clip();
    draw.drawImage(image, Math.trunc((size - image.width) / 2), Math.trunc((size - image.height) / 2));
  });
  return loadImage(png);
}

export async function renderAnyLiewDialogue(input: MemeTemplateInput, context: MemeTemplateContext, definition: Dialogue) {
  const { signal } = context;
  const [sequence, frame, family] = await Promise.all([
    readTransformSource(input, signal),
    context.imageAsset(`anyliew/emoji/${definition.key}/images/${definition.asset ?? "0.png"}`).then(loadImage),
    anyLiewCaptionFonts(context, definition.font, definition.emoji),
  ]);
  const text = captionText(input, definition);
  const box = typeof definition.box === "function" ? definition.box(frame.width, frame.height) : definition.box;
  const { width, height, scale } = rgbaFrameDimensions(frame.width, frame.height);
  async function raster(image: Image, rasterWidth: number, rasterHeight: number) {
    const source = definition.circle === "square-first" ? await squareCircle(image) : image;
    const scaleX = scale * rasterWidth / width, scaleY = scale * rasterHeight / height;
    const backdrop = (draw: CanvasRenderingContext2D) => {
      draw.scale(scaleX, scaleY);
      draw.drawImage(frame, 0, 0);
      paintAnyLiewCaption(draw, box, text, family, definition);
    };
    const avatar = (draw: CanvasRenderingContext2D) => {
      draw.scale(scaleX, scaleY);
      drawAvatar(draw, source, definition);
    };
    if (definition.avatarOnTop) {
      return renderMaskedRgba(rasterWidth, rasterHeight, backdrop, [avatar], signal,
        { whiteBackground: definition.jpeg === true && sequence.frames.length === 1 });
    }
    return definition.cropAvatar
      ? renderMaskedRgba(rasterWidth, rasterHeight, avatar, [backdrop], signal)
      : renderMaskedRgba(rasterWidth, rasterHeight, () => {}, [avatar, backdrop], signal);
  }
  if (sequence.frames.length === 1) {
    const rgba = await raster(sequence.frames[0], width, height);
    const image = new ImageData(new Uint8ClampedArray(rgba), width, height);
    if (definition.jpeg) return jpg(frame.width, frame.height, draw => draw.putImageData(image, 0, 0), signal);
    const rendered = await renderExactPng(width, height, draw => draw.putImageData(image, 0, 0));
    signal.throwIfAborted();
    return rendered.png;
  }
  const delayMs = Math.floor(sequence.averageDelayMs / 10) * 10;
  return renderPythonGif({
    width, height, signal,
    frames: sequence.frames.map(value => ({ value, delayMs })),
    renderFrame: raster,
  });
}

const singleAvatar = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, args_type: null } as const;

export function anyLiewDialogueTemplate(definition: Dialogue): MemeTemplate {
  return {
    info: {
      key: definition.key, keywords: definition.keywords, tags: definition.tags,
      params_type: { ...singleAvatar, default_texts: definition.defaultText ? [definition.defaultText] : [] },
    },
    render: (input, context) => renderAnyLiewDialogue(input, context, definition),
    preview: async context => renderAnyLiewDialogue(await transformPreviewInput(context), context, definition),
  };
}

export const anyliewDialogueTemplates: readonly MemeTemplate[] = dialogues.map(anyLiewDialogueTemplate);
