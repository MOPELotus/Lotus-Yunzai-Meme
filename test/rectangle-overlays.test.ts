import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import { anyliewRectangleOverlayAssets } from "../backend-rectangle-overlay-assets.ts";
import type { MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { rectangleOverlayTemplates } from "../templates/rectangle-overlays.ts";

const expected = [
  ["deer_time", ["鹿管时间"], [281, 222, 305, 305], [1200, 1200]],
  ["doro_group_photo", ["doro合影", "Doro合影", "桃乐丝合影"], [112, 430, 407, 407], [1536, 1024]],
  ["error3b", ["30亿error", "三十亿报错"], [0, 0, 1024, 1024], [1024, 1024]],
  ["mihoyo_columbina_hug", ["少女抱", "哥伦比娅抱", "月神抱"], [510, 470, 467, 432], [1484, 1080]],
  ["mihoyo_ineffa_droid", ["人机"], [96, 79, 165, 135], [442, 416]],
  ["mihoyo_senior_phone", ["米学长手机"], [533, 495, 140, 210], [1126, 1377]],
  ["mixue", ["蜜雪冰城"], [380, 140, 270, 230], [960, 800]],
  ["nakano_ltsuki", ["中野五月"], [125, 130, 195, 195], [420, 420]],
  ["nakano_nino", ["中野二乃"], [110, 120, 210, 210], [420, 420]],
  ["naruro_resurrection", ["复活", "立即复活"], [1, 1, 339, 286], [342, 404]],
  ["naruto_bagua_seal", ["八卦封印"], [308, 330, 391, 368], [1000, 1000]],
  ["pregnancy_test", ["验孕棒"], [1, 1, 640, 640], [640, 640]],
  ["slam_table", ["砸桌"], [295, 13, 417, 417], [920, 920]],
  ["yuzu_soft_ciallo", ["ciallo", "ciallo~"], [364, 363, 355, 295], [1080, 1080]],
  ["yuzu_soft_ignore", ["视若无睹"], [95, 42, 340, 204], [1280, 852]],
] as const;

const rotations = [
  ["baby", ["宝宝", "BB", "bb", "baby", "Baby"], [140, 480, 235, 235], [850, 1048], -8, [267, 267]],
  ["drumstick", ["🍗", "鸡腿"], [150, 450, 339, 286], [1032, 1001], -10, [385, 342]],
  ["izumi_sagiri_painting", ["和泉纱雾画画"], [350, 1423, 1270, 730], [2531, 2531], -10, [1378, 940]],
  ["mygo_sakiko_togawa", ["丰川祥子", "祥子", "豊川祥子"], [105, 70, 150, 150], [300, 300], -5, [164, 164]],
  ["pineapples", ["🍍", "菠萝头"], [240, 576, 320, 280], [1146, 1145], -15, [382, 354]],
  ["scissor_seven_head", ["伍六七", "阿七"], [100, 120, 200, 200], [420, 420], -4, [214, 214]],
  ["yuzu_soft_murasame_ipad", ["丛雨平板"], [280, 475, 520, 350], [1080, 1532], -3, [538, 378]],
] as const;

const circularRotations = [
  ["anyliew_struggling", ["挣扎"], [275, 28, 300, 300], [1144, 1514], 25, [400, 400], 0],
  ["durian", ["榴莲"], [200, 425, 475, 475], [1080, 1156], -10, [551, 551], 1],
  ["jd_takeout", ["京东外卖"], [625, 5, 230, 230], [1284, 996], 10, [268, 268], 0],
  ["mihoyo_columbina_jade_feet", ["玉足"], [373, 255, 125, 125], [1228, 688], -35, [175, 175], 0],
  ["ikun_basketball", ["篮球", "🏀"], [322, 129, 250, 250], [896, 1152], 10, [290, 290], 0],
] as const;

const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const colored = [255, 255, 0, 255];
const green = [0, 255, 0, 255];
const clear = [0, 0, 0, 0];

function pixels(image: Image) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return (x: number, y: number) => Array.from(draw.getImageData(x, y, 1, 1).data);
}

