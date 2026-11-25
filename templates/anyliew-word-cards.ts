import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { randomInt } from "node:crypto";
import { loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont, registerMemeTypeface } from "./template-layout.ts";
import { readMemeFirstImage } from "./animated-input.ts";

type Box = readonly [left: number, top: number, right: number, bottom: number];
interface Frame {
  readonly asset: string;
  readonly box: Box;
  readonly color?: string;
}
interface WordCard {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly text: string;
  readonly frames: readonly Frame[];
  readonly sizes: readonly [min: number, max: number];
  readonly args?: "name" | "number";
  readonly childFont?: boolean;
  readonly leftLines?: boolean;
  readonly tags?: readonly string[];
}

const dates = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const namedLetterFrame: Frame = { asset: "0.png", box: [60, 225, 490, 320] };
const noImages = { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1 } as const;
// Fixed AnyLiew templates. Original proprietary faces use the already bundled open mappings.
const cards: readonly WordCard[] = [
  { key: "admission_letter", keywords: ["录取通知书"], text: "Anyliew", args: "name",
    childFont: true, leftLines: true, sizes: [10, 16], frames: [{ asset: "legacy-0.png", box: [102, 195, 500, 217] }] },
  { key: "aima_say", keywords: ["艾玛说", "樱羽艾玛说"], text: $t("templates.anyliew-word-cards.text_ace43181b8"),
    childFont: true, leftLines: true, sizes: [5, 120], frames: [
      { asset: "0.jpg", box: [40, 35, 140, 210] }, { asset: "1.jpg", box: [360, 10, 490, 200] },
    ] },
  { key: "atri_say", keywords: ["亚托莉说"], tags: ["ATRI", "亚托莉", "萝卜子"], text: $t("templates.anyliew-word-cards.text_92bb9b31a6"),
    childFont: true, leftLines: true, sizes: [20, 120], frames: [{ asset: "0.png", box: [25, 166, 114, 284] }] },
  { key: "deepseek_say", keywords: ["Deepseek说", "deepseek说", "鲸鱼娘说", "大肥鱼说"], text: $t("templates.anyliew-word-cards.text_6c1c37dff2"),
    childFont: true, sizes: [10, 180], args: "number", frames: [
      { asset: "1.png", box: [59, 57, 569, 336], color: "#041546" },
      { asset: "2.png", box: [139, 140, 653, 427], color: "#10315e" },
      { asset: "3.png", box: [372, 0, 1254, 382] },
      { asset: "4.png", box: [139, 122, 664, 427], color: "#000a35" },
    ] },
  { key: "naruto_uchiha_itachi_say", keywords: ["鼬说", "宇智波鼬说"], text: $t("templates.anyliew-word-cards.text_d287a16e1d"),
    leftLines: true, sizes: [30, 300], frames: [{ asset: "0.png", box: [778, 572, 1020, 979] }] },
  { key: "naruto_yakushi_kabuto_say", keywords: ["药师兜说", "兜说"], text: $t("templates.anyliew-word-cards.text_b0115a3961"),
    leftLines: true, sizes: [30, 300], frames: [{ asset: "0.png", box: [1040, 1, 1370, 483] }] },
];

function assetPath(key: string, file: string) {
  return "anyliew/emoji/" + key + "/images/" + file;
}

function childFont(context: MemeTemplateContext) {
  return registerMemeTypeface(context, "FZSEJW.ttf", "LotusMemeChild");
}

function withLegacyChineseMetrics(draw: CanvasRenderingContext2D, box: Box, paint: (bounds: Box) => void, scaleX: number) {
  // Keep the old CJK advances and paragraph height with the licensed replacement face.
  const scaleY = 1.14;
  draw.save();
  draw.scale(scaleX, scaleY);
  try {
    paint([box[0] / scaleX, box[1] / scaleY, box[2] / scaleX, box[3] / scaleY]);
  } finally {
    draw.restore();
  }
}

