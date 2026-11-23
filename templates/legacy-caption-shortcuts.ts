import { ImageData, loadImage } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { legacyCaptionShortcuts } from "../legacy-caption-shortcuts.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { drawFittedText, jpg, paper, registerFont, registerMemeTypeface, type Draw } from "./template-layout.ts";

type Box = readonly [left: number, top: number, right: number, bottom: number];
type Alignment = "left" | "center" | "right";
type Label = {
  readonly text: string;
  readonly box: Box;
  readonly sizes: readonly [minimum: number, maximum: number];
  readonly block?: Alignment;
};
interface CaptionTemplate {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly defaults: readonly string[];
  readonly labels: (text: readonly string[]) => readonly Label[];
  readonly wrap?: boolean;
  readonly white?: boolean;
  readonly stroke?: readonly [color: string, ratio: number];
  readonly alignLines?: Alignment;
  readonly typeface?: readonly [asset: string, family: string];
  readonly mask?: true;
}

function wuJingLabels([left, right]: readonly string[]): Label[] {
  const first = left?.trim().split(/\s+/u).filter(Boolean) ?? [];
  const second = right?.trim().split(/\s+/u).filter(Boolean) ?? [];
  const sizes = [50, 100] as const;
  const labels: Label[] = [
    { text: first.slice(0, -1).join(" "), box: [50, 430, 887, 550], sizes, block: "left" },
    { text: first.at(-1) ?? "", box: [20, 560, 350, 690], sizes, block: "right" },
    { text: second[0] ?? "", box: [610, 540, 917, 670], sizes, block: "left" },
    { text: second.slice(1).join(" "), box: [50, 680, 887, 810], sizes },
  ];
  return labels.filter(label => label.text);
}

// Layouts and masks from the fixed Python source; Intel uses the bundled open bold font.
const definitions: readonly CaptionTemplate[] = [
  {
    key: "high_EQ", keywords: ["高低情商", "低高情商"], defaults: ["高情商", "低情商"], white: true, stroke: ["#000", 0.05], wrap: true,
    labels: ([left, right]) => [
      { text: left!, box: [40, 540, 602, 1140], sizes: [50, 100] },
      { text: right!, box: [682, 540, 1244, 1140], sizes: [50, 100] },
    ],
  },
  {
    key: "intel_inside", keywords: ["inside"], defaults: ["intel"], white: true,
    typeface: ["Lato-Bold.ttf", "LotusMemeLatoBold"], stroke: ["#fff", 0.022],
    labels: ([text]) => [{ text: text!, box: [240, 340, 680, 580], sizes: [80, 180] }],
  },
  {
    key: "scratchcard", keywords: ["刮刮乐"], defaults: ["谢谢参与"], white: true, alignLines: "center", wrap: true, mask: true,
    labels: ([text]) => [{ text: text!, box: [80, 160, 360, 290], sizes: [30, 80] }],
  },
  {
    key: "wakeup", keywords: ["好起来了"], defaults: ["好"],
    labels: ([text]) => [
      { text: text!, box: [310, 270, 460, 380], sizes: [50, 90] },
      { text: text + "起来了", box: [50, 610, 670, 720], sizes: [70, 110] },
    ],
  },
  {
    key: "wujing", keywords: ["吴京中国"], defaults: ["不买华为不是", "人"], white: true, stroke: ["#000", 0.05],
    labels: wuJingLabels,
  },
];

function createCaptionTemplate(definition: CaptionTemplate): MemeTemplate {
  const count = definition.defaults.length;
  const prefix = "python/meme_generator/memes/" + definition.key + "/images/";
  const shortcuts = legacyCaptionShortcuts(definition.key);
  async function render(text: readonly string[], context: MemeTemplateContext) {
    if (text.length !== count) throw new MemeTemplateFeedback("该表情需要 " + count + " 段文字。");
    const typeface = definition.typeface;
    const [frame, mask, preferred, fallback] = await Promise.all([
      context.imageAsset(prefix + (definition.mask ? "0.png" : "0.jpg")).then(loadImage),
      definition.mask ? context.imageAsset(prefix + "1.png").then(loadImage) : undefined,
      typeface ? registerMemeTypeface(context, typeface[0], typeface[1]) : undefined,
      registerFont(context, typeface !== undefined),
    ]);
    const font = [preferred, fallback, "sans-serif"].filter(Boolean).join(", ");
    const { width, height } = frame;
    const paint: Draw = draw => {
      draw.drawImage(frame, 0, 0);
      for (const label of definition.labels(text)) {
        drawFittedText(draw, label.box, label.text, font, ...label.sizes, definition.alignLines ?? "left", definition.white ? "#fff" : "#000", {
          wrap: definition.wrap ?? false, paragraphMetrics: true, blockAlignment: label.block ?? "center",
          stroke: definition.stroke,
        });
      }
    };
    if (!mask) return jpg(width, height, draw => {
      paper(draw, width, height);
      paint(draw);
    }, context.signal);
    const rgba = await renderMaskedRgba(width, height, paint, [draw => draw.drawImage(mask, 0, 0)], context.signal,
      { whiteBackground: true });
    const pixels = new ImageData(new Uint8ClampedArray(rgba), width, height);
    return jpg(width, height, draw => draw.putImageData(pixels, 0, 0), context.signal);
  }
  return {
    info: {
      key: definition.key, keywords: definition.keywords, ...(shortcuts.length && { shortcuts }),
      params_type: {
        min_images: 0, max_images: 0, min_texts: count, max_texts: count, default_texts: definition.defaults,
      },
    },
    render: (input, context) => render(input.texts, context),
    preview: context => render(definition.defaults, context),
  };
}

export const legacyCaptionShortcutTemplates: readonly MemeTemplate[] = definitions.map(createCaptionTemplate);
