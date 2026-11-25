import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { avatarNameParts, mahiroLayers, psyduckLayers } from "./legacy-chat-card-layouts.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { screenProjection } from "./projective-transform.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont, registerMemeTypeface, rotateExpanded, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

const avatarFields = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1 };
const circleHelp = $t("templates.legacy-chat-cards.text_bd6b1d72aa");
const circle = {
  args_model: { properties: { circle: { default: false, type: "boolean", description: circleHelp } } },
  args_examples: [{ circle: false }, { circle: true }],
  parser_options: [{ names: ["--circle", $t("templates.legacy-chat-cards.text_82d06faea1")], dest: "circle", args: [], action: { type: 0, value: true }, help_text: circleHelp }],
};
type DrawContext = Parameters<Draw>[0];
type Box = readonly [number, number, number, number];

function crop(image: Image, width: number, height: number) {
  const ratio = Math.max(width / image.width, height / image.height);
  const w = Math.max(width, Math.trunc(image.width * ratio));
  const h = Math.max(height, Math.trunc(image.height * ratio));
  return { w, h, x: Math.trunc((width - w) / 2), y: Math.trunc((height - h) / 2) };
}

function cover(draw: DrawContext, image: Image, left: number, top: number, width: number, height: number, rounded = false) {
  const { w, h, x, y } = crop(image, width, height);
  draw.save();
  draw.beginPath();
  if (rounded) draw.arc(left + width / 2, top + height / 2, width / 2, 0, Math.PI * 2);
  else draw.rect(left, top, width, height);
  draw.clip();
  draw.imageSmoothingQuality = "high";
  draw.drawImage(image, left + x, top + y, w, h);
  draw.restore();
}

function fontText(draw: DrawContext, box: Box, text: string, font: string, min: number, max: number,
  { color = "black", align = "left", justify = "center", wrap = false, vertical = "center", stroke }:
    { color?: string; align?: "left" | "center"; justify?: "left" | "center"; wrap?: boolean;
      vertical?: "center" | "bottom"; stroke?: readonly [string, number] } = {}) {
  drawFittedText(draw, box, text, font, min, max, align, color,
    { wrap, paragraphMetrics: true, blockAlignment: justify, vertical, stroke });
}

function photo(context: MemeTemplateContext, key: string, file: string) {
  return context.imageAsset(`python/meme_generator/memes/${key}/images/${file}`).then(loadImage);
}

function nameFrom(args: Readonly<Record<string, unknown>>, fallback?: string) {
  const user = Array.isArray(args.user_infos) ? args.user_infos[0] as { gender?: unknown; name?: unknown } | undefined : undefined;
  if (typeof user?.name === "string" && user.name) return user.name;
  return user?.gender === "male" && fallback ? $t("templates.legacy-chat-cards.text_8b7b91e000") : fallback;
}

async function avatarPreview(template: MemeTemplate, context: MemeTemplateContext, texts: string[] = []) {
  return template.render({ images: [await previewImage(context.signal)], texts, args: {} }, context);
}

function policeTemplate(alternate: boolean): MemeTemplate {
  const template: MemeTemplate = {
    info: {
      key: alternate ? "police1" : "police", keywords: [alternate ? "警察" : "出警"],
      params_type: { ...avatarFields, max_texts: alternate ? 0 : 1, default_texts: alternate ? [] : [$t("templates.legacy-chat-cards.text_fcdfeb01a5")], args_type: null },
    },
    async render({ images, texts }, context) {
      const { signal } = context;
      const [background, avatar, font] = await Promise.all([
        photo(context, "police", alternate ? "1.png" : "0.png"),
        readMemeFirstImage(images[0]!, signal),
        alternate ? undefined : registerMemeTypeface(context, "NotoSerifSC-Regular.otf", "LotusMemeNotoSerif"),
      ]);
      const { width, height } = background;
      const composite = await loadImage(await renderMaskedRaster(width, height, draw => {
        if (alternate) {
          draw.translate(37, 291);
          rotateExpanded(draw, 60, 75, 16);
          cover(draw, avatar, 0, 0, 60, 75);
        } else {
          cover(draw, avatar, 224, 46, 245, 245);
        }
      }, [draw => draw.drawImage(background, 0, 0)], signal, { whiteBackground: true }));
      return jpg(width, height, draw => {
        draw.drawImage(composite, 0, 0);
        if (font) fontText(draw, [220, 395, 470, 480], texts[0] ?? $t("templates.legacy-chat-cards.text_fcdfeb01a5"), font, 20, 60);
      }, signal);
    },
    preview: context => avatarPreview(template, context),
  };
  return template;
}