function contextFixture(key: string, width: number, height: number, centerX: number, centerY: number) {
  const canvas = new Canvas(width, height);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#00ff00";
  draw.fillRect(centerX, centerY, 10, 10);
  draw.fillStyle = "rgba(0, 255, 0, 0.5)";
  draw.fillRect(centerX + 12, centerY, 10, 10);
  let count = 0;
  const context: MemeTemplateContext = {
    signal: AbortSignal.timeout(35_000),
    async imageAsset(path) {
      expect(path).toBe(`anyliew/emoji/${key}/images/0.png`);
      count++;
      return canvas.png;
    },
    async fontAsset() { throw new Error("原图叠层无需字体"); },
  };
  return { context, count: () => count };
}

function sourceImage() {
  const canvas = new Canvas(60, 20);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#ffff00";
  draw.fillRect(0, 0, 60, 20);
  draw.fillStyle = "#ff0000";
  draw.fillRect(0, 0, 9, 20);
  draw.fillStyle = "#0000ff";
  draw.fillRect(51, 0, 9, 20);
  return canvas;
}

test("十五款原图叠层沿用旧关键词、矩形拉伸、前后顺序、RGBA 蒙版和原尺寸", async () => {
  const file = new File([Buffer.from(await sourceImage().png)], "portrait.png");
  const allKeys = [...expected, ...rotations, ...circularRotations].map(([key]) => key);
  expect(rectangleOverlayTemplates.map(template => template.info.key)).toEqual(allKeys);
  expect(anyliewRectangleOverlayAssets.map(([path]) => path)).toEqual(allKeys.map(key => `emoji/${key}/images/0.png` as const));
  for (const [index, [key, keywords, [left, top, width, height], size]] of expected.entries()) {
    const template = rectangleOverlayTemplates[index]!;
    const centerX = left + Math.floor(width / 2), centerY = top + Math.floor(height / 2);
    const source = contextFixture(key, size[0], size[1], centerX, centerY);
    expect(template.info.keywords).toEqual([...keywords]);
    expect(template.info.params_type).toEqual({
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null,
    });
    const bytes = await template.render({ images: [file], texts: [], args: {} }, source.context);
    const image = await loadImage(Buffer.from(bytes));
    expect([image.width, image.height]).toEqual([...size]);
    const pixel = pixels(image);
    expect(pixel(left + Math.floor(width / 10), centerY)).toEqual(red);
    expect(pixel(left + Math.floor(width * 0.90), centerY)).toEqual(blue);
    expect(pixel(centerX, centerY)).toEqual(green);
    expect(pixel(centerX + 14, centerY)).toEqual([127, 255, 0, 191]);
    expect(pixel(0, 0)).toEqual(clear);
    if (key === "error3b") {
      expect(pixel(centerX, 1)).toEqual(colored);
      expect(pixel(33, 33)).toEqual(clear);
      expect(pixel(centerX, size[1] - 2)).toEqual(colored);
    }
    expect(source.count()).toBe(1);
  }
}, 45_000);

test("叠层保留透明 GIF 的帧数和平均间隔，Ciallo 保留双星快捷", async () => {
  const template = rectangleOverlayTemplates.find(({ info }) => info.key === "mihoyo_ineffa_droid")!;
  const ciallo = rectangleOverlayTemplates.find(({ info }) => info.key === "yuzu_soft_ciallo")!;
  expect(ciallo.info.shortcuts?.map(({ key }) => key)).toEqual(["ciallo", "ciallo～(∠・ω< )⌒★", "ciallo～(∠・ω< )⌒☆"]);
  const { context } = contextFixture(template.info.key, 442, 416, 178, 146);
  const inputFrames = [sourceImage(), sourceImage()];
  const alternate = inputFrames[1]!.getContext("2d");
  alternate.fillStyle = "#ff00ff";
  alternate.fillRect(0, 0, 60, 20);
  const raw = await Promise.all(inputFrames.map(async (canvas, index) => ({
    rgba: await canvas.toBuffer("raw", { colorType: "rgba", premultiplied: false }), delayMs: 40 + 40 * index,
  })));
  const images = [new File([Buffer.from(encodeMemeGif(60, 20, raw, context.signal))], "source.gif")];
  const input: MemeTemplateInput = { images, texts: [], args: {} };
  const output = await template.render(input, context);
  const result = await readMemeImageSequence(new File([Buffer.from(output)], "output.gif"), context.signal);
  expect(result.frames).toHaveLength(2);
  expect(result.averageDelayMs).toBe(60);
  expect(pixels(result.frames[0])(115, 146)).toEqual(red);
  expect(pixels(result.frames[1]!)(115, 146)).toEqual([255, 0, 255, 255]);
  expect(pixels(result.frames[1]!)(0, 0)).toEqual(clear);
});

