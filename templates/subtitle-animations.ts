import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Subtitle windows and caption sizes follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/blob/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes/gif_subtitle/__init__.py
import { renderExactPng } from "../../../packages/skia/index.ts";
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { drawFittedText, registerFont } from "./template-layout.ts";

type Slice = readonly [start: number, end: number];

interface SubtitleSpec {
  readonly key: string;
  readonly keyword: string;
  readonly windows: readonly Slice[];
  readonly captions: readonly string[];
  readonly delayMs: number;
  readonly fontSize?: number;
}

// Pillow's source template takes the last frame's duration for every output
// frame. This includes sources whose original GIF mixes 120 and 130 ms.
const specs: readonly SubtitleSpec[] = [
  { key: "wangjingze", keyword: "王境泽", delayMs: 130, windows: [[0, 9], [12, 24], [25, 35], [37, 48]],
    captions: [$t("templates.subtitle-animations.text_89cf0a8523"), $t("templates.subtitle-animations.text_d11b69341b"), $t("templates.subtitle-animations.text_c639a80d36"), $t("templates.subtitle-animations.text_aed755f855")] },
  { key: "weisuoyuwei", keyword: "为所欲为", delayMs: 120, fontSize: 19,
    windows: [[11, 14], [27, 38], [42, 61], [63, 81], [82, 95], [96, 105], [111, 131], [145, 157], [157, 167]],
    captions: [$t("templates.subtitle-animations.text_2ce2464352"), $t("templates.subtitle-animations.text_c582e14938"), $t("templates.subtitle-animations.text_0ad0e1c218"), $t("templates.subtitle-animations.text_454bb1101b"), $t("templates.subtitle-animations.text_836bee2565"), $t("templates.subtitle-animations.text_500f7b18b1"),
      $t("templates.subtitle-animations.text_8403a1cf53"), $t("templates.subtitle-animations.text_286fd27cb8"), $t("templates.subtitle-animations.text_4b76b8cff3")] },
  { key: "chanshenzi", keyword: "馋身子", delayMs: 100, fontSize: 18, windows: [[0, 16], [16, 31], [33, 40]],
    captions: [$t("templates.subtitle-animations.text_cf1ef87cca"), $t("templates.subtitle-animations.text_35ec4e38b9"), $t("templates.subtitle-animations.text_fe7987ad53")] },
  { key: "qiegewala", keyword: "切格瓦拉", delayMs: 130, windows: [[0, 15], [16, 31], [31, 38], [38, 48], [49, 68], [68, 86]],
    captions: [$t("templates.subtitle-animations.text_033b5337f7"), $t("templates.subtitle-animations.text_09fed1a1bb"), $t("templates.subtitle-animations.text_6bab8359d8"), $t("templates.subtitle-animations.text_5260239b4e"), $t("templates.subtitle-animations.text_f1dc4f5578"), $t("templates.subtitle-animations.text_4cfe0fdb44")] },
  { key: "shuifandui", keyword: "谁反对", delayMs: 120, fontSize: 19, windows: [[3, 14], [21, 26], [31, 38], [40, 45]],
    captions: [$t("templates.subtitle-animations.text_baa822ea61"), $t("templates.subtitle-animations.text_eacdffb834"), $t("templates.subtitle-animations.text_2064c386d4"), $t("templates.subtitle-animations.text_49dbd05964")] },
  { key: "jiamianqishi", keyword: "假面骑士", delayMs: 120, fontSize: 17, windows: [[2, 9], [14, 20], [27, 40], [45, 62]],
    captions: [$t("templates.subtitle-animations.text_d005326a8f"), $t("templates.subtitle-animations.text_32520ecd80"), $t("templates.subtitle-animations.text_ff1b30208d"), $t("templates.subtitle-animations.text_39bffd94a7")] },
  { key: "wuyage", keyword: "乌鸦哥", delayMs: 60, fontSize: 18, windows: [[8, 32], [35, 58], [60, 85]],
    captions: [$t("templates.subtitle-animations.text_c630907406"), $t("templates.subtitle-animations.text_2282e18562"), $t("templates.subtitle-animations.text_8143cbf58b")] },
  { key: "zengxiaoxian", keyword: "曾小贤", delayMs: 130, fontSize: 21, windows: [[3, 15], [24, 30], [30, 46], [56, 63]],
    captions: [$t("templates.subtitle-animations.text_5232cff014"), $t("templates.subtitle-animations.text_3d767e5e33"), $t("templates.subtitle-animations.text_cc083e275f"), $t("templates.subtitle-animations.text_8c102614fe")] },
  { key: "yalidaye", keyword: "压力大爷", delayMs: 130, fontSize: 21, windows: [[0, 16], [21, 47], [52, 77]],
    captions: [$t("templates.subtitle-animations.text_bd36311a78"), $t("templates.subtitle-animations.text_d2ae298320"), $t("templates.subtitle-animations.text_8d3244050a")] },
  { key: "nihaosaoa", keyword: "你好骚啊", delayMs: 100, fontSize: 17, windows: [[0, 14], [16, 26], [42, 61]],
    captions: [$t("templates.subtitle-animations.text_1515bfe01a"), $t("templates.subtitle-animations.text_f9bb694542"), $t("templates.subtitle-animations.text_aa3785a154")] },
  { key: "shishilani", keyword: "食屎啦你", delayMs: 200, fontSize: 17, windows: [[14, 21], [23, 36], [38, 46], [60, 66]],
    captions: [$t("templates.subtitle-animations.text_68be0d66bc"), $t("templates.subtitle-animations.text_d509e197f8"), $t("templates.subtitle-animations.text_44a8cad558"), $t("templates.subtitle-animations.text_79ff200148")] },
  { key: "wunian", keyword: "五年怎么过的", delayMs: 100, fontSize: 16, windows: [[11, 20], [35, 50], [59, 77], [82, 95]],
    captions: [$t("templates.subtitle-animations.text_0e4c818a5c"), $t("templates.subtitle-animations.text_763aacba55"), $t("templates.subtitle-animations.text_da7698df77"), $t("templates.subtitle-animations.text_6543812821")] },
  { key: "maikease", keyword: "麦克阿瑟说", delayMs: 200, windows: [[0, 22], [24, 46], [48, 70], [72, 84]],
    captions: [$t("templates.subtitle-animations.text_623e006e40"), $t("templates.subtitle-animations.text_f465efa245"), $t("templates.subtitle-animations.text_19f41e4448"), $t("templates.subtitle-animations.text_2672c15eb5")] },
];

