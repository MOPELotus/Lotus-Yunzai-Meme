import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { randomInt } from "node:crypto";
import { loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { renderExactPng, renderPng } from "@lotus-yunzai/skia";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { drawFittedText, jpg, registerFont, registerMemeTypeface, rgbaFrame, rgbaFrameDimensions } from "./template-layout.ts";

const baCharacters = [
  ["心奈", "kokona", "春原心奈", "春原心菜"],
  ["爱丽丝", "arisu", "天童爱丽丝"],
  ["泉奈", "izuna", "久田泉奈", "忍忍"],
  ["key", "key", "key"],
  ["玛丽", "mari", "伊落玛丽"],
  ["濑名", "sena", "冰室濑名"],
  ["优香", "yuuka", "早濑优香", "邮箱"],
] as const;
const baText = $t("templates.text-speech.text_c65bc162fc");
const baCharacterHelp = $t("templates.text-speech.text_cb3e26741b") + baCharacters.map(([name], index) => `${index + 1}、${name}`).join("，");
const baPositionHelp = $t("templates.text-speech.text_91d13d7223");
const noImages = { min_images: 0, max_images: 0, min_texts: 1 };

async function baSay(text: string, args: Readonly<Record<string, unknown>>, context: MemeTemplateContext) {
  const character = args.character === undefined || args.character === 0 ? randomInt(1, baCharacters.length + 1) : args.character;
  if (typeof character !== "number" || !Number.isSafeInteger(character) || character < 1 || character > baCharacters.length) {
    throw new MemeTemplateFeedback($t("templates.text-speech.text_63e3a1aef6", { "length": baCharacters.length }));
  }
  const position = args.position === "left" || args.position === "right" ? args.position : randomInt(2) ? "left" : "right";
  const [, name] = baCharacters[character - 1]!;
  const [frame, font] = await Promise.all([
    context.imageAsset(`ba_say/${name}.png`).then(loadImage), registerFont(context),
  ]);
  const { png } = await renderPng(frame.width, frame.height, draw => {
    draw.save();
    if (position === "left") {
      draw.translate(frame.width, 0);
      draw.scale(-1, 1);
    }
    draw.drawImage(frame, 0, 0);
    draw.restore();
    const box = position === "left" ? [60, 0, 580, 200] as const : [500, 0, 1020, 200] as const;
    drawFittedText(draw, box, text, font, 10, 100);
  });
  context.signal.throwIfAborted();
  return png;
}

const capooSpecs = [null, null, null, [45, 74, 112, 25], [73, 41, 42, 17], [80, 43, 36, 0],
  [80, 43, 30, 0], [78, 44, 30, 0], [78, 44, 29, 0], null] as const;
const capooText = $t("templates.text-speech.text_48953f88b7");

async function capooSay(texts: readonly string[], context: MemeTemplateContext) {
  const { signal } = context;
  const [backdrops, font] = await Promise.all([
    Promise.all(capooSpecs.map((_, index) => context.imageAsset(`capoo_say/${index}.png`).then(loadImage))),
    registerMemeTypeface(context, "FZKATJW.ttf", "LotusMemeCartoon"),
  ]);
  const { width, height } = backdrops[0]!;
  if (backdrops.some(frame => frame.width !== width || frame.height !== height)) throw new Error($t("templates.text-speech.text_01cb8a01a4"));
  const raster = rgbaFrameDimensions(width, height);
  assertMemeGifDimensions(raster.width, raster.height, texts.length * capooSpecs.length);
  const frames = [];
  for (const text of texts) {
    signal.throwIfAborted();
    const { png } = await renderExactPng(80, 80, draw => drawFittedText(draw, [0, 0, 80, 80], text, font, 20, 80));
    const label = await loadImage(png);
    for (const [index, spec] of capooSpecs.entries()) {
      const { rgba } = await rgbaFrame(width, height, draw => {
        draw.drawImage(backdrops[index]!, 0, 0);
        if (!spec) return;
        const [size, left, top, angle] = spec;
        const radians = angle * Math.PI / 180;
        const span = size / 2 * (Math.abs(Math.sin(radians)) + Math.abs(Math.cos(radians)));
        const expanded = Math.ceil(size / 2 + span) - Math.floor(size / 2 - span);
        draw.translate(left + expanded / 2, top + expanded / 2);
        draw.rotate(-radians);
        draw.imageSmoothingQuality = "high";
        draw.drawImage(label, -size / 2, -size / 2, size, size);
      }, signal);
      frames.push({ rgba, delayMs: 100 });
    }
  }
  return encodeMemeGif(raster.width, raster.height, frames, signal);
}

function jpgSpeech(
  key: string, keywords: readonly string[], tags: readonly string[], defaultText: string, path: string,
  paint: (draw: CanvasRenderingContext2D, width: number, height: number, text: string, font: string) => void,
): MemeTemplate {
  async function render(text: string, context: MemeTemplateContext) {
    const [frame, font] = await Promise.all([context.imageAsset(path).then(loadImage), registerFont(context)]);
    return jpg(frame.width, frame.height, draw => {
      draw.drawImage(frame, 0, 0);
      paint(draw, frame.width, frame.height, text, font);
    }, context.signal);
  }
  return {
    info: { key, keywords, tags, params_type: { ...noImages, max_texts: 1, default_texts: [defaultText] } },
    render: (input, context) => render(input.texts[0] ?? defaultText, context),
    preview: context => render(defaultText, context),
  };
}

export const textSpeechMemeTemplates: readonly MemeTemplate[] = [
  {
    info: {
      key: "ba_say",
      keywords: ["ba说"],
      shortcuts: baCharacters.map(([name], index) => ({ key: `${name}说`, args: ["--character", String(index + 1)] })),
      tags: ["蔚蓝档案", "碧蓝档案", ...baCharacters.flatMap(([, , ...names]) => names)],
      params_type: { ...noImages, max_texts: 1, default_texts: [baText], args_type: {
        args_model: { properties: {
          character: { type: "integer", default: 0, description: baCharacterHelp },
          position: { type: "string", default: "random", enum: ["left", "right", "random"], description: baPositionHelp },
        } },
        args_examples: baCharacters.map((_, i) => ({ character: i + 1, position: "right" })),
        parser_options: [
          { names: ["-c", "--character"], args: [{ name: "character", value: "str" }], help_text: baCharacterHelp },
          { names: ["-p", "--position"], args: [{ name: "position", value: "str" }], help_text: baPositionHelp },
          { names: ["--left", $t("templates.text-speech.text_e2e0c454e5")], dest: "position", args: [], action: { type: 0, value: "left" } },
          { names: ["--right", $t("templates.text-speech.text_14ab1f2bce")], dest: "position", args: [], action: { type: 0, value: "right" } },
        ],
      } },
    },
    render: (input, context) => baSay(input.texts[0] ?? baText, input.args, context),
    preview: context => baSay(baText, {}, context),
  },
  {
    info: { key: "capoo_say", keywords: ["咖波说"], tags: ["猫猫虫", "咖波"],
      params_type: { ...noImages, max_texts: 10, default_texts: [capooText] } },
    render: (input, context) => capooSay(input.texts.length ? input.texts : [capooText], context),
    preview: context => capooSay([capooText], context),
  },
  jpgSpeech("luotianyi_say", ["洛天依说", "天依说"], ["洛天依"], $t("templates.text-speech.text_2d6cc4d598"), "luotianyi_say/0.png",
    (draw, width, _, text, font) => drawFittedText(draw, [520, 20, width - 20, 220], text, font, 40, 140, "center", "#66ccff")),
  jpgSpeech("luxun_say", ["鲁迅说", "鲁迅说过"], [], $t("templates.text-speech.text_be4d662115"), "luxun_say/0.jpg",
    (draw, width, height, text, font) => {
      drawFittedText(draw, [40, height - 200, width - 40, height - 100], text, font, 30, 40, "center", "#fff");
      draw.fillStyle = "#fff";
      draw.font = `30px ${font}`;
      draw.textAlign = "left";
      draw.textBaseline = "top";
      draw.fillText($t("templates.text-speech.text_834f657029"), 320, 400);
    }),
];