function makeCard(card: WordCard): MemeTemplate {
  const option = card.args;
  const isLetter = option === "name";
  const count = card.frames.length;
  const optionHelp = isLetter ? $t("templates.anyliew-word-cards.text_0c82a5d7d0") : $t("templates.anyliew-word-cards.text_ce50e24cd5") + count + $t("templates.anyliew-word-cards.text_54a55f97a5");
  const argsType = option ? {
    args_model: { properties: {
      [option]: { type: isLetter ? "string" : "integer", default: isLetter ? "" : 0, description: optionHelp },
    } },
    parser_options: [{ names: ["-n", "--" + option], args: [{ name: option, value: isLetter ? "str" : "int" }], help_text: optionHelp }],
  } : null;
  async function render(caption: string, args: Readonly<Record<string, unknown>>, context: MemeTemplateContext) {
    let index = 0;
    if (count > 1) {
      const number = option === "number" ? args.number : undefined;
      if (number === undefined || number === 0) index = randomInt(count);
      else if (typeof number === "number" && Number.isSafeInteger(number) && number >= 1 && number <= count) index = number - 1;
      else throw new MemeTemplateFeedback($t("templates.anyliew-word-cards.text_23aac92ed6") + count + $t("templates.anyliew-word-cards.text_a5c37328e7"));
    }
    const name = isLetter && typeof args.name === "string" ? args.name : undefined;
    const frame = name === undefined ? card.frames[index]! : namedLetterFrame;
    const [min, max] = name === undefined ? card.sizes : [10, 24];
    const [image, primary, fallback, latin] = await Promise.all([
      context.imageAsset(assetPath(card.key, frame.asset)).then(loadImage),
      card.childFont ? childFont(context) : undefined,
      registerFont(context),
      isLetter ? registerMemeTypeface(context, "LiberationSans-Regular.ttf", "LotusMemeLiberationSans") : undefined,
    ]);
    const font = [latin, primary, fallback, "sans-serif"].filter(Boolean).join(", ");
    let text = caption;
    if (name !== undefined) {
      const now = new Date();
      text = dates[now.getMonth()] + " " + now.getDate() + " " + now.getFullYear() + "\n\nDear " + (name || caption);
    }
    return jpg(image.width, image.height, draw => {
      paper(draw, image.width, image.height);
      draw.drawImage(image, 0, 0);
      const paint = (box: Box) => drawFittedText(draw, box, text, font, min, max, card.leftLines ? "left" : "center", frame.color, {
        paragraphMetrics: true, blockAlignment: isLetter ? "left" : "center", vertical: isLetter ? "top" : "center",
      });
      if (card.key === "deepseek_say") withLegacyChineseMetrics(draw, frame.box, paint, 1.06);
      else paint(frame.box);
    }, context.signal);
  }
  return {
    info: { key: card.key, keywords: card.keywords, tags: card.tags,
      params_type: { ...noImages, default_texts: [card.text], args_type: argsType } },
    render: (input, context) => render(input.texts[0] ?? card.text, input.args, context),
    preview: context => render(card.text, {}, context),
  };
}

const handwriting: MemeTemplate = {
  info: { key: "handwriting", keywords: ["手写"], params_type: { ...noImages, default_texts: [$t("templates.anyliew-word-cards.text_fa65d94b35")] } },
  async render({ texts }, context) {
    const [frame, primary, fallback] = await Promise.all([
      context.imageAsset(assetPath("handwriting", "0.jpg")).then(loadImage),
      registerMemeTypeface(context, "FZSJ-QINGCRJ.ttf", "LotusMemeDiary"), registerFont(context),
    ]);
    const text = [...(texts[0] ?? $t("templates.anyliew-word-cards.text_fa65d94b35"))].slice(0, 500).join("");
    const width = 2_000, height = 1_800;
    const patch = await renderExactPng(width, height, draw => {
      draw.font = "200px " + primary + ", " + fallback + ", sans-serif";
      draw.textWrap = true;
      draw.textBaseline = "alphabetic";
      draw.fillStyle = "#000";
      const ascent = draw.measureText(text, 2_360).lines[0]?.ascent;
      if (ascent !== undefined) draw.fillText(text, 0, -ascent, 2_360);
    });
    const lettering = await loadImage(patch.png);
    const rad = 17 * Math.PI / 180;
    const half = (side: number, extent: number) => (Math.ceil((side + extent) / 2) - Math.floor((side - extent) / 2)) / 2;
    const centerX = half(width, width * Math.cos(rad) + height * Math.sin(rad));
    const centerY = half(height, width * Math.sin(rad) + height * Math.cos(rad));
    return jpg(frame.width, frame.height, draw => {
      paper(draw, frame.width, frame.height);
      draw.drawImage(frame, 0, 0);
      draw.translate(580 + centerX, 500 + centerY);
      draw.rotate(-rad);
      draw.drawImage(lettering, -width / 2, -height / 2);
    }, context.signal);
  },
  preview: context => handwriting.render({ images: [], texts: [$t("templates.anyliew-word-cards.text_fa65d94b35")], args: {} }, context),
};

const bullyMe: MemeTemplate = {
  info: { key: "bully_me", keywords: ["恶语相向"],
    params_type: { min_images: 1, max_images: 1, min_texts: 1, max_texts: 1, default_texts: [$t("templates.anyliew-word-cards.text_b70bb4acc0")] } },
  async render({ images, texts }, context) {
    if (images.length !== 1) throw new MemeTemplateFeedback($t("templates.anyliew-word-cards.text_2646e324ad"));
    const [photo, primary, fallback] = await Promise.all([
      readMemeFirstImage(images[0]!, context.signal), childFont(context), registerFont(context),
    ]);
    const width = 650;
    const height = Math.floor(photo.height * width / photo.width);
    const text = $t("templates.anyliew-word-cards.text_b1248cc813") + (texts[0] ?? $t("templates.anyliew-word-cards.text_b70bb4acc0")) + $t("templates.anyliew-word-cards.text_1dab065c92");
    const captionHeight = 50 * (Math.floor([...text].length / 15) + 1) + 10;
    return jpg(width, captionHeight + height, draw => {
      paper(draw, width, captionHeight + height);
      const font = primary + ", " + fallback + ", sans-serif";
      withLegacyChineseMetrics(draw, [20, 10, width - 20, captionHeight - 10], box => {
        drawFittedText(draw, box, text, font, 20, 40, "left", "#000", { paragraphMetrics: true, blockAlignment: "center" });
      }, 1.12);
      draw.drawImage(photo, 0, captionHeight, width, height);
    }, context.signal);
  },
  async preview(context) {
    return bullyMe.render({ images: [await previewImage(context.signal)], texts: [$t("templates.anyliew-word-cards.text_b70bb4acc0")], args: {} }, context);
  },
};

export const anyliewWordCardTemplates = [...cards.map(makeCard), handwriting, bullyMe] as const;
