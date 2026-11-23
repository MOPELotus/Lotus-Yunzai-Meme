// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { randomInt } from "node:crypto";
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng, renderPng } from "@lotus-yunzai/skia";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { drawFittedText, jpg, registerFont, registerMemeTypeface } from "./template-layout.ts";

type Pair = readonly [number, number];
type Box = readonly [number, number, number, number];
type SignLayout = {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags: readonly string[];
  readonly text: string;
  readonly box: Box;
  readonly color: string;
  readonly size: readonly [minimum: number, maximum: number];
  readonly font?: "child" | "diary";
};

const layouts: readonly SignLayout[] = [
  { key: "bronya_holdsign", keywords: ["布洛妮娅举牌", "大鸭鸭举牌"], tags: ["米哈游", "崩坏3", "布洛妮娅·扎伊切克"],
    text: "V我50", box: [190, 675, 640, 930], color: "#6f5f5f", size: [25, 60] },
  { key: "nekoha_holdsign", keywords: ["猫羽雫举牌", "猫猫举牌"], tags: ["猫羽雫"],
    text: "V我50", box: [210, 520, 570, 765], color: "#486ead", size: [25, 65], font: "child" },
  { key: "nijika_holdsign", keywords: ["伊地知虹夏举牌", "虹夏举牌"], tags: [],
    text: "你可少看点二次元吧", box: [57, 279, 249, 405], color: "#6f5f5f", size: [25, 60], font: "diary" },
];

const fireflyLayouts: readonly (readonly [Pair, Pair, ProjectiveQuad])[] = [
  [[300, 200], [144, 322], [[0, 66], [276, 0], [319, 178], [43, 244]]],
  [[300, 250], [-46, -50], [[0, 83], [312, 0], [348, 243], [46, 314]]],
  [[300, 150], [106, 351], [[0, 0], [286, 0], [276, 149], [12, 149]]],
  [[250, 200], [245, -6], [[31, 0], [288, 49], [256, 239], [0, 190]]],
  [[500, 200], [0, 0], [[0, 0], [492, 0], [462, 198], [25, 198]]],
  [[350, 150], [74, 359], [[0, 52], [345, 0], [364, 143], [31, 193]]],
  [[270, 200], [231, -9], [[31, 0], [305, 49], [270, 245], [0, 192]]],
  [[350, 150], [64, 340], [[0, 44], [345, 0], [358, 153], [34, 197]]],
  [[230, 100], [57, 261], [[10, 0], [243, 38], [222, 132], [0, 99]]],
  [[240, 150], [-24, -20], [[0, 32], [235, 0], [254, 146], [24, 182]]],
  [[230, 140], [133, -35], [[40, 0], [267, 68], [227, 203], [0, 133]]],
  [[169, 124], [107, 236], [[0, 0], [169, 0], [169, 124], [0, 124]]],
  [[210, 140], [156, -7], [[24, 0], [227, 32], [204, 172], [0, 136]]],
  [[250, 123], [53, 237], [[0, 3], [250, 0], [250, 123], [0, 123]]],
  [[200, 140], [168, -9], [[29, 0], [222, 40], [192, 177], [0, 135]]],
  [[256, 96], [50, 264], [[0, 0], [256, 0], [256, 96], [0, 96]]],
  [[120, 200], [174, 130], [[116, 0], [240, 67], [117, 269], [0, 195]]],
  [[250, 140], [-42, -27], [[0, 77], [244, 0], [288, 132], [42, 210]]],
  [[230, 130], [-64, -42], [[0, 110], [229, 0], [294, 126], [64, 245]]],
  [[183, 133], [0, 227], [[0, 0], [183, 9], [183, 133], [0, 133]]],
  [[255, 106], [50, 254], [[2, 4], [256, 0], [257, 106], [0, 106]]],
];

function signFont(context: MemeTemplateContext, font?: SignLayout["font"]) {
  switch (font) {
    case "child": return registerMemeTypeface(context, "FZSEJW.ttf", "LotusMemeChild");
    case "diary": return registerMemeTypeface(context, "FZSJ-QINGCRJ.ttf", "LotusMemeDiary");
    default: return registerFont(context);
  }
}

function project(draw: CanvasRenderingContext2D, image: Image, offset: Pair, corners: ProjectiveQuad) {
  draw.save();
  draw.translate(...offset);
  draw.transform(screenProjection(image.width, image.height, corners));
  draw.imageSmoothingQuality = "high";
  draw.drawImage(image, 0, 0);
  draw.restore();
}

