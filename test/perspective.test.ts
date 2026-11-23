import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { screenProjection } from "../templates/projective-transform.ts";
import { drawFittedText } from "../templates/template-layout.ts";

test("四点透视映射四角及其投影中心", () => {
  const input = [[0, 0], [100, 0], [100, 100], [0, 100]] as const;
  const output = [[0, 0], [100, 0], [80, 100], [20, 100]] as const;
  const matrix = screenProjection(100, 100, output);
  function map(x: number, y: number) {
    const point = matrix.transformPoint({ x, y, z: 0, w: 1 });
    return [point.x / point.w, point.y / point.w];
  }
  expect(input.map(([x, y]) => map(x, y).map(Math.round))).toEqual(output.map(([x, y]) => [x, y]));
  expect(map(50, 50)[0]).toBeCloseTo(50);
  expect(map(50, 50)[1]).toBeCloseTo(62.5);
  expect(() => screenProjection(100, 100, [[0, 0], [1, 1], [2, 2], [3, 3]])).toThrow("无效的表情透视四边形");
});

const samples = [
  ["dog_of_vtb", 910, 1280, 375, 250, "jpg"],
  ["prpr", 690, 668, 185, 420, "jpg"],
  ["smash", 682, 682, 310, 310, "jpg"],
  ["cover_face", 690, 690, 340, 375, "jpg"],
  ["haruhi_raise", 1000, 563, 535, 178, "png"],
  ["konata_watch", 693, 1000, 175, 286, "png"],
] as const;

function rgba(image: Image, x: number, y: number) {
  const paint = new Canvas(image.width, image.height).getContext("2d");
  paint.drawImage(image, 0, 0);
  return [...paint.getImageData(x, y, 1, 1).data];
}

for (const [key, width, height, x, y, format] of samples) {
  test(`${key} 复现源画布、透视内外边界、原图层和动图分支`, async () => {
    const art = new Canvas(width, height);
    const draw = art.getContext("2d");
    draw.fillStyle = "#0000ff";
    draw.fillRect(x + 12, y + 12, 30, 30);
    const backdrop = await art.png;
    const context: MemeTemplateContext = {
      signal: new AbortController().signal,
      async imageAsset(asset) { expect(asset).toBe(`${key}/0.png`); return backdrop; },
      async fontAsset() { throw new Error("该模板不使用字体"); },
    };
    const template = builtinMemeTemplates.find(t => t.info.key === key)!;
    const avatar = new Canvas(100, 73);
    const color = avatar.getContext("2d");
    color.fillStyle = "#f00";
    color.fillRect(0, 0, 100, 73);
    const still = await template.render({ images: [new File([new Uint8Array(await avatar.png)], "avatar.png")],
      texts: [], args: {} }, context);
    expect([...still.subarray(0, 2)]).toEqual(format === "png" ? [137, 80] : [255, 216]);
    const photo = await loadImage(Buffer.from(still));
    expect([photo.width, photo.height]).toEqual([width, height]);
    expect(rgba(photo, x, y)[0]).toBeGreaterThanOrEqual(245);
    const outer = rgba(photo, width - 2, height - 2);
    expect(outer).toEqual(format === "png" ? [0, 0, 0, 0] : [255, 255, 255, 255]);
    expect(rgba(photo, x + 24, y + 24)[2]).toBeGreaterThanOrEqual(245);

    const gif = encodeMemeGif(2, 2, [
      { color: [255, 0, 0, 255], delayMs: 200 },
      { color: [0, 255, 0, 255], delayMs: 300 },
    ].map(({ color, delayMs }) => ({ rgba: Uint8Array.from([...color, ...color, ...color, ...color]), delayMs })), context.signal);
    const moving = await template.render({ images: [new File([new Uint8Array(gif)], "avatar.gif")], texts: [], args: {} }, context);
    if (key === "cover_face") {
      expect([...moving.subarray(0, 2)]).toEqual([255, 216]);
      expect(rgba(await loadImage(Buffer.from(moving)), x, y)[0]).toBeGreaterThanOrEqual(245);
    } else {
      const result = await readMemeImageSequence(new File([new Uint8Array(moving)], "result.gif"), context.signal);
      expect(result.frames).toHaveLength(2);
      expect(result.averageDelayMs).toBe(250);
      expect(rgba(result.frames[0], x, y)).toEqual([255, 0, 0, 255]);
      expect(rgba(result.frames[1]!, x, y)).toEqual([0, 255, 0, 255]);
    }
  });
}

test("透视文案保留默认文字、原神启动快捷式和原有字数限制", () => {
  const expected = [
    ["genshin_start", "原神，启动！"], ["play_game", "来玩休闲游戏啊"],
    ["this_chicken", "这是十二生肖中的鸡"], ["incivilization", "你刚才说的话不是很礼貌！"],
  ];
  for (const [key, caption] of expected) {
    const template = builtinMemeTemplates.find(t => t.info.key === key)!;
    expect(template.info.params_type).toMatchObject({ min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [caption] });
  }
  expect(builtinMemeTemplates.find(t => t.info.key === "genshin_start")?.info.shortcuts).toEqual([
    { key: "(?P<text>\\S+启动[!！]?)", args: ["{text}"], humanized: "xx启动" },
  ]);
});

test("单行标题保留实际描边，超长时返回模板提示", () => {
  const paint = new Canvas(140, 100).getContext("2d");
  drawFittedText(paint, [0, 0, 140, 100], "A", "sans-serif", 60, 60, "center", "white", { wrap: false, stroke: ["red", 0.1] });
  const pixels = paint.getImageData(0, 0, 140, 100).data;
  let white = 0, outlined = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]! <= 240 || pixels[i]! <= 240) continue;
    if (pixels[i + 1]! > 240 && pixels[i + 2]! > 240) white++;
    if (pixels[i + 1]! < 16 && pixels[i + 2]! < 16) outlined++;
  }
  expect(white).toBeGreaterThan(100);
  expect(outlined).toBeGreaterThan(50);
  expect(() => drawFittedText(paint, [0, 0, 50, 100], "AAA AAA AAA", "sans-serif", 40, 60,
    "center", "white", { wrap: false, stroke: ["red", 0.1] })).toThrow(MemeTemplateFeedback);
});
