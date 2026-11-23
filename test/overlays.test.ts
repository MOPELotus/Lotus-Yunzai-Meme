import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

const cases = [
  ["blood_pressure", 1080, 1080, 16, 17],
  ["pinch", 2880, 1440, 1080, 0],
  ["think_what", 1080, 1036, 530, 0],
  ["mourning", 1920, 1080, 645, 145],
  ["dont_go_near", 600, 600, 23, 231],
  ["walnut_pad", 960, 540, 368, 65],
  ["dinosaur", 1080, 1080, 294, 369],
  ["let_me_in", 1080, 810, 320, 0],
] as const;

function rgb(image: Image, left: number, top: number) {
  const draw = new Canvas(image.width, image.height).getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(left, top, 1, 1).data].slice(0, 3);
}

function expectRgb(image: Image, left: number, top: number, red: number, green: number, blue: number) {
  const distance = rgb(image, left, top).map((channel, index) => Math.abs(channel - [red, green, blue][index]!));
  expect(Math.max(...distance)).toBeLessThanOrEqual(8);
}

async function fixture([key, width, height, left, top]: typeof cases[number]) {
  const art = new Canvas(width, height);
  const draw = art.getContext("2d");
  draw.fillStyle = "#00f";
  draw.fillRect(left + 16, top + 16, 24, 24);
  const png = await art.png;
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) {
      expect(path).toBe(`${key}/0.png`);
      return png;
    },
    async fontAsset() { throw new Error("该模板不使用字体"); },
  };
  const avatar = new Canvas(60, 8);
  const paint = avatar.getContext("2d");
  paint.fillStyle = "#0f0";
  paint.fillRect(0, 0, 60, 8);
  paint.fillStyle = "#f00";
  paint.fillRect(20, 0, 20, 8);
  const still = new File([new Uint8Array(await avatar.png)], "avatar.png");
  const colors = key === "pinch" ? [255, 50, 80, 120, 130, 160, 180] : [255, 0];
  const frames = colors.map((red, index) => ({
    delayMs: index < 2 ? [120, 160][index]! : 140,
    rgba: Uint8Array.from(Array.from({ length: 4 }, () => [red, index === 1 ? 255 : 0, 0, 255]).flat()),
  }));
  const moving = new File([new Uint8Array(encodeMemeGif(2, 2, frames, context.signal))], "avatar.gif");
  return { context, still, moving, frameCount: frames.length };
}

for (const definition of cases) {
  const [key, width, height, left, top] = definition;
  test(`${key} 保持固定素材、居中裁切及 JPG/GIF 输出`, async () => {
    const template = builtinMemeTemplates.find(template => template.info.key === key)!;
    const { context, still, moving, frameCount } = await fixture(definition);
    const opts = { texts: [], args: {} };
    const jpeg = await template.render({ images: [still], ...opts }, context);
    expect(Array.from(jpeg.subarray(0, 2))).toEqual([255, 216]);
    const image = await loadImage(Buffer.from(jpeg));
    expect([image.width, image.height]).toEqual([width, height]);
    expectRgb(image, left + 70, top + 64, 255, 0, 0);
    const avatarAboveArt = key === "dont_go_near";
    expectRgb(image, left + 28, top + 28, avatarAboveArt ? 255 : 0, 0, avatarAboveArt ? 0 : 255);

    const bytes = await template.render({ images: [moving], ...opts }, context);
    expect(Buffer.from(bytes.subarray(0, 6)).toString()).toBe("GIF89a");
    const gif = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), context.signal);
    expect(gif.frames).toHaveLength(frameCount);
    expect(gif.averageDelayMs).toBe(140);
    const [first, second] = gif.frames;
    if (key === "pinch") expect(first.width * first.height * frameCount).toBeLessThanOrEqual(24_000_000);
    else expect([first.width, first.height]).toEqual([width, height]);
    const checkX = Math.floor((left + 70) * first.width / width);
    const checkY = Math.floor((top + 64) * first.height / height);
    expectRgb(first, checkX, checkY, 255, 0, 0);
    expectRgb(second!, checkX, checkY, key === "pinch" ? 50 : 0, 255, 0);
  });
}

test("上香保留 --black 和黑白别名，只将头像转为黑白", async () => {
  const template = builtinMemeTemplates.find(template => template.info.key === "mourning")!;
  const { context, still } = await fixture(cases[3]);
  for (const option of ["--black", "黑白"]) {
    const args = parseGenerationArgs(template.info.params_type.args_type, option);
    expect(args).toMatchObject({ text: "", values: { black: true } });
    const bytes = await template.render({ images: [still], texts: [], args: args.values }, context);
    const image = await loadImage(Buffer.from(bytes));
    expectRgb(image, 718, 209, 76, 76, 76);
    expectRgb(image, 673, 173, 0, 0, 255);
  }
});
