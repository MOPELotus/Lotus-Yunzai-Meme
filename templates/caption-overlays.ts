import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Layouts from MemeCrafters/meme-generator v0.1.14 (619fa105).
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput, MemeTemplateShortcut } from "../builtin-template.ts";
import { drawAvatar, type AvatarPlacement } from "./avatar-slot.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { drawFittedText, jpg, paper, registerFont } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

interface CaptionOverlay extends AvatarPlacement {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly defaultText?: string;
  readonly art?: "0.jpg";
  readonly shortcuts?: readonly MemeTemplateShortcut[];
  readonly expandTo?: number;
  readonly aboveArt?: boolean;
  readonly box: readonly [left: number, top: number, right: number, bottom: number];
  readonly fontSize: readonly [minimum: number, maximum: number];
  readonly bold?: boolean;
  readonly wrap?: boolean;
  readonly fill?: string;
  readonly stroke?: readonly [color: string, ratio: number];
  readonly vertical?: "bottom";
  readonly caption?: (text: string | undefined, args: MemeTemplateInput["args"]) => string;
}

function firstUserName(args: MemeTemplateInput["args"], fallback: string) {
  const user: unknown = Array.isArray(args.user_infos) ? args.user_infos[0] : undefined;
  if (!user || typeof user !== "object") return fallback;
  const { name } = user as { readonly name?: unknown };
  return typeof name === "string" ? name : "";
}

const togetherText = $t("templates.caption-overlays.text_b728962593");
const whatHeWantsDate = $t("templates.caption-overlays.text_f6a269f6f3");

const layouts: readonly CaptionOverlay[] = [
  { key: "acg_entrance", keywords: ["二次元入口"], slot: [190, 265, 290, 410], defaultText: $t("templates.caption-overlays.text_e0428a7a59"),
    box: [30, 720, 610, 810], fontSize: [25, 50], fill: "white" },
  { key: "addiction", keywords: ["上瘾", "毒瘾发作"], slot: [0, 0, 91, 91], aboveArt: true, expandTo: 286,
    box: [10, 246, 236, 286], fontSize: [12, 45] },
  { key: "anya_suki", keywords: ["阿尼亚喜欢"], tags: ["间谍过家家", "阿尼亚·福杰"], slot: [106, 72, 305, 235],
    defaultText: $t("templates.caption-overlays.text_10f0db0177"), box: [5, 440, 470, 490], fontSize: [12, 40], fill: "white", stroke: ["black", 0.06] },
  { key: "father_work", keywords: ["闭嘴", "我爸爸"], slot: [252, 142, 230, 120], fit: "contain", aboveArt: true,
    defaultText: $t("templates.caption-overlays.text_eed58fd967"), box: [195, 372, 490, 462], fontSize: [10, 50], wrap: true },
  { key: "frieren_take", keywords: ["芙莉莲拿"], tags: ["芙莉莲", "葬送的芙莉莲"], slot: [130, 197, 102, 108],
    defaultText: $t("templates.caption-overlays.text_9ea175d333"), box: [100, 439, 783, 559],
    fontSize: [20, 50], fill: "white", stroke: ["black", 0.05] },
  { key: "learn", keywords: ["偷学"], slot: [1440, 0, 1751, 1347], aboveArt: true, defaultText: $t("templates.caption-overlays.text_c13f8953db"),
    box: [100, 1360, 3093, 1730], fontSize: [200, 350], bold: true },
  { key: "what_he_wants", keywords: ["最想要的东西"], slot: [486, 616, 538, 538], fit: "contain", aboveArt: true,
    defaultText: whatHeWantsDate, box: [0, 514, 1024, 614], fontSize: [20, 80], bold: true, vertical: "bottom",
    stroke: ["white", 0.07], caption: date => $t("templates.caption-overlays.text_05551f82c9", { "value1": date ?? whatHeWantsDate }) },
  { key: "fill_head", keywords: ["满脑子"], art: "0.jpg", slot: [150, 2, 210, 170], fit: "contain", aboveArt: true,
    box: [20, 458, 528, 550], fontSize: [30, 65], caption: (text, args) => $t("templates.caption-overlays.text_30acaab1c0", { "value1": text ?? firstUserName(args, $t("templates.caption-overlays.text_7e9260e925")) }),
    shortcuts: [{ key: "满脑子都是(?P<name>\\S+)", args: ["{name}"], humanized: $t("templates.caption-overlays.text_d0cc254e90") }] },
  { key: "stew", keywords: ["炖"], slot: [9, -2, 181, 154], box: [2, 168, 196, 198], fontSize: [6, 30],
    caption: (text, args) => $t("templates.caption-overlays.text_3e9a1269e4", { "value1": text ?? firstUserName(args, $t("templates.caption-overlays.text_c2f81b24c9")) }) },
  { key: "together", keywords: ["一起"], slot: [132, 36, 63, 63], aboveArt: true, box: [10, 140, 190, 190],
    fontSize: [10, 50], bold: true, wrap: true, defaultText: togetherText,
    caption: (text, args) => text ?? togetherText.replace("{name}", () => firstUserName(args, "")) },
];

async function captionArt(original: Image, layout: CaptionOverlay, text: string | undefined, context: MemeTemplateContext) {
  if (text === undefined) return original;
  const { width } = original;
  const height = layout.expandTo ?? original.height;
  const font = text ? await registerFont(context, layout.bold) : undefined;
  const { png } = await renderExactPng(width, height, (draw) => {
    if (layout.expandTo !== undefined) paper(draw, width, height);
    draw.drawImage(original, 0, 0);
    if (font) drawFittedText(draw, layout.box, text, font, ...layout.fontSize, "center", layout.fill,
      { wrap: layout.wrap ?? false, stroke: layout.stroke, vertical: layout.vertical, paragraphMetrics: true });
  });
  context.signal.throwIfAborted();
  return loadImage(png);
}

function captionOverlay(layout: CaptionOverlay): MemeTemplate {
  const { key, keywords, tags, defaultText, shortcuts } = layout;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.texts.length > 1) throw new Error($t("templates.caption-overlays.text_ca30bf0191"));
    const { signal } = context;
    const [original, source] = await Promise.all([
      context.imageAsset(`${key}/${layout.art ?? "0.png"}`).then(loadImage), readTransformSource(input, signal),
    ]);
    const text = layout.caption ? layout.caption(input.texts[0], input.args) : input.texts[0] ?? defaultText;
    const art = await captionArt(original, layout, text, context);
    const { width, height } = art;
    const drawArt = (draw: CanvasRenderingContext2D) => draw.drawImage(art, 0, 0);
    if (source.frames.length === 1) {
      const avatar = (draw: CanvasRenderingContext2D) => drawAvatar(draw, source.frames[0], layout, true);
      const png = await renderMaskedRaster(width, height, layout.aboveArt ? drawArt : avatar,
        [layout.aboveArt ? avatar : drawArt], signal, { whiteBackground: true });
      const composed = await loadImage(png);
      return jpg(width, height, draw => draw.drawImage(composed, 0, 0), signal);
    }
    return renderTransformSequence(source, width, height, (draw, avatar) => {
      if (layout.aboveArt) drawArt(draw);
      drawAvatar(draw, avatar, layout, false);
      if (!layout.aboveArt) drawArt(draw);
    }, signal);
  }
  return {
    info: { key, keywords, tags, shortcuts, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: defaultText === undefined ? [] : [defaultText], args_type: null,
    } },
    render,
    async preview(context) { return render(await transformPreviewInput(context), context); },
  };
}

export const captionOverlayMemeTemplates = layouts.map(captionOverlay);
