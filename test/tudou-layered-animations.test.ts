import { expect, test } from "bun:test";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { tudouLayeredTemplates } from "../templates/tudou-layered-animations.ts";
import { tudouCompositions } from "../templates/tudou-layered-specs.ts";

const signal = new AbortController().signal;
const wanted = ["3p", "kou", "llq", "nantongjue", "nizhejiah", "nvtongjue", "pao", "pingdiguo", "qi", "qian", "shuaiqunwu", "zaoleipi", "zuo"];

test("Tudou 旧目录共 13 款，123 个原画条目逐帧已装入本机", async () => {
  expect(tudouLayeredTemplates.map(({ info }) => info.key)).toEqual(wanted);
  const { files } = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json() as { files: Record<string, string> };
  let assets = 0;
  for (const [index, row] of tudouCompositions.entries()) {
    expect(builtinMemeTemplates.filter(({ info }) => info.key === row.key)).toEqual([tudouLayeredTemplates[index]!]);
    for (let frame = 0; frame < row.frames; frame++) {
      expect(files[`images/python/meme_generator/memes/${row.key}/tudou/${frame}.png`]).toMatch(/^[0-9a-f]{64}$/u);
      assets++;
    }
  }
  expect(assets).toBe(123);
  expect(tudouCompositions.find(({ key }) => key === "zaoleipi")?.layers[0]?.visible).toEqual([[0, 10], [16, 38]]);
  expect(tudouCompositions.find(({ key }) => key === "llq")?.layers[0]?.visible).toEqual([[4, 4]]);
});

test("本机表情保留各输入位置、静态输出格式和动图输入的原时长", async () => {
  const context = { signal, ...createBundledMemeResources(signal) };
  const avatar = (color: string) => renderExactPng(92, 71, draw => {
    draw.fillStyle = color;
    draw.fillRect(0, 0, 92, 71);
  }).then(({ png }) => new File([new Uint8Array(png)], "头像.png"));
  const [red, blue, green] = await Promise.all([avatar("#ff0000"), avatar("#0000ff"), avatar("#00ff00")]);
  const go = (key: string, images: readonly File[]) => tudouLayeredTemplates.find(({ info }) => info.key === key)!
    .render({ images, texts: [], args: {} }, context);
  const staticFormats = [["qi", [red, blue], [137, 80, 78, 71]], ["qian", [red, blue], [137, 80, 78, 71]],
    ["nizhejiah", [red], [255, 216, 255]]] as const;
  for (const [key, images, expected] of staticFormats) {
    expect([...(await go(key, images)).subarray(0, expected.length)]).toEqual([...expected]);
  }
  await expect(go("3p", [red, blue])).rejects.toThrow("3 张图片");
  const animated = new File([new Uint8Array(encodeMemeGif(8, 8, [0, 1].map(channel => ({
    rgba: Uint8Array.from({ length: 256 }, (_, index) => [channel, 3].includes(index % 4) ? 255 : 0),
    delayMs: channel === 0 ? 30 : 40,
  })), signal))], "两帧输入.gif");
  for (const [key, images, count, delay] of [
    ["3p", [red, blue, green], 3, 60], ["llq", [red], 5, 800], ["zaoleipi", [red], 49, 20],
    ["qi", [animated, blue], 2, 30], ["qian", [animated, blue], 2, 30], ["nizhejiah", [animated], 2, 30],
  ] as const) {
    const bytes = await go(key, images);
    expect(Buffer.from(bytes.subarray(0, 3)).toString()).toBe("GIF");
    const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), signal);
    expect(result.frames).toHaveLength(count);
    expect(result.averageDelayMs).toBe(delay);
  }
}, 30_000);