const call: MemeTemplate = {
  info: { key: "you_should_call", keywords: ["致电", "你应该致电"], params_type: { ...avatarFields, args_type: null } },
  async render(input, context) {
    const { signal } = context;
    const [background, sequence, font] = await Promise.all([
      photo(context, "you_should_call", "0.png"), readTransformSource(input, signal), registerFont(context),
    ]);
    const name = input.texts[0] ?? nameFrom(input.args, $t("templates.legacy-chat-cards.text_2ab425e0c6"));
    return renderTransformSequence(sequence, background.width, background.height, (draw, avatar) => {
      draw.drawImage(background, 0, 0);
      fontText(draw, [50, 20, 700, 130], $t("templates.legacy-chat-cards.text_392e677276") + name, font, 20, 70, { vertical: "bottom" });
      cover(draw, avatar, 400, 190, 300, 300, true);
    }, signal);
  },
  async preview(context) {
    return call.render(await transformPreviewInput(context), context);
  },
};

const captcha: MemeTemplate = {
  info: { key: "google_captcha", keywords: ["谷歌验证码"], params_type: { ...avatarFields, args_type: null } },
  async render({ images, texts, args }, context) {
    const name = texts[0] ?? nameFrom(args);
    if (!name) throw new MemeTemplateFeedback($t("templates.legacy-chat-cards.text_76b8e87b81"));
    const { signal } = context;
    const [avatar, font] = await Promise.all([readMemeFirstImage(images[0]!, signal), registerFont(context, true)]);
    const { w, h, x, y } = crop(avatar, 932, 932);
    return jpg(1004, 1539, draw => {
      const banner = "#4790e4", edge = "#d5d5d5";
      draw.fillStyle = edge;
      draw.fillRect(0, 0, 1004, 1539);
      draw.fillStyle = "white";
      draw.fillRect(2, 2, 1000, 1535);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const left = 21 + i * 243, top = 372 + j * 243;
        draw.save();
        draw.beginPath();
        draw.rect(left, top, 233, 233);
        draw.clip();
        draw.imageSmoothingQuality = "high";
        draw.drawImage(avatar, left + x - i * 233, top + y - j * 233, w, h);
        draw.restore();
      }
      draw.fillStyle = edge;
      draw.fillRect(2, 1355, 1000, 2);
      draw.fillStyle = banner;
      draw.fillRect(21, 21, 962, 332);
      draw.fillRect(689, 1387, 283, 121);
      const style = { color: "white", justify: "left" } as const;
      fontText(draw, [91, 81, 921, 141], $t("templates.legacy-chat-cards.text_42185ee108"), font, 12, 40, style);
      fontText(draw, [91, 141, 921, 231], name, font, 12, 80, style);
      fontText(draw, [91, 231, 921, 291], $t("templates.legacy-chat-cards.text_5075851a68"), font, 12, 40, style);
      fontText(draw, [689, 1387, 972, 1508], $t("templates.legacy-chat-cards.text_fc50a99caa"), font, 12, 40, { color: "white", align: "center" });
    }, signal);
  },
  preview: context => avatarPreview(captcha, context, [$t("templates.legacy-chat-cards.text_0d53f08678")]),
};

