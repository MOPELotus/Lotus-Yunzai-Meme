import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { petpet } from "../templates/petpet.ts";

async function surface(width: number, height: number, blocks: readonly [string, number, number, number, number][]) {
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  for (const [color, x, y, w, h] of blocks) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }
  return canvas;
}

async function templateContext() {
  const requested: string[] = [];
  const overlay = await (await surface(112, 112, [["#00ff00", 1, 1, 3, 3]])).png;
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) {
      requested.push(path);
      return overlay;
    },
    async fontAsset() {
      throw new Error("petpet 不读取字体");
    },
  };
  return { requested, context };
}

async function decodeGif(bytes: Uint8Array, signal: AbortSignal) {
  const output = new File([Buffer.from(bytes)], "result.gif", { type: "image/gif" });
  expect(Buffer.from(bytes).subarray(0, 6).toString()).toBe("GIF89a");
  return readMemeImageSequence(output, signal);
}

function pixel(image: Awaited<ReturnType<typeof readMemeImageSequence>>["frames"][number], x: number, y: number) {
  const layer = new Canvas(image.width, image.height);
  const draw = layer.getContext("2d");
  draw.drawImage(image, 0, 0);
  return Array.from(draw.getImageData(x, y, 1, 1).data);
}

test("摸头保留五帧、中心裁切、原位移、60ms 帧间隔与圆形选项", async () => {
  const { requested, context } = await templateContext();
  const png = await (await surface(120, 80, [
    ["#0000ff", 0, 0, 20, 80], ["#ff0000", 20, 0, 80, 80], ["#0000ff", 100, 0, 20, 80],
  ])).png;
  const images = [new File([Buffer.from(png)], "color.png", { type: "image/png" })];
  const input = { images, texts: [], args: {} };
  const result = await decodeGif(await petpet.render(input, context), context.signal);
  expect(new Set(requested)).toEqual(new Set(["petpet/0.png", "petpet/1.png", "petpet/2.png", "petpet/3.png", "petpet/4.png"]));
  expect(result.frames.map(({ width, height }) => [width, height])).toEqual(Array.from({ length: 5 }, () => [112, 112]));
  expect(result.averageDelayMs).toBe(60);
  expect(pixel(result.frames[0], 1, 1)).toEqual([0, 255, 0, 255]);
  expect(pixel(result.frames[0], 16, 22)).toEqual([255, 0, 0, 255]);
  expect(pixel(result.frames[2]!, 16, 22)[3]).toBe(0);
  expect(pixel(result.frames[2]!, 9, 41)).toEqual([255, 0, 0, 255]);
  const rounded = await decodeGif(await petpet.render({ ...input, args: { circle: true } }, context), context.signal);
  expect(pixel(rounded.frames[0], 16, 22)[3]).toBe(0);
  expect(pixel(rounded.frames[0], 60, 65)).toEqual([255, 0, 0, 255]);
  const args = petpet.info.params_type.args_type;
  for (const option of ["-c", "--circle", "-圆"]) {
    expect(parseGenerationArgs(args, option)).toMatchObject({ values: { circle: true }, text: "" });
  }
});

test("摸头将动态头像按平均帧间隔循环保留，并提供原样棋盘预览", async () => {
  const { context } = await templateContext();
  const raw = await Promise.all(["#ff0000", "#0000ff"].map(async color =>
    (await surface(4, 4, [[color, 0, 0, 4, 4]])).toBuffer("raw", { colorType: "rgba", premultiplied: false })));
  const source = encodeMemeGif(4, 4, raw.map(rgba => ({ rgba, delayMs: 200 })), context.signal);
  const images = [new File([Buffer.from(source)], "animated.gif", { type: "image/gif" })];
  const result = await decodeGif(await petpet.render({ images, texts: [], args: {} }, context), context.signal);
  expect(result.frames.length).toBe(20);
  expect(pixel(result.frames[0], 56, 56)).toEqual([255, 0, 0, 255]);
  expect(pixel(result.frames[4]!, 56, 56)).toEqual([0, 0, 255, 255]);
  expect(pixel(result.frames[7]!, 56, 56)).toEqual([255, 0, 0, 255]);
  const preview = await decodeGif(await petpet.preview!(context), context.signal);
  expect(preview.frames.length).toBe(5);
  expect(pixel(preview.frames[0], 16, 22)).toEqual([204, 204, 204, 255]);
});