function subtitleTemplate({ key, keyword, windows, captions, delayMs, fontSize = 20 }: SubtitleSpec): MemeTemplate {
  const count = windows.length;
  async function render({ texts, images }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length || texts.length !== count) throw new Error($t("templates.subtitle-animations.text_67a924bd7f", { "count": count }));
    const { signal } = context;
    const [gif, font] = await Promise.all([context.imageAsset(`gif_subtitle/${key}.gif`), registerFont(context)]);
    const { frames } = await readMemeImageSequence(new File([new Uint8Array(gif)], `${key}.gif`), signal);
    const { width, height } = frames[0];
    const subtitles = new Map<number, Image>();
    for (const [part, [start, end]] of windows.entries()) {
      signal.throwIfAborted();
      const text = texts[part]!;
      if (!text) continue;
      const { png } = await renderExactPng(width, height, draw => {
        drawFittedText(draw, [5, 0, width - 5, height - 5], text, font, fontSize, fontSize, "center", "white", {
          wrap: false, stroke: ["black", 0.05], vertical: "bottom", paragraphMetrics: true,
        });
      });
      const image = await loadImage(png);
      for (let index = start; index < Math.min(end, frames.length); index++) subtitles.set(index, image);
    }
    return renderPythonCanvasGif({
      width, height, signal, frames: frames.map((image, index) => ({ value: { image, subtitle: subtitles.get(index) }, delayMs })),
      drawFrame({ image, subtitle }, draw) {
        draw.fillStyle = "black";
        draw.fillRect(0, 0, width, height);
        draw.drawImage(image, 0, 0);
        if (subtitle) draw.drawImage(subtitle, 0, 0);
      },
    });
  }
  return {
    info: { key, keywords: [keyword], params_type: {
      min_images: 0, max_images: 0, min_texts: count, max_texts: count, default_texts: captions, args_type: null,
    } }, render,
    preview: context => render({ images: [], texts: captions, args: {} }, context),
  };
}

export const subtitleMemeTemplates = specs.map(subtitleTemplate);
