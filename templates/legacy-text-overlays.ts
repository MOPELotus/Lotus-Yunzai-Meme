import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { drawFittedText, jpg, paper, registerFont, registerMemeTypeface } from "./template-layout.ts";

type Alignment = "left" | "center" | "right";
type Box = readonly [number, number, number, number];

interface TextOverlay {
  readonly key: string;
  readonly keyword: string;
  readonly asset: string;
  readonly defaultText?: string;
  readonly box: Box;
  readonly sizes: readonly [minimum: number, maximum: number];
  readonly wrap?: boolean;
  readonly fill?: string;
  readonly typeface?: readonly [asset: string, family: string];
  readonly lines?: Alignment;
}

// Original MemeCrafters Python layout, pinned in backend-legacy-text-overlay-assets.ts.
const overlays: readonly TextOverlay[] = [
  { key: "imprison", keyword: "坐牢", asset: "0.jpg", defaultText: $t("templates.legacy-text-overlays.text_ecf85cad14"), box: [10, 157, 230, 197], sizes: [15, 35], wrap: true },
  { key: "murmur", keyword: "低语", asset: "0.jpg", defaultText: $t("templates.legacy-text-overlays.text_e283983dad"), box: [10, 255, 430, 300], sizes: [15, 40] },
  { key: "shutup", keyword: "别说了", asset: "0.jpg", defaultText: $t("templates.legacy-text-overlays.text_46e8d25cb9"), box: [10, 180, 230, 230], sizes: [15, 40], wrap: true },
  { key: "slap", keyword: "一巴掌", asset: "0.jpg", box: [20, 450, 620, 630], sizes: [50, 110], wrap: true },
  { key: "emperor_dragon", keyword: "皇帝龙图", asset: "0.png", box: [30, 440, 485, 512], sizes: [10, 100], lines: "center", wrap: true },
  { key: "osu", keyword: "osu", asset: "osu.png", defaultText: "hso!", box: [80, 80, 432, 432],
    sizes: [80, 192], typeface: ["Aller_Bd.ttf", "LotusMemeAller"], fill: "#fff", lines: "center" },
];

function overlayTemplate(overlay: TextOverlay): MemeTemplate {
  async function render(text: string, context: MemeTemplateContext) {
    const typeface = overlay.typeface;
    const [image, preferred, fallback] = await Promise.all([
      context.imageAsset("python/meme_generator/memes/" + overlay.key + "/images/" + overlay.asset).then(loadImage),
      typeface ? registerMemeTypeface(context, typeface[0], typeface[1]) : undefined,
      registerFont(context, typeface !== undefined),
    ]);
    const font = [preferred, fallback, "sans-serif"].filter(Boolean).join(", ");
    const isJpeg = overlay.asset.endsWith(".jpg");
    const paint: Parameters<typeof jpg>[2] = draw => {
      if (isJpeg) paper(draw, image.width, image.height);
      draw.drawImage(image, 0, 0);
      drawFittedText(draw, overlay.box, text, font, ...overlay.sizes, overlay.lines ?? "left", overlay.fill, {
        wrap: overlay.wrap ?? false, paragraphMetrics: true, blockAlignment: "center",
      });
    };
    if (isJpeg) return jpg(image.width, image.height, paint, context.signal);
    context.signal.throwIfAborted();
    const imageData = await renderExactPng(image.width, image.height, paint);
    context.signal.throwIfAborted();
    return imageData.png;
  }
  return {
    info: {
      key: overlay.key, keywords: [overlay.keyword],
      params_type: { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1,
        default_texts: overlay.defaultText === undefined ? undefined : [overlay.defaultText] },
    },
    render: async (input, context) => {
      const [text] = input.texts;
      if (text === undefined || input.texts.length !== 1) throw new MemeTemplateFeedback($t("templates.legacy-text-overlays.text_36a8dabb68"));
      return render(text, context);
    },
    preview: context => render(overlay.defaultText ?? $t("templates.legacy-text-overlays.text_0d53f08678"), context),
  };
}

export const legacyTextOverlayTemplates: readonly MemeTemplate[] = overlays.map(overlayTemplate);