test("动态头像保留 GIF 的小帧偏移和还原前帧", async () => {
  const signal = new AbortController().signal;
  const rgba = (color: readonly number[]) => Uint8Array.from([...color, ...color, ...color, ...color]);
  const gif = Buffer.from(encodeMemeGif(2, 2, [
    { rgba: rgba([255, 0, 0, 255]), delayMs: 40 },
    { rgba: rgba([0, 0, 255, 255]), delayMs: 50 },
    { rgba: rgba([0, 255, 0, 255]), delayMs: 60 },
  ], signal));
  gif.writeUInt16LE(4, 6);
  let search = 0;
  for (const [index, left] of [0, 1, 2].entries()) {
    const control = gif.indexOf(Buffer.from([0x21, 0xf9, 0x04]), search);
    expect(control).toBeGreaterThan(12);
    if (index === 1) gif[control + 3] = 3 << 2;
    gif.writeUInt16LE(left, control + 9);
    search = control + 18;
  }
  const result = await decodeGif(gif, signal);
  expect(result.averageDelayMs).toBe(50);
  expect(pixel(result.frames[0], 1, 0)).toEqual([255, 0, 0, 255]);
  expect(pixel(result.frames[1]!, 1, 0)).toEqual([0, 0, 255, 255]);
  expect(pixel(result.frames[2]!, 1, 0)).toEqual([255, 0, 0, 255]);
  expect(pixel(result.frames[2]!, 2, 0)).toEqual([0, 255, 0, 255]);
});

test("动态 WebP 由 Skia 还原到原画布，保留偏移和平均时长", async () => {
  function chunk(name: string, payload: Buffer) {
    const value = Buffer.alloc(8 + payload.length + (payload.length & 1));
    value.write(name);
    value.writeUInt32LE(payload.length, 4);
    payload.copy(value, 8);
    return value;
  }
  async function frame(left: number, color: string, delay: number) {
    const image = await (await surface(2, 2, [[color, 0, 0, 2, 2]])).toBuffer("webp");
    const header = Buffer.alloc(16);
    header.writeUIntLE(left / 2, 0, 3);
    header.writeUIntLE(1, 6, 3);
    header.writeUIntLE(1, 9, 3);
    header.writeUIntLE(delay, 12, 3);
    header[15] = 2;
    return chunk("ANMF", Buffer.concat([header, image.subarray(12)]));
  }
  const header = Buffer.alloc(10);
  header[0] = 2;
  header.writeUIntLE(3, 4, 3);
  header.writeUIntLE(1, 7, 3);
  const body = Buffer.concat([
    Buffer.from("WEBP"), chunk("VP8X", header), chunk("ANIM", Buffer.alloc(6)),
    await frame(0, "#ff0000", 110), await frame(2, "#0000ff", 250),
  ]);
  const image = chunk("RIFF", body);
  const result = await readMemeImageSequence(new File([image], "anim.webp"), AbortSignal.timeout(10_000));
  expect(result.frames.map(({ width, height }) => [width, height])).toEqual([[4, 2], [4, 2]]);
  expect(result.averageDelayMs).toBe(180);
  expect(pixel(result.frames[0], 2, 0)[3]).toBe(0);
  expect(pixel(result.frames[1]!, 0, 0)[0]).toBeGreaterThan(235);
  expect(pixel(result.frames[1]!, 2, 0)[2]).toBeGreaterThan(235);
});
