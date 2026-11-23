// Layouts from AnyLiew/meme_emoji under the pinned revision in backend-extra-assets.ts.
import { ImageData, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { registerFont, registerMemeTypeface, rgbaFrameDimensions } from "./template-layout.ts";
import { readTransformSource, transformPreviewInput } from "./transforms.ts";

type Box = readonly [number, number, number, number];
type Caption = (name: string) => string;
const cjkFonts = {
  child: ["FZSEJW.ttf", "LotusMemeChild"],
  slender: ["FZXS14.ttf", "LotusMemeSlender"],
  cartoon: ["FZKATJW.ttf", "LotusMemeCartoon"],
} as const;

interface Dialogue {
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
}

const lowerCaption = (width: number, height: number): Box => [5, height - 60, width - 5, height - 10];
const genshin = ["米哈游", "原神"];
const yuzu = ["柚子社"];
const outlinedCaption = { box: lowerCaption, sizes: [12, 40], color: "#fff", leftLines: true, cropAvatar: true } as const;

const dialogues: readonly Dialogue[] = [
  {
    key: "ai_ace", keywords: ["AI高手", "ai高手"], avatar: [1142, 151, 650, 650],
    caption: name => `不用了\n我${name}是AI高手\n正在用AI写代码中ing`,
    box: [115, 83, 1104, 744], sizes: [20, 200], color: "#3a3a3a", leftLines: true, font: "child",
  },
  {
    key: "allegiance", keywords: ["충성", "忠橙", "敬礼"], avatar: [279, 159, 436, 400],
    caption: name => `${name}:${name}向你敬礼,忠诚!\n${name}:${name}당신에게 경의를 표합니다,충성!`,
    box: [1, 774, 1061, 942], sizes: [15, 120], leftLines: true, font: "slender",
  },
  {
    ...outlinedCaption, key: "atri_like", keywords: ["亚托莉喜欢"], tags: ["ATRI", "亚托莉"],
    avatar: [106, 72, 305, 235], caption: text => text, defaultText: "亚托莉喜欢这个",
  },
  {
    key: "beloveds", keywords: ["挚爱"], avatar: [330, 140, 330, 330], caption: name => `だいじなひと${name}👩‍❤️‍💋‍👨`,
    box: [0, 614, 638, 761], sizes: [20, 100], leftLines: true, bottom: true, font: "cartoon", emoji: true,
  },
  {
    key: "doro_contact", keywords: ["交往", "doro交往", "Doro交往", "DORO交往", "桃乐丝交往"], avatar: [145, 278, 108, 108],
    caption: name => `桃乐丝:${name}同学,这是你的头像照片吗？\n桃乐丝:你长得好帅呀\n桃乐丝:${name},你愿意和我交往在一起吗？\n${name}:我愿意,我愿意\n${name}:桃乐丝,我${name}愿意和你在一起一生一世`,
    box: [1, 1, 677, 207], sizes: [15, 60], leftLines: true, font: "child",
  },
  {
    key: "doro_dear", keywords: ["最爱", "doro最爱", "Doro最爱", "DORO最爱", "桃乐丝最爱"], avatar: [576, 529, 100, 100],
    caption: name => `桃乐丝:${name},你永远是桃乐丝的最爱之人❤️`,
    box: [1, 675, 1200, 812], sizes: [15, 60], font: "child", emoji: true,
  },
  {
    key: "doro_orange", keywords: ["欧润吉", "润吉", "润橘", "橘子", "橘", "🍊"], avatar: [588, 65, 270, 270],
    caption: name => `桃乐丝:和${name}一起品尝欧润吉真是一种享受\n \n${name}:欧润吉真好吃`,
    box: [1, 585, 949, 792], sizes: [20, 100], leftLines: true, font: "slender",
  },
  {
    ...outlinedCaption, key: "ikun_like", keywords: ["坤坤喜欢"], tags: ["ikun", "坤坤", "真爱粉", "喜欢"],
    avatar: [106, 72, 305, 235], caption: text => text, defaultText: "坤坤喜欢这个",
  },
  {
    key: "ikun_need_tv", keywords: ["坤坤想要"], avatar: [614, 118, 518, 488], caption: name => `坤坤好喜欢${name}\n想要一个${name}❤️~`,
    box: [2, 2, 572, 250], sizes: [5, 50], color: "#fff", leftLines: true, font: "slender", emoji: true,
  },
  {
    key: "mihoyo_keqing_pointo", keywords: ["刻晴指"], tags: genshin, avatar: [26, 171, 230, 290],
    caption: name => `此人「${name}」\n\n拥有我的六个命座\n\n已经是满命了`,
    box: [1, 538, 577, 711], sizes: [15, 60], leftLines: true, font: "slender",
  },
  {
    key: "mihoyo_navia_caspar_persuade", keywords: ["说服"], tags: genshin, avatar: [141, 85, 350, 350],
    caption: name => `我可以对${name} \n 使用『说服』吗?`,
    box: [1, 492, 544, 616], sizes: [20, 100], font: "child",
  },
  {
    key: "pay_to_watch", keywords: ["付费观看"], avatar: [150, 240, 185, 185],
    caption: name => `男主:旁边怎么有人傻乎乎站在那里？\n女主:${name}付钱让他站在那付费观看的`,
    box: [36, 5, 1051, 141], sizes: [20, 100], leftLines: true, font: "slender",
  },
  {
    key: "rune", keywords: ["符咒"], avatar: [456, 816, 185, 185], caption: name => `这是符咒「${name}」`,
    box: [1, 1151, 1080, 1273], sizes: [20, 100], color: "#fff", font: "slender",
  },
  {
    key: "something", keywords: ["什么东西"], avatar: [118, 471, 308, 308],
    caption: name => `这${name}是什么东西?\n竟然让人如此着迷`, box: [117, 0, 845, 190], sizes: [20, 90], font: "child",
  },
  {
    key: "yes", keywords: ["yes", "Yes", "YES"], avatar: [396, 452, 165, 165], caption: name => `${name} YES!👍🏻👍🏻`,
    box: [295, 817, 980, 936], sizes: [15, 120], font: "slender", emoji: true,
  },
  {
    ...outlinedCaption, key: "yuzu_soft_murasame_dislike", keywords: ["丛雨讨厌"], tags: yuzu,
    avatar: [99, 60, 346, 264], caption: text => text, defaultText: "丛雨讨厌这个",
  },
  {
    ...outlinedCaption, key: "yuzu_soft_murasame_like", keywords: ["丛雨喜欢"], tags: yuzu,
    avatar: [47, 51, 275, 275], caption: text => text, defaultText: "丛雨喜欢这个",
  },
  {
    key: "yuzu_soft_ticket", keywords: ["准考证"], tags: yuzu, avatar: [72, 330, 300, 300],
    caption: name => name, defaultName: "柚子厨", box: [485, 544, 625, 583], sizes: [30, 100], font: "child",
  },
];

function captionText(input: MemeTemplateInput, definition: Dialogue) {
  const user = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
  const nickname = typeof user?.name === "string" ? user.name : undefined;
  const pronoun = user && user.gender !== "male" ? "她" : "他";
  return definition.caption(input.texts[0] ?? definition.defaultText ?? (nickname || (user ? pronoun : definition.defaultName ?? "他")));
}

function paintCaption(draw: CanvasRenderingContext2D, box: Box, text: string, family: string, definition: Dialogue) {
  const [left, top, right, bottom] = box;
  const [minimum, maximum] = definition.sizes;
  draw.textWrap = true;
  draw.textBaseline = "alphabetic";
  draw.textAlign = definition.leftLines ? "left" : "center";
  draw.fillStyle = definition.color ?? "#000";
  for (let size = maximum; size >= minimum; size--) {
    draw.font = `${size}px ${family}`;
    const { lines } = draw.measureText(text);
    const first = lines[0], last = lines.at(-1);
    if (!first || !last) return;
    const height = last.y + last.height - first.y;
    const width = Math.max(...lines.map(line => line.width));
    if (height > bottom - top || width > right - left) continue;
    // PIL centers the widest block while leaving the individual lines left-aligned.
    const x = (left + right - (definition.leftLines ? width : 0)) / 2;
    const y = bottom - height - first.y - (definition.bottom ? 0 : (bottom - top - height) / 2);
    if (definition.cropAvatar) {
      draw.strokeStyle = "#000";
      draw.lineWidth = Math.round(size * 0.06) * 2;
      draw.strokeText(text, x, y);
    }
    draw.fillText(text, x, y);
    return;
  }
  throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
}

function drawAvatar(draw: CanvasRenderingContext2D, image: Image, definition: Dialogue) {
  const [left, top, width, height] = definition.avatar;
  draw.imageSmoothingQuality = "high";
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

async function renderDialogue(input: MemeTemplateInput, context: MemeTemplateContext, definition: Dialogue) {
  const { signal } = context;
  const typeface = definition.font && cjkFonts[definition.font];
  const [sequence, frame, fallback, primary, emoji] = await Promise.all([
    readTransformSource(input, signal),
    context.imageAsset(`anyliew/emoji/${definition.key}/images/0.png`).then(loadImage),
    registerFont(context),
    typeface && registerMemeTypeface(context, typeface[0], typeface[1]),
    definition.emoji && registerMemeTypeface(context, "NotoColorEmoji.ttf", "LotusMemeColorEmoji"),
  ]);
  const family = [primary, fallback, emoji, "sans-serif"].filter(Boolean).join(", ");
  const text = captionText(input, definition);
  const box = typeof definition.box === "function" ? definition.box(frame.width, frame.height) : definition.box;
  const { width, height, scale } = rgbaFrameDimensions(frame.width, frame.height);
  if (sequence.frames.length > 1) assertMemeGifDimensions(width, height, sequence.frames.length);
  const backdrop = (draw: CanvasRenderingContext2D) => {
    draw.scale(scale, scale);
    draw.drawImage(frame, 0, 0);
    paintCaption(draw, box, text, family, definition);
  };
  async function raster(image: Image) {
    const avatar = (draw: CanvasRenderingContext2D) => {
      draw.scale(scale, scale);
      drawAvatar(draw, image, definition);
    };
    return definition.cropAvatar
      ? renderMaskedRgba(width, height, avatar, [backdrop], signal)
      : renderMaskedRgba(width, height, () => {}, [avatar, backdrop], signal);
  }
  if (sequence.frames.length === 1) {
    const rgba = await raster(sequence.frames[0]);
    const image = new ImageData(new Uint8ClampedArray(rgba), width, height);
    const rendered = await renderExactPng(width, height, draw => draw.putImageData(image, 0, 0));
    signal.throwIfAborted();
    return rendered.png;
  }
  const delayMs = Math.floor(sequence.averageDelayMs / 10) * 10;
  const frames = [];
  for (const frame of sequence.frames) frames.push({ rgba: await raster(frame), delayMs });
  return encodeMemeGif(width, height, frames, signal);
}

const singleAvatar = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, args_type: null } as const;

export const anyliewDialogueTemplates: readonly MemeTemplate[] = dialogues.map(definition => ({
  info: {
    key: definition.key, keywords: definition.keywords, tags: definition.tags,
    params_type: { ...singleAvatar, default_texts: definition.defaultText ? [definition.defaultText] : [] },
  },
  render: (input, context) => renderDialogue(input, context, definition),
  preview: async context => renderDialogue(await transformPreviewInput(context), context, definition),
}));
