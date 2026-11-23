import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { offsetMotionMemeTemplates } from "../templates/offset-motion.ts";
import { waveMemeTemplate } from "../templates/wave.ts";

const [vibrate, loop] = offsetMotionMemeTemplates;
const signal = new AbortController().signal;
const context: MemeTemplateContext = {
  signal,
  async imageAsset() { throw new Error("模板未声明背景素材"); },
  async fontAsset() { throw new Error("模板未声明字体"); },
};

async function pixels(image: Image, points: readonly (readonly [number, number])[]) {
  const canvas = new Canvas(image.width, image.height);
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") canvas.gpu = true;
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  const raw = await canvas.toBuffer("raw", { colorType: "rgba", premultiplied: false });
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") {
    expect(canvas.engine.renderer).toBe("GPU");
    expect(canvas.engine.device).toContain("RTX A4000");
  }
  return points.map(([x, y]) => [...raw.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]);
}

async function render(template: MemeTemplate, input: File, args: Readonly<Record<string, unknown>> = {}) {
  const output = await template.render({ images: [input], texts: [], args }, context);
  expect(Buffer.from(output).subarray(0, 6).toString()).toBe("GIF89a");
  return readMemeImageSequence(new File([new Uint8Array(output)], "result.gif"), signal);
}

test("震动输出五个原位移、白色补边与 50ms 帧间隔", async () => {
  const input = new Canvas(51, 50);
  const draw = input.getContext("2d");
  draw.fillStyle = "#888";
  draw.fillRect(0, 0, 51, 50);
  const output = await render(vibrate, new File([new Uint8Array(await input.png)], "input.png"));
  expect([output.frames[0].width, output.frames[0].height, output.frames.length, output.averageDelayMs])
    .toEqual([53, 52, 5, 50]);
  const positions = [[0, 0], [2, 2], [1, 1], [0, 2], [2, 0]] as const;
  for (const [index, position] of positions.entries()) {
    const [body, padding] = await pixels(output.frames[index]!, [position, index === 0 ? [52, 51] : [0, 0]]);
    expect(body).toEqual([136, 136, 136, 255]);
    expect(padding).toEqual([255, 255, 255, 255]);
  }
});

test("震动遇到更长的输入动图时，按源帧时间延长整轮位移", async () => {
  const uniform = (color: number) => Uint8Array.from({ length: 30 * 30 * 4 },
    (_, index) => index % 4 === 3 ? 255 : color);
  const gif = encodeMemeGif(30, 30, [
    { rgba: uniform(55), delayMs: 250 }, { rgba: uniform(177), delayMs: 250 },
  ], signal);
  const output = await render(vibrate, new File([new Uint8Array(gif)], "input.gif"));
  expect([output.frames.length, output.averageDelayMs]).toEqual([10, 50]);
  const first = await pixels(output.frames[4]!, [[10, 10], [0, 1]]);
  const second = await pixels(output.frames[5]!, [[10, 10], [0, 1]]);
  expect(first.map(pixel => pixel[0])).toEqual([55, 255]);
  expect(second.map(pixel => pixel[0])).toEqual([177, 177]);
});

test("循环保留四个方向、默认向上、裁剪的半像素舍入和原图透明区", async () => {
  const canvas = new Canvas(45, 30);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#888";
  draw.fillRect(4, 3, 1, 1);
  const file = new File([new Uint8Array(await canvas.png)], "input.png");
  const argType = loop.info.params_type.args_type;
  const cases = [
    ["左", "left", [0, 3]], ["-d right", "right", [8, 3]],
    ["", "top", [4, 0]], ["下", "bottom", [4, 6]],
  ] as const;
  for (const [command, direction, point] of cases) {
    const parsed = parseGenerationArgs(argType, command);
    expect(parsed).toMatchObject({ values: command ? { direction } : {}, text: "", issue: undefined });
    const output = await render(loop, file, command ? parsed.values : {});
    expect([output.frames[0].width, output.frames[0].height, output.frames.length, output.averageDelayMs])
      .toEqual([45, 30, 30, 50]);
    const [body, empty] = await pixels(output.frames[3]!, [point, [10, 10]]);
    expect(body).toEqual([136, 136, 136, 255]);
    expect(empty?.[3]).toBe(0);
  }
  expect(parseGenerationArgs(argType, "右").values.direction).toBe("right");
  expect(parseGenerationArgs(argType, "上").values.direction).toBe("top");
  await expect(render(loop, file, { direction: "invalid" })).rejects.toThrow("循环方向");
});

test("波纹用原正弦位移取样，居中裁边并保存八帧 10ms 动图", async () => {
  const canvas = new Canvas(360, 360);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#888";
  draw.fillRect(20, 13, 1, 1);
  const input = new File([new Uint8Array(await canvas.png)], "input.png");
  const gif = await waveMemeTemplate.render({ images: [input], texts: [], args: {} }, context);
  const bytes = Buffer.from(gif);
  const control = bytes.indexOf(Buffer.from([0x21, 0xf9, 4]));
  expect(control).toBeGreaterThan(0);
  expect(bytes.readUInt16LE(control + 4)).toBe(1);
  const output = await readMemeImageSequence(new File([new Uint8Array(gif)], "result.gif"), signal);
  expect([output.frames[0].width, output.frames[0].height, output.frames.length]).toEqual([354, 354, 8]);
  const first = await pixels(output.frames[0], [[15, 10], [18, 10]]);
  const later = await pixels(output.frames[2]!, [[15, 10], [18, 10]]);
  expect(first.map(pixel => pixel[3])).toEqual([255, 0]);
  expect(later.map(pixel => pixel[3])).toEqual([0, 255]);
});
