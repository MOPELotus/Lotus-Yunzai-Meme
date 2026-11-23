import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { classicLayeredMemeTemplates } from "../templates/classic-layered-animations.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const signal = new AbortController().signal;

const file = (bytes: Uint8Array, name: string) => new File([new Uint8Array(bytes)], name);

async function fixture() {
  const source = new Canvas(60, 50);
  const draw = source.getContext("2d");
  draw.fillStyle = "#00d000";
  draw.fillRect(0, 0, 60, 50);
  return file(await source.png, "avatar.png");
}

async function render(key: string, width: number, height: number, avatar: File, args: Record<string, unknown> = {}) {
  const template = classicLayeredMemeTemplates.find(item => item.info.key === key)!;
  const art = await new Canvas(width, height).png;
  const path: string[] = [];
  const bytes = await template.render({ images: [avatar], texts: [], args }, {
    signal,
    async fontAsset() { throw new Error("旧模板无字体"); },
    async imageAsset(name) { path.push(name); return art; },
  });
  expect([...bytes.subarray(0, 6)]).toEqual([71, 73, 70, 56, 57, 97]);
  return { result: await readMemeImageSequence(file(bytes, "output.gif"), signal), path };
}

function pixel(image: Image, x: number, y: number) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(x, y, 1, 1).data];
}

test("原抛掷动图保留同帧两个圆头像与中间空帧", async () => {
  const { result, path } = await render("throw_gif", 350, 350, await fixture());
  expect([result.frames.length, result.averageDelayMs, path[0], path.at(-1)]).toEqual([8, 100, "throw_gif/0.png", "throw_gif/7.png"]);
  expect(pixel(result.frames[2]!, 122, 53)[3]).toBe(0);
  expect(pixel(result.frames[4]!, 70, 280)).toEqual([0, 208, 0, 255]);
  expect(pixel(result.frames[4]!, 307, 85)).toEqual([0, 208, 0, 255]);
  expect(pixel(result.frames[4]!, 289, 70)[3]).toBe(0);
});

test("狗都不玩同时接受原 --circle 和圆，默认方头像", async () => {
  const template = classicLayeredMemeTemplates.find(item => item.info.key === "dog_dislike")!;
  for (const option of ["--circle", "圆"]) {
    const parsed = parseGenerationArgs(template.info.params_type.args_type, option);
    expect(parsed).toMatchObject({ values: { circle: true }, text: "", issue: undefined });
  }
  const source = await fixture();
  const square = (await render("dog_dislike", 320, 432, source)).result;
  const circular = (await render("dog_dislike", 320, 432, source, { circle: true })).result;
  expect([circular.frames.length, circular.averageDelayMs]).toEqual([34, 80]);
  expect(pixel(square.frames[0], 36, 408)).toEqual([0, 208, 0, 255]);
  expect(pixel(circular.frames[0], 36, 408)[3]).toBe(0);
  expect(pixel(circular.frames[0], 96, 420)).toEqual([0, 208, 0, 255]);
});

test("咖波头槌接受输入动图，按旧 ExtendLoop 延长整轮透视动作", async () => {
  const rgba = (shade: number) => Uint8Array.from({ length: 20 * 20 * 4 }, (_, i) => i % 4 === 3 ? 255 : shade);
  const source = encodeMemeGif(20, 20, [{ rgba: rgba(30), delayMs: 350 }, { rgba: rgba(220), delayMs: 350 }], signal);
  const { result, path } = await render("capoo_strike", 400, 255, file(source, "avatar.gif"));
  expect([path.length, result.frames.length, result.averageDelayMs]).toEqual([7, 14, 50]);
  expect(pixel(result.frames[0], 110, 105)).toEqual([30, 30, 30, 255]);
  expect(pixel(result.frames[7]!, 110, 105)).toEqual([220, 220, 220, 255]);
});
