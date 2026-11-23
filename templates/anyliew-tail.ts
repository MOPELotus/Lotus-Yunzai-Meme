// Layouts and option ranges from the fixed AnyLiew registrations in backend-anyliew-tail-assets.ts.
import { randomInt } from "node:crypto";
import { ImageData, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, paper, registerFont, registerMemeTypeface, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { readTransformSource, transformPreviewInput } from "./transforms.ts";

const yuzu = ["柚子社"];
const fonts = {
  child: ["FZSEJW.ttf", "LotusMemeChild"],
  diary: ["FZSJ-QINGCRJ.ttf", "LotusMemeDiary"],
  cartoon: ["FZKATJW.ttf", "LotusMemeCartoon"],
  slender: ["FZXS14.ttf", "LotusMemeSlender"],
} as const;
type Box = readonly [number, number, number, number];

interface Caption {
  readonly box: Box;
  readonly sizes: readonly [number, number];
  readonly font?: keyof typeof fonts;
  readonly centerLines?: boolean;
  readonly color?: string;
  readonly emoji?: boolean;
  readonly wrap?: false;
}

interface Labelled {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
}

interface ImageBackdrop {
  readonly file: string;
  readonly box: Box;
}

interface Scene extends Labelled {
  readonly frames: readonly ImageBackdrop[];
  // The old catalog kept an optional text slot for some frames whose source draws only an image.
  readonly optionalText?: true;
  readonly fit?: "cover" | "circle";
  readonly rotation?: number;
  readonly grayscale?: true;
  readonly avatarOnTop?: true;
  readonly caption?: Caption & { readonly message: (name: string) => string };
}

interface TextScene extends Labelled {
  readonly frames: readonly (Caption & { readonly file: string })[];
  readonly text: string;
}

const scenes: readonly Scene[] = [
  { key: "up_to", keywords: ["干嘛"], optionalText: true, frames: [{ file: "0.png", box: [0, 0, 960, 960] }] },
  { key: "widow", keywords: ["未亡人"], grayscale: true, rotation: 21, frames: [{ file: "0.png", box: [162, 200, 210, 215] }],
    caption: { box: [3, 877, 925, 1030], sizes: [15, 60], font: "slender", emoji: true, wrap: false,
      message: name => `祭祀者:安心去吧,${name}桑[さん]\n你最❤️愛の妻子[未亡人]我会好好照顾的\n${name}你去了冥界也要保佑我们` } },
  { key: "xiluo_disgust", keywords: ["希罗嫌弃", "二阶堂希罗嫌弃"], optionalText: true, fit: "cover", rotation: 8,
    tags: ["魔法少女的魔女审判", "二阶堂希罗"], frames: [{ file: "0.png", box: [0, 75, 500, 800] }] },
  { key: "xueli_think", keywords: ["雪莉想", "雪梨想", "橘雪莉想"], optionalText: true, fit: "cover",
    tags: ["魔法少女的魔女审判", "橘雪莉"], frames: [{ file: "0.png", box: [0, 0, 824, 824] }] },
  { key: "yuzu_soft_ayachi_nene", keywords: ["宁宁困惑", "绫地宁宁困惑"], tags: ["柚子社", "绫地宁宁"], rotation: -45,
    frames: [{ file: "0.png", box: [500, 410, 165, 165] }],
    caption: { box: [0, 0, 716, 128], sizes: [20, 150], message: name => `${name},这是你的照片吗？` } },
  { key: "yuzu_soft_murasame_hug", keywords: ["丛雨抱"], tags: yuzu, fit: "circle", frames: [
    { file: "1.png", box: [20, 146, 118, 118] },
    { file: "2.png", box: [23, 185, 156, 156] },
    { file: "3.png", box: [24, 188, 156, 156] },
  ] },
  { key: "yuzu_soft_murasame_husband", keywords: ["丛雨老公"], tags: yuzu, fit: "circle", optionalText: true, avatarOnTop: true,
    frames: [{ file: "0.png", box: [160, 40, 200, 200] }] },
];

const textScenes: readonly TextScene[] = [
  { key: "white_cat_say", keywords: ["白猫说"], text: "宝贝~", frames: [
    { file: "1.png", box: [55, 20, 215, 91], sizes: [10, 200], font: "child", centerLines: true },
    { file: "2.png", box: [100, 16, 488, 188], sizes: [10, 200], font: "child", centerLines: true },
  ] },
  { key: "xueli_say", keywords: ["雪莉说", "雪梨说", "橘雪莉说"], text: "你是高手？",
    frames: [{ file: "0.jpg", box: [240, 30, 300, 240], sizes: [10, 120], font: "child" }] },
  { key: "yuzu_soft_murasame_blackboard", keywords: ["丛雨黑板"], tags: yuzu, text: "不要再涩涩了",
    frames: [{ file: "0.jpg", box: [351, 128, 1119, 326], sizes: [20, 150], color: "#fff", font: "diary" }] },
  { key: "yuzu_soft_murasame_say", keywords: ["丛雨说"], tags: yuzu, text: "非酋，不要再涩涩了",
    frames: [{ file: "0.jpg", box: [922, 0, 1275, 659], sizes: [20, 150], font: "cartoon" }] },
];

function numberOption(count: number) {
  if (count === 1) return null;
  const help = `图片编号，0 随机，1～${count} 指定底图`;
  return {
    args_model: { properties: { number: { type: "integer", default: 0, description: help } } },
    parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: help }],
  };
}

