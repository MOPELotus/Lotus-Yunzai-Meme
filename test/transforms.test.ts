import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Canvas, loadImage, type Image } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { transformMemeTemplates } from "../templates/transforms.ts";

const [symmetric, lookFlat] = transformMemeTemplates;
const signal = new AbortController().signal;
const context: MemeTemplateContext = {
  signal,
  async imageAsset() { throw new Error("这两个模板不需要背景素材"); },
  async fontAsset(path) {
    expect(path).toBe("NotoSansSC-Bold.ttf");
    // Use a repository font fixture for the deterministic isolated test. The
    // managed renderer loads the verified Noto font in normal use.
    return readFile(new URL("../../starrail/rogue-theme/SR.ttf", import.meta.url));
  },
};

function fixture(width: number, height: number, value: (x: number, y: number) => number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = value(x, y);
    rgba.set([pixel, pixel, pixel, 255], 4 * (y * width + x));
  }
  return rgba;
}

async function pixels(image: Image) {
  const canvas = new Canvas(image.width, image.height);
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") canvas.gpu = true;
  canvas.getContext("2d").drawImage(image, 0, 0);
  const bytes = await canvas.toBuffer("raw", { colorType: "rgba", premultiplied: false });
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") {
    expect(canvas.engine.renderer).toBe("GPU");
    expect(canvas.engine.device).not.toMatch(/llvmpipe|lavapipe|swiftshader|software/iu);
  }
  return (x: number, y: number) => bytes[4 * (y * image.width + x)];
}

test("对称的四个方向保留奇数像素原版裁法及 GIF 统一平均时长", async () => {
  const first = fixture(5, 5, (x, y) => x * 7 + y * 30);
  const last = fixture(5, 5, (x, y) => x * 7 + y * 30 + 50);
  const bytes = encodeMemeGif(5, 5, [{ rgba: first, delayMs: 40 }, { rgba: last, delayMs: 90 }], signal);
  const file = new File([Uint8Array.from(bytes)], "odd.gif", { type: "image/gif" });
  const expected = {
    left: [0, 1, 2, 1], right: [4, 3, 2, 3],
    top: [0, 1, 2, 1], bottom: [4, 3, 2, 3],
  };
  for (const [alias, direction] of [["左", "left"], ["右", "right"], ["上", "top"], ["下", "bottom"]] as const) {
    const parsed = parseGenerationArgs(symmetric!.info.params_type.args_type, alias);
    expect(parsed).toMatchObject({ values: { direction }, text: "", issue: undefined });
    const output = await symmetric!.render({ images: [file], texts: [], args: parsed.values }, context);
    expect(Buffer.from(output).subarray(0, 6).toString()).toBe("GIF89a");
    const sequence = await readMemeImageSequence(new File([Uint8Array.from(output)], "result.gif"), signal);
    expect(sequence.frames).toHaveLength(2);
    expect(sequence.averageDelayMs).toBe(60);
    const decoded = await pixels(sequence.frames[0]);
    const decodedLater = await pixels(sequence.frames[1]!);
    const horizontal = direction === "left" || direction === "right";
    expect([sequence.frames[0].width, sequence.frames[0].height]).toEqual(horizontal ? [4, 5] : [5, 4]);
    expect(expected[direction].map((_, i) => horizontal ? decoded(i, 0) : decoded(0, i))).toEqual(
      expected[direction].map(value => value * (horizontal ? 7 : 30)));
    expect(decodedLater(0, 0)).toBe(Number(decoded(0, 0)) + 50);
  }
});

test("看扁在原始高度内接受旧整数比例，500 像素画面后接 80 像素文字区", async () => {
  const canvas = new Canvas(75, 41);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#000000";
  draw.fillRect(0, 0, 75, 41);
  const file = new File([new Uint8Array(await canvas.png)], "still.png", { type: "image/png" });
  const generate = (ratio?: number, caption?: string) => lookFlat!.render({ images: [file],
    texts: caption === undefined ? [] : [caption], args: ratio === undefined ? {} : { ratio } }, context);
  const parsed = parseGenerationArgs(lookFlat!.info.params_type.args_type, "-r 13 示例");
  expect(parsed).toMatchObject({ values: { ratio: 13 }, text: "示例", issue: undefined });
  expect(parseGenerationArgs(lookFlat!.info.params_type.args_type, "-r 2.5").issue).toContain("无效");
  await expect(generate(41)).rejects.toThrow("压扁");
  await expect(generate(0)).rejects.toThrow("压扁");
  const defaults = await generate();
  const custom = await generate(13, "示例");
  expect(Buffer.from(custom).subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
  const defaultImage = await loadImage(Buffer.from(defaults));
  expect([defaultImage.width, defaultImage.height]).toEqual([500, 216]);
  const compressed = await loadImage(Buffer.from(custom));
  expect([compressed.width, compressed.height]).toEqual([500, 101]);
  const sample = await pixels(compressed);
  expect(sample(4, 4)).toBeLessThan(20);
  expect(sample(4, 85)).toBeGreaterThan(230);
  expect(Array.from({ length: 50 }, (_, y) => Array.from({ length: 140 }, (_x, x) => sample(180 + x, 40 + y)))
    .flat().some(value => value !== undefined && value < 60)).toBe(true);
  const preview = await lookFlat!.preview!(context);
  expect((await loadImage(Buffer.from(preview))).height).toBe(330);
});

test("仅解析模板自身显式登记的中文快捷动作", () => {
  const schema = { args_model: { properties: { mode: { type: "string", enum: ["loop", "circle"] } } }, parser_options: [
    { names: ["--circle", "套娃"], dest: "mode", action: { type: 0, value: "circle" } },
    { names: ["--loop", "循环"], dest: "mode", action: { type: 0, value: "loop" } },
  ] };
  expect(parseGenerationArgs(schema, "套娃")).toMatchObject({ values: { mode: "circle" }, text: "" });
  expect(parseGenerationArgs(schema, "循环")).toMatchObject({ values: { mode: "loop" }, text: "" });
  expect(parseGenerationArgs(schema, "这是循环文字")).toMatchObject({ values: {}, text: "这是循环文字" });
});
