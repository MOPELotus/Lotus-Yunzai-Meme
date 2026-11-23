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

const newCases = [
  { key: "your_new_years_eve", width: 758, height: 1080, center: [293, 865], padding: [10, 660] },
  { key: "keep_your_money", width: 1080, height: 1080, center: [250, 760], padding: [10, 450], asset: "arona.png", args: { number: 1 } },
  { key: "fight_with_sunuo", width: 1280, height: 1868, center: [280, 1000], gray: true },
  { key: "luotianyi_need", width: 573, height: 443, center: [140, 242], padding: [50, 155], avatarAboveArt: true },
  { key: "maimai_join", width: 500, height: 500, center: [250, 250] },
  { key: "need", width: 500, height: 440, center: [384, 289] },
  { key: "taunt", width: 720, height: 720, center: [360, 360], avatarAboveArt: true },
  { key: "sekaiichi_kawaii", width: 900, height: 506, center: [440, 252] },
  { key: "distracted", width: 500, height: 500, center: [250, 250], asset: "1.png", sticker: true },
] as const;

async function variantContext(key: string, width: number, height: number, above: boolean, hasSticker: boolean) {
  const art = new Canvas(width, height);
  const draw = art.getContext("2d");
  if (above) {
    draw.fillStyle = "#00f";
    draw.fillRect(0, 0, width, height);
  }
  const label = new Canvas(32, 32);
  const drawLabel = label.getContext("2d");
  drawLabel.fillStyle = "#0f0";
  drawLabel.fillRect(0, 0, 32, 32);
  const assets = await Promise.all([art.png, label.png]);
  const requested: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) {
      requested.push(path);
      return assets[hasSticker && path === `${key}/0.png` ? 1 : 0];
    },
    async fontAsset() { throw new Error("该模板不使用字体"); },
  };
  return { context, requested };
}

async function avatarImage(width: number, height: number) {
  const canvas = new Canvas(width, height);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#f00";
  draw.fillRect(0, 0, width, height);
  return new File([new Uint8Array(await canvas.png)], "red.png");
}

for (const entry of newCases) {
  const { key, width, height, center: [x, y] } = entry;
  test(`${key} 根据旧版变体构图选图`, async () => {
    const above = "avatarAboveArt" in entry;
    const hasSticker = "sticker" in entry;
    const { context, requested } = await variantContext(key, width, height, above, hasSticker);
    const template = builtinMemeTemplates.find(template => template.info.key === key)!;
    const args = "args" in entry ? entry.args : {};
    const jpeg = await template.render({ images: [await avatarImage(40, 10)], texts: [], args }, context);
    const image = await loadImage(Buffer.from(jpeg));
    expect([image.width, image.height]).toEqual([width, height]);
    const mainAsset = `${key}/${"asset" in entry ? entry.asset : "0.png"}`;
    expect(requested).toEqual(hasSticker ? [mainAsset, `${key}/0.png`] : [mainAsset]);
    if ("gray" in entry) expectRgb(image, x, y, 76, 76, 76);
    else expectRgb(image, x, y, 255, 0, 0);
    if ("padding" in entry) {
      const [left, top] = entry.padding;
      if (above) expectRgb(image, left, top, 0, 0, 255);
      else expectRgb(image, left, top, 255, 255, 255);
    }
    if (hasSticker) expectRgb(image, 156, 336, 0, 255, 0);
  });
}

test("保留压岁钱编号、随机选图和世界第一可爱的竖版", async () => {
  const money = builtinMemeTemplates.find(template => template.info.key === "keep_your_money")!;
  const { context, requested } = await variantContext(money.info.key, 1080, 1080, false, false);
  const input = { images: [await avatarImage(40, 10)], texts: [] };
  const parsed = parseGenerationArgs(money.info.params_type.args_type, "--number 2");
  expect(parsed).toMatchObject({ text: "", values: { number: 2 } });
  await money.render({ ...input, args: parsed.values }, context);
  expect(requested.pop()).toBe("keep_your_money/plana.png");
  await money.render({ ...input, args: {} }, context);
  expect(["keep_your_money/arona.png", "keep_your_money/plana.png"]).toContain(requested.pop()!);
  await expect(money.render({ ...input, args: { number: 3 } }, context)).rejects.toThrow("图片编号错误");

  const kawaii = builtinMemeTemplates.find(template => template.info.key === "sekaiichi_kawaii")!;
  const vertical = await variantContext(kawaii.info.key, 675, 900, false, false);
  const output = await kawaii.render({ images: [await avatarImage(10, 40)], texts: [], args: {} }, vertical.context);
  const portrait = await loadImage(Buffer.from(output));
  expect([portrait.width, portrait.height]).toEqual([675, 900]);
  expect(vertical.requested).toEqual(["sekaiichi_kawaii/1.png"]);
  expectRgb(portrait, 337, 450, 255, 0, 0);
});

test("注意力涣散保留旧静图半透明蒙版", async () => {
  const template = builtinMemeTemplates.find(template => template.info.key === "distracted")!;
  const frame = new Canvas(500, 500);
  const paint = frame.getContext("2d");
  paint.fillStyle = "rgba(0, 0, 255, 0.5)";
  paint.fillRect(0, 0, 500, 500);
  const [art, sticker] = await Promise.all([frame.png, new Canvas(1, 1).png]);
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { return path.endsWith("/1.png") ? art : sticker; },
    async fontAsset() { throw new Error("该模板不使用字体"); },
  };
  const bytes = await template.render({ images: [await avatarImage(20, 20)], texts: [], args: {} }, context);
  expectRgb(await loadImage(Buffer.from(bytes)), 230, 230, 159, 64, 160);
});