async function perspectiveText(
  text: string, size: Pair, padding: number, fontSize: Pair, color: string, context: MemeTemplateContext, blur = false,
) {
  const [width, height] = size;
  const font = await signFont(context, "child");
  const { png } = await renderExactPng(width, height, draw => {
    drawFittedText(draw, [padding, padding, width - padding, height - padding], text, font, ...fontSize, "center", color);
  });
  context.signal.throwIfAborted();
  const image = await loadImage(png);
  if (!blur) return image;
  return loadImage((await renderExactPng(width, height, draw => {
    draw.filter = "blur(1px)";
    draw.drawImage(image, 0, 0);
  })).png);
}

const fontAndTextOnly = (text: string) => ({
  min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [text],
});

function staticSign(spec: SignLayout): MemeTemplate {
  const { key, text, keywords, tags, box, size, color } = spec;
  async function render(value: string, context: MemeTemplateContext) {
    const [frame, font] = await Promise.all([
      context.imageAsset(`${key}/0.jpg`).then(loadImage),
      signFont(context, spec.font),
    ]);
    return jpg(frame.width, frame.height, draw => {
      draw.drawImage(frame, 0, 0);
      drawFittedText(draw, box, value, font, ...size, "center", color);
    }, context.signal);
  }
  return {
    info: { key, keywords, tags, params_type: fontAndTextOnly(text) },
    render: (input, context) => render(input.texts[0] ?? text, context),
    preview: context => render(text, context),
  };
}

const ayachiText = "我控制不住自己啊";
async function ayachiSign(text: string, context: MemeTemplateContext) {
  const [frame, label] = await Promise.all([
    context.imageAsset("ayachi_holdsign/0.png").then(loadImage),
    perspectiveText(text, [600, 350], 20, [80, 150], "#51201b", context, true),
  ]);
  return jpg(frame.width, frame.height, draw => {
    draw.drawImage(frame, 0, 0);
    project(draw, label, [125, 307], [[0, 235], [523, 0], [659, 297], [170, 536]]);
  }, context.signal);
}

const fireflyText = "我超爱你";
const fireflyNumberHelp = "图片编号，范围为 1~21";
async function fireflySign(text: string, number: unknown, context: MemeTemplateContext) {
  const variant = number === undefined || number === 0 ? randomInt(1, fireflyLayouts.length + 1) : number;
  if (typeof variant !== "number" || !Number.isSafeInteger(variant) || variant < 1 || variant > fireflyLayouts.length) {
    throw new MemeTemplateFeedback("图片编号错误，请选择 1~21");
  }
  const [size, offset, corners] = fireflyLayouts[variant - 1]!;
  const [frame, label] = await Promise.all([
    context.imageAsset(`firefly_holdsign/${String(variant).padStart(2, "0")}.png`).then(loadImage),
    perspectiveText(text, size, 10, [30, 80], "#3b0b07", context),
  ]);
  context.signal.throwIfAborted();
  const { png } = await renderPng(frame.width, frame.height, draw => {
    draw.drawImage(frame, 0, 0);
    project(draw, label, offset, corners);
  });
  context.signal.throwIfAborted();
  return png;
}

export const textSignMemeTemplates: readonly MemeTemplate[] = [
  ...layouts.map(staticSign),
  {
    info: { key: "ayachi_holdsign", keywords: ["宁宁举牌"], tags: ["柚子社", "魔女的夜宴", "绫地宁宁"],
      params_type: fontAndTextOnly(ayachiText) },
    render: (input, context) => ayachiSign(input.texts[0] ?? ayachiText, context),
    preview: context => ayachiSign(ayachiText, context),
  },
  {
    info: { key: "firefly_holdsign", keywords: ["流萤举牌"], tags: ["米哈游", "崩坏：星穹铁道", "流萤"],
      params_type: { ...fontAndTextOnly(fireflyText), args_type: {
        args_model: { properties: { number: { type: "integer", default: 0, description: fireflyNumberHelp } } },
        parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: fireflyNumberHelp }],
      } } },
    render: (input, context) => fireflySign(input.texts[0] ?? fireflyText, input.args.number, context),
    preview: context => fireflySign(fireflyText, undefined, context),
  },
];