function selectFrame<F>(frames: readonly F[], number: unknown): F {
  if (frames.length === 1) return frames[0]!;
  if (number === undefined || number === 0) return frames[randomInt(frames.length)]!;
  if (typeof number === "number" && Number.isSafeInteger(number) && number >= 1 && number <= frames.length) return frames[number - 1]!;
  throw new MemeTemplateFeedback(`图片编号错误，请选择 1～${frames.length} 或 0（随机）`);
}

function loadFrame(context: MemeTemplateContext, key: string, file: string) {
  return context.imageAsset(`anyliew/emoji/${key}/images/${file}`).then(loadImage);
}

async function captionFont(context: MemeTemplateContext, caption: Caption) {
  const font = caption.font && fonts[caption.font];
  const families = await Promise.all([
    font && registerMemeTypeface(context, font[0], font[1]), registerFont(context),
    caption.emoji && registerMemeTypeface(context, "NotoColorEmoji.ttf", "LotusMemeColorEmoji"),
  ]);
  return [...families.filter(Boolean), "sans-serif"].join(", ");
}

function paintCaption(draw: CanvasRenderingContext2D, caption: Caption, text: string, family: string) {
  const [left, top, right, bottom] = caption.box;
  const [minimum, maximum] = caption.sizes;
  const available = right - left;
  draw.fillStyle = caption.color ?? "#000";
  draw.textAlign = caption.centerLines ? "center" : "left";
  draw.textBaseline = "alphabetic";
  draw.textWrap = true;
  for (let size = maximum; size >= minimum; size--) {
    draw.font = `${size}px ${family}`;
    const unwrapped = draw.measureText(text);
    const wrap = caption.wrap !== false && unwrapped.lines.some(line => line.width > available) ? available : undefined;
    const { lines } = wrap ? draw.measureText(text, wrap) : unwrapped;
    const first = lines[0], last = lines.at(-1);
    if (!first || !last) return;
    const height = Math.round(last.descent - first.ascent);
    const width = Math.max(...lines.map(line => line.width));
    if (width > available || height > bottom - top) continue;
    const x = (left + right - width + (caption.centerLines ? wrap ?? width : 0)) / 2;
    draw.fillText(text, x, top + (bottom - top - height) / 2 - first.ascent, wrap);
    return;
  }
  throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
}

async function prepareAvatar(image: Image, width: number, height: number, scene: Scene, signal: AbortSignal) {
  if (!scene.fit && !scene.grayscale) return image;
  const circle = scene.fit === "circle";
  const side = Math.min(image.width, image.height);
  const { png } = await renderExactPng(circle ? side : width, circle ? side : height, draw => {
    draw.imageSmoothingQuality = "high";
    if (circle) {
      draw.beginPath();
      draw.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
      draw.clip();
      draw.drawImage(image, Math.trunc((side - image.width) / 2), Math.trunc((side - image.height) / 2));
    } else if (scene.fit === "cover") {
      const scale = Math.max(width / image.width, height / image.height);
      const w = Math.max(width, Math.trunc(image.width * scale)), h = Math.max(height, Math.trunc(image.height * scale));
      draw.drawImage(image, Math.floor((width - w) / 2), Math.floor((height - h) / 2), w, h);
    } else {
      draw.drawImage(image, 0, 0, width, height);
      const pixels = draw.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const gray = Math.round(pixels.data[i]! * 0.299 + pixels.data[i + 1]! * 0.587 + pixels.data[i + 2]! * 0.114);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
        pixels.data[i + 3] = 255;
      }
      draw.putImageData(pixels, 0, 0);
    }
  });
  signal.throwIfAborted();
  return loadImage(png);
}

