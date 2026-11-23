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
    captions: ["我就是饿死", "死外边 从这里跳下去", "不会吃你们一点东西", "真香"] },
  { key: "weisuoyuwei", keyword: "为所欲为", delayMs: 120, fontSize: 19,
    windows: [[11, 14], [27, 38], [42, 61], [63, 81], [82, 95], [96, 105], [111, 131], [145, 157], [157, 167]],
    captions: ["好啊", "就算你是一流工程师", "就算你出报告再完美", "我叫你改报告你就要改", "毕竟我是客户", "客户了不起啊",
      "Sorry 客户真的了不起", "以后叫他天天改报告", "天天改 天天改"] },
  { key: "chanshenzi", keyword: "馋身子", delayMs: 100, fontSize: 18, windows: [[0, 16], [16, 31], [33, 40]],
    captions: ["你那叫喜欢吗？", "你那是馋她身子", "你下贱！"] },
  { key: "qiegewala", keyword: "切格瓦拉", delayMs: 130, windows: [[0, 15], [16, 31], [31, 38], [38, 48], [49, 68], [68, 86]],
    captions: ["没有钱啊 肯定要做的啊", "不做的话没有钱用", "那你不会去打工啊", "有手有脚的", "打工是不可能打工的", "这辈子不可能打工的"] },
  { key: "shuifandui", keyword: "谁反对", delayMs: 120, fontSize: 19, windows: [[3, 14], [21, 26], [31, 38], [40, 45]],
    captions: ["我话说完了", "谁赞成", "谁反对", "我反对"] },
  { key: "jiamianqishi", keyword: "假面骑士", delayMs: 120, fontSize: 17, windows: [[2, 9], [14, 20], [27, 40], [45, 62]],
    captions: ["哦～", "（飞扑）", "一直想看你这幅表情", "这幅嫉妒我的表情"] },
  { key: "wuyage", keyword: "乌鸦哥", delayMs: 60, fontSize: 18, windows: [[8, 32], [35, 58], [60, 85]],
    captions: ["哟 Lotus-Yunzai机器人", "今天掉线了没", "来给他弹个版本过低"] },
  { key: "zengxiaoxian", keyword: "曾小贤", delayMs: 130, fontSize: 21, windows: [[3, 15], [24, 30], [30, 46], [56, 63]],
    captions: ["平时你打电子游戏吗", "偶尔", "星际还是魔兽", "连连看"] },
  { key: "yalidaye", keyword: "压力大爷", delayMs: 130, fontSize: 21, windows: [[0, 16], [21, 47], [52, 77]],
    captions: ["外界都说我们压力大", "我觉得吧压力也没有那么大", "主要是28岁了还没媳妇儿"] },
  { key: "nihaosaoa", keyword: "你好骚啊", delayMs: 100, fontSize: 17, windows: [[0, 14], [16, 26], [42, 61]],
    captions: ["既然追求刺激", "就贯彻到底了", "你好骚啊"] },
  { key: "shishilani", keyword: "食屎啦你", delayMs: 200, fontSize: 17, windows: [[14, 21], [23, 36], [38, 46], [60, 66]],
    captions: ["穿西装打领带", "拿大哥大有什么用", "跟着这样的大哥", "食屎啦你"] },
  { key: "wunian", keyword: "五年怎么过的", delayMs: 100, fontSize: 16, windows: [[11, 20], [35, 50], [59, 77], [82, 95]],
    captions: ["五年", "你知道我这五年是怎么过的吗", "我每天躲在家里玩贪玩蓝月", "你知道有多好玩吗"] },
  { key: "maikease", keyword: "麦克阿瑟说", delayMs: 200, windows: [[0, 22], [24, 46], [48, 70], [72, 84]],
    captions: ["美国前五星上将麦克阿瑟", "曾这样评价道", "如果让我去阻止xxx", "那么我宁愿去阻止上帝"] },
];

function subtitleTemplate({ key, keyword, windows, captions, delayMs, fontSize = 20 }: SubtitleSpec): MemeTemplate {
  const count = windows.length;
  async function render({ texts, images }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length || texts.length !== count) throw new Error(`该表情需要 ${count} 段文字。`);
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