function kingCaptions(texts: readonly string[], avatars: number, count: number) {
  if (!texts.length) return { words: [$t("templates.legacy-chat-cards.text_2b7f95d215")], title: $t("templates.legacy-chat-cards.text_1dc8dca7ed") };
  if (texts.length === 1) {
    return avatars === 1 ? { words: [texts[0]!], title: $t("templates.legacy-chat-cards.text_aae590df38", { "value1": texts[0]!.repeat(2) }) } : { words: [], title: texts[0]! };
  }
  const groups = texts.slice(0, -1);
  const repetitions = Math.ceil(count / groups.length);
  return { words: groups.flatMap(word => Array<string>(repetitions).fill(word)), title: texts.at(-1)! };
}

const king: MemeTemplate = {
  info: { key: "jiji_king", keywords: ["急急国王"], params_type: { ...avatarFields, max_images: 11, max_texts: 11, args_type: circle } },
  async render({ images, texts, args }, context) {
    const { signal } = context;
    const [background, font, ...avatars] = await Promise.all([
      photo(context, "jiji_king", "0.png"), registerFont(context, true), ...images.map(file => readMemeFirstImage(file, signal)),
    ]);
    const largest = Math.max(images.length, texts.length);
    const count = largest >= 7 ? largest - 1 : 5;
    const width = 10 + 100 * count;
    const { words, title } = kingCaptions(texts, avatars.length, count);
    const blocks = avatars.slice(1);
    const size = blocks.length || words.length;
    const copies = Math.ceil(count / size);
    return jpg(width, 400, draw => {
      paper(draw, width, 400);
      const left = Math.floor((width - background.width) / 2);
      draw.drawImage(background, left, 0);
      cover(draw, avatars[0]!, left + 237, 5, 125, 125, args.circle === true);
      for (let i = 0; i < count; i++) {
        const index = Math.floor(i / copies);
        const x = 10 + 100 * i;
        if (blocks.length) cover(draw, blocks[index]!, x, 200, 90, 90);
        else {
          draw.fillStyle = "black";
          draw.fillRect(x, 200, 90, 90);
          fontText(draw, [x, 200, x + 90, 290], words[index]!, font, 30, 60, { color: "white", align: "center" });
        }
      }
      fontText(draw, [10, 300, width - 10, 390], title, font, 30, 100, { align: "center" });
    }, signal);
  },
  preview: context => avatarPreview(king, context),
};

function choose(items: readonly string[]) {
  return items[Math.floor(Math.random() * items.length)]!;
}

function drawNameText(draw: DrawContext, top: number, text: string, font: string, size: number, color: string, stroke = 0) {
  draw.font = `${size}px ${font}`;
  draw.textBaseline = "alphabetic";
  const y = top - (draw.measureText(text).lines[0]?.ascent ?? -size) + stroke;
  draw.fillStyle = color;
  if (stroke) {
    draw.strokeStyle = "white";
    draw.lineJoin = "round";
    draw.lineWidth = stroke * 2;
    draw.strokeText(text, 20 + stroke, y);
  }
  draw.fillText(text, 20 + stroke, y);
}

const nameGenerator: MemeTemplate = {
  info: {
    key: "name_generator", keywords: ["亚文化取名机", "亚名"],
    params_type: { ...avatarFields, max_texts: 0, args_type: null },
  },
  async render({ images }, context) {
    const { signal } = context;
    const [title, avatar, font] = await Promise.all([
      photo(context, "name_generator", "title.png"), readMemeFirstImage(images[0]!, signal), registerFont(context, true),
    ]);
    const color = choose(["#0000ff", "#ff00f7", "#00cc66"]);
    const name = avatarNameParts.map(choose).join("");
    return jpg(900, 900, draw => {
      draw.fillStyle = "#e1e1e1";
      draw.fillRect(0, 0, 900, 900);
      draw.imageSmoothingQuality = "high";
      draw.drawImage(title, 100, 0, 700, 200);
      cover(draw, avatar, 310, 235, 490, 490);
      drawNameText(draw, 450, $t("templates.legacy-chat-cards.text_f48df74142"), font, 40, "#696969");
      drawNameText(draw, 620, name, font, 60, color, 4);
    }, signal);
  },
  preview: context => avatarPreview(nameGenerator, context),
};