function drawAvatar(draw: CanvasRenderingContext2D, image: Image, box: Box, rotation?: number) {
  const [left, top, width, height] = box;
  draw.imageSmoothingQuality = "high";
  if (!rotation) {
    draw.drawImage(image, left, top, width, height);
    return;
  }
  const angle = -rotation * Math.PI / 180;
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const expansion = (size: number, rotated: number) => (Math.ceil((size + rotated) / 2) - Math.floor((size - rotated) / 2)) / 2;
  draw.translate(left + expansion(width, width * cos + height * sin), top + expansion(height, width * sin + height * cos));
  draw.rotate(angle);
  draw.drawImage(image, -width / 2, -height / 2, width, height);
}

function avatarScene(scene: Scene): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    const { signal } = context;
    const selected = selectFrame(scene.frames, input.args.number);
    const caption = scene.caption;
    const user = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
    const name = input.texts[0] ?? ((typeof user?.name === "string" && user.name) || (user && user.gender !== "male" ? "她" : "他"));
    const [sequence, frame, family] = await Promise.all([
      readTransformSource(input, signal), loadFrame(context, scene.key, selected.file), caption && captionFont(context, caption),
    ]);
    const { width, height } = rgbaFrameDimensions(frame.width, frame.height);
    async function raster(source: Image, w: number, h: number) {
      const prepared = await prepareAvatar(source, selected.box[2], selected.box[3], scene, signal);
      const scaleDraw = (paint: Draw): Draw => draw => {
        draw.scale(w / frame.width, h / frame.height);
        paint(draw);
      };
      const face = scaleDraw(draw => drawAvatar(draw, prepared, selected.box, scene.rotation));
      const backdrop = scaleDraw(draw => {
        draw.drawImage(frame, 0, 0);
        if (caption && family) paintCaption(draw, caption, caption.message(name), family);
      });
      return scene.avatarOnTop ? renderMaskedRgba(w, h, backdrop, [face], signal)
        : renderMaskedRgba(w, h, () => {}, [face, backdrop], signal);
    }
    if (sequence.frames.length === 1) {
      const rgba = await raster(sequence.frames[0], width, height);
      const pixels = new ImageData(new Uint8ClampedArray(rgba), width, height);
      const png = await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0));
      signal.throwIfAborted();
      return png.png;
    }
    const delayMs = Math.floor(sequence.averageDelayMs / 10) * 10;
    return renderPythonGif({ width, height, signal, frames: sequence.frames.map(value => ({ value, delayMs })), renderFrame: raster });
  }
  return {
    info: { key: scene.key, keywords: scene.keywords, tags: scene.tags, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: Number(!!(scene.caption || scene.optionalText)),
      args_type: numberOption(scene.frames.length),
    } },
    render,
    preview: async context => render(await transformPreviewInput(context), context),
  };
}

function textScene(scene: TextScene): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    const caption = selectFrame(scene.frames, input.args.number);
    const [frame, family] = await Promise.all([loadFrame(context, scene.key, caption.file), captionFont(context, caption)]);
    return jpg(frame.width, frame.height, draw => {
      paper(draw, frame.width, frame.height);
      draw.drawImage(frame, 0, 0);
      paintCaption(draw, caption, input.texts[0] ?? scene.text, family);
    }, context.signal);
  }
  return {
    info: { key: scene.key, keywords: scene.keywords, tags: scene.tags, params_type: {
      min_images: 0, max_images: 0, min_texts: 1, max_texts: 1,
      default_texts: [scene.text], args_type: numberOption(scene.frames.length),
    } },
    render,
    preview: context => render({ images: [], texts: [], args: {} }, context),
  };
}

export const anyliewTailTemplates = [...scenes.map(avatarScene), ...textScenes.map(textScene)];