test("七款斜置头像沿用旧扩边中点和旋转方向", async () => {
  const avatar = new File([Buffer.from(await sourceImage().png)], "portrait.png");
  for (const [key, keywords, [left, top, width, height], size, angle, expanded] of rotations) {
    const template = rectangleOverlayTemplates.find(({ info }) => info.key === key)!;
    const centerX = left + expanded[0] / 2, centerY = top + expanded[1] / 2;
    const source = contextFixture(key, size[0], size[1], Math.floor(centerX), Math.floor(centerY));
    const bytes = await template.render({ images: [avatar], texts: [], args: {} }, source.context);
    const image = await loadImage(Buffer.from(bytes));
    expect(template.info.keywords).toEqual([...keywords]);
    expect([image.width, image.height]).toEqual([...size]);
    const pixel = pixels(image);
    const radians = -angle * Math.PI / 180;
    const point = (x: number, y: number) => pixel(
      Math.floor(centerX + x * Math.cos(radians) - y * Math.sin(radians)),
      Math.floor(centerY + x * Math.sin(radians) + y * Math.cos(radians)),
    );
    expect(point(-width / 2 + 4, -height / 2 + 4)).toEqual(red);
    expect(point(width / 2 - 4, height / 2 - 4)).toEqual(blue);
    expect(pixel(Math.floor(centerX), Math.floor(centerY))).toEqual(green);
    expect(pixel(left + 1, top + 1)).toEqual(clear);
    expect(source.count()).toBe(1);
  }
}, 45_000);

test("五款圆裁斜置叠图保留中心正圆、方向和旧文字参数", async () => {
  const sourceImage = new Canvas(60, 20);
  const draw = sourceImage.getContext("2d");
  draw.fillStyle = "#0000ff";
  draw.fillRect(0, 0, 60, 20);
  draw.fillStyle = "#ff0000";
  draw.fillRect(20, 0, 10, 20);
  draw.fillStyle = "#ffff00";
  draw.fillRect(30, 0, 10, 20);
  const avatar = new File([Buffer.from(await sourceImage.png)], "portrait.png");
  for (const [key, keywords, [left, top, width, height], size, angle, expanded, maxTexts] of circularRotations) {
    const template = rectangleOverlayTemplates.find(({ info }) => info.key === key)!;
    const centerX = left + expanded[0] / 2, centerY = top + expanded[1] / 2;
    const { context } = contextFixture(key, size[0], size[1], Math.floor(centerX), Math.floor(centerY));
    const input = { images: [avatar], texts: [], args: {} };
    const bytes = await template.render(input, context);
    const image = await loadImage(Buffer.from(bytes));
    expect(template.info.keywords).toEqual([...keywords]);
    expect(template.info.params_type.max_texts).toBe(maxTexts);
    expect([image.width, image.height]).toEqual([...size]);
    const pixel = pixels(image);
    const radians = -angle * Math.PI / 180;
    const point = (x: number, y: number) => pixel(
      Math.floor(centerX + x * Math.cos(radians) - y * Math.sin(radians)),
      Math.floor(centerY + x * Math.sin(radians) + y * Math.cos(radians)),
    );
    expect(point(-width * 0.32, 0)).toEqual(red);
    expect(point(width * 0.32, 0)).toEqual(colored);
    expect(point(width * 0.12, Math.sign(radians) * height * 0.34)).toEqual(colored);
    expect(point(width * 0.4, height * 0.4)).toEqual(clear);
    expect(pixel(Math.floor(centerX), Math.floor(centerY))).toEqual(green);
    if (maxTexts) expect(await template.render({ ...input, texts: ["旧昵称"] }, context)).toEqual(bytes);
  }
}, 45_000);
