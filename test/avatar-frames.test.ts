import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { avatarFrameMemeTemplates } from "../templates/avatar-frames.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const expected = [
  ["kaveh", ["卡维相框"], 36, 42],
  ["paimon", ["派蒙相框"], 40, 38],
  ["wind_slime", ["风史莱姆相框"], 38, 38],
  ["thunderbolt_slime", ["雷史莱姆相框", "雷电史莱姆相框"], 40, 38],
  ["kujou_sara", ["九条裟罗相框"], 36, 42],
  ["shikanoin_heizou", ["鹿野院平藏相框"], 36, 42],
  ["chasca", ["恰斯卡相框"], 40, 42],
] as const;

function layerFixture() {
  const canvas = new Canvas(318, 318);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#00ff00";
  draw.fillRect(150, 150, 10, 10);
  const paths: string[] = [];
  const context: MemeTemplateContext = {
    signal: AbortSignal.timeout(30_000),
    async imageAsset(path) {
      paths.push(path);
      return canvas.png;
    },
    async fontAsset() { throw new Error("头像框无需字体"); },
  };
  return { context, paths };
}

function avatarFixture() {
  const canvas = new Canvas(131, 80);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#0000ff";
  draw.fillRect(0, 0, 131, 80);
  draw.fillStyle = "#ff0000";
  draw.fillRect(25, 0, 80, 80);
  return canvas;
}

function pixels(image: Image) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return (x: number, y: number) => Array.from(draw.getImageData(x, y, 1, 1).data);
}

test("七个原神相框保留目录别名、精确偏移、透明圆形裁剪和框在上方的图层顺序", async () => {
  const { context, paths } = layerFixture();
  const avatar = new File([Buffer.from(await avatarFixture().png)], "avatar.png");
  expect(avatarFrameMemeTemplates).toHaveLength(expected.length);
  for (const [index, [name, keywords, left, top]] of expected.entries()) {
    const template = avatarFrameMemeTemplates[index]!;
    expect(template.info).toEqual({
      key: `mihoyo_${name}_frame`, keywords, tags: ["米哈游", "原神"],
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
    });
    const image = await loadImage(Buffer.from(await template.render({ images: [avatar], texts: [], args: {} }, context)));
    expect([image.width, image.height]).toEqual([318, 318]);
    const pixel = pixels(image);
    expect(pixel(left + 122, top - 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(left + 122, top + 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(left - 1, top + 122)).toEqual([0, 0, 0, 0]);
    expect(pixel(left + 1, top + 122)).toEqual([255, 0, 0, 255]);
    expect(pixel(left + 1, top + 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(155, 155)).toEqual([0, 255, 0, 255]);
  }
  expect(paths).toEqual(expected.map(([name]) => `anyliew/emoji/mihoyo_${name}_frame/images/0.png`));
});

test("相框预览可用且输入 GIF 的两帧与平均间隔保留在透明 GIF 输出", async () => {
  const { context } = layerFixture();
  const [template] = avatarFrameMemeTemplates;
  const renderPreview = await template!.preview!(context);
  expect((await loadImage(Buffer.from(renderPreview))).width).toBe(318);
  const images = [avatarFixture(), avatarFixture()];
  const alternate = images[1]!.getContext("2d");
  alternate.fillStyle = "#ffff00";
  alternate.fillRect(0, 0, 131, 80);
  const frames = await Promise.all(images.map(async (canvas, i) => ({
    rgba: await canvas.toBuffer("raw", { colorType: "rgba", premultiplied: false }),
    delayMs: 40 + 40 * i,
  })));
  const avatar = new File([Buffer.from(encodeMemeGif(131, 80, frames, context.signal))], "avatar.gif");
  const output = await template!.render({ images: [avatar], texts: [], args: {} }, context);
  const sequence = await readMemeImageSequence(new File([Buffer.from(output)], "frame.gif"), context.signal);
  expect(sequence.averageDelayMs).toBe(60);
  expect(sequence.frames).toHaveLength(2);
  expect(pixels(sequence.frames[0])(160, 160)).toEqual([255, 0, 0, 255]);
  expect(pixels(sequence.frames[1]!)(160, 160)).toEqual([255, 255, 0, 255]);
  expect(pixels(sequence.frames[1]!)(37, 43)).toEqual([0, 0, 0, 0]);
});