const animated = [
  {
    key: "blamed_mahiro", keyword: "真寻挨骂", defaults: [$t("templates.legacy-chat-cards.text_4c00407b04")], tags: ["绪山真寻", "别当欧尼酱了"],
    layers: mahiroLayers, extension: "png", delayMs: 80, size: [400, 80] as const, typeface: ["FZKATJW.ttf", "LotusMemeKuaiLe"] as const,
  },
  {
    key: "psyduck", keyword: "可达鸭", defaults: [$t("templates.legacy-chat-cards.text_6a831661dd"), $t("templates.legacy-chat-cards.text_b5e8ee74bf")], tags: [],
    layers: psyduckLayers, extension: "jpg", delayMs: 200, size: [155, 100] as const, typeface: ["FZSJ-QINGCRJ.ttf", "LotusMemeWenKai"] as const,
  },
];

function captionAnimation(spec: typeof animated[number]): MemeTemplate {
  const template: MemeTemplate = {
    info: {
      key: spec.key, keywords: [spec.keyword], tags: spec.tags,
      params_type: { min_images: 0, max_images: 0, min_texts: spec.defaults.length, max_texts: spec.defaults.length, default_texts: spec.defaults, args_type: null },
    },
    async render({ texts }, context) {
      const { signal } = context;
      const [font, ...backgrounds] = await Promise.all([
        registerMemeTypeface(context, spec.typeface[0], spec.typeface[1]),
        ...spec.layers.map((_, i) => photo(context, spec.key, `${i}.${spec.extension}`)),
      ]);
      const [width, height] = spec.size;
      const captionImages = await Promise.all(spec.defaults.map(async (fallback, index) => {
        const { png } = await renderExactPng(width, height, draw => {
          const text = texts[index] ?? fallback;
          if (spec.key === "blamed_mahiro") {
            fontText(draw, [0, -5, 350, 85], text, font, 60, 80, {
              color: "#6c3c52", justify: "left", stroke: ["white", 0.01],
            });
          } else {
            fontText(draw, [5, 5, 150, 95], text, font, 30, 80, { wrap: true });
          }
        });
        return loadImage(png);
      }));
      const raster = rgbaFrameDimensions(backgrounds[0]!.width, backgrounds[0]!.height);
      return renderPythonCanvasGif({
        ...raster, signal, frames: backgrounds.map((_, index) => ({ value: index, delayMs: spec.delayMs })),
        drawFrame(index, draw) {
          draw.drawImage(backgrounds[index]!, 0, 0);
          const layer = spec.layers[index];
          if (!layer) return;
          const [quad, [x, y], captionIndex = 0] = layer;
          draw.translate(x, y);
          draw.beginPath();
          const xs = quad.map(([px]) => px), ys = quad.map(([, py]) => py);
          draw.rect(0, 0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          draw.clip();
          draw.setTransform(draw.getTransform().multiply(screenProjection(width, height, quad)));
          draw.imageSmoothingQuality = "high";
          draw.drawImage(captionImages[captionIndex]!, 0, 0);
        },
      });
    },
    preview: context => template.render({ images: [], texts: spec.defaults, args: {} }, context),
  };
  return template;
}

// The first two projected Mahiro text layers collapse to a line in the fixed original.
export const legacyChatCardTemplates = [policeTemplate(false), policeTemplate(true), call, captcha, king, nameGenerator, ...animated.map(captionAnimation)];
