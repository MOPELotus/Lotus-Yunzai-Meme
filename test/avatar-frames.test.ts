import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { avatarFrameMemeTemplates } from "../templates/avatar-frames.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const expected = [
  ["mihoyo_amber_frame", ["安柏相框"], [36, 40, 245, 245], [318, 318]],
  ["mihoyo_barbara_pegg_frame", ["芭芭拉相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_barbatos_frame", ["巴巴托斯", "风神相框"], [36, 40, 245, 245], [318, 318]],
  ["mihoyo_caribert_alberich_frame", ["卡利贝尔相框"], [72, 80, 490, 490], [636, 636]],
  ["mihoyo_chasca_frame", ["恰斯卡相框"], [40, 42, 245, 245], [318, 318]],
  ["mihoyo_citlali_frame", ["茜特菈莉相框", "奶奶相框"], [30, 30, 270, 270], [318, 318]],
  ["mihoyo_editorial_society_frame", ["编辑协会相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_gemini_frame", ["双子相框"], [38, 40, 245, 245], [318, 318]],
  ["mihoyo_guoba_frame", ["锅巴相框"], [44, 42, 245, 245], [318, 318]],
  ["mihoyo_hilichurl_frame", ["丘丘人相框"], [40, 40, 240, 240], [318, 318]],
  ["mihoyo_hutao_frame", ["胡桃相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_kaveh_frame", ["卡维相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_klee_duduke_frame", ["可莉嘟嘟可相框", "嘟嘟可"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_klee_frame", ["可莉相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_klee_hat_frame", ["可莉帽子相框"], [40, 40, 240, 240], [318, 318]],
  ["mihoyo_kujou_sara_frame", ["九条裟罗相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_kuki_shinobu_frame", ["久岐忍相框", "阿忍相框"], [38, 40, 245, 245], [318, 318]],
  ["mihoyo_lce_slime_frame", ["冰史莱姆相框"], [84, 83, 434, 427], [600, 600]],
  ["mihoyo_outlander_frame", ["异乡人相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_paimon_emergency_food_frame", ["应急食品相框"], [72, 84, 490, 490], [636, 636]],
  ["mihoyo_paimon_frame", ["派蒙相框"], [40, 38, 245, 245], [318, 318]],
  ["mihoyo_shikanoin_heizou_frame", ["鹿野院平藏相框"], [36, 42, 245, 245], [318, 318]],
  ["mihoyo_tartaglia_frame", ["达达利亚相框", "阿贾克斯相框", "公子相框"], [36, 40, 245, 245], [318, 318]],
  ["mihoyo_tepetlisauri_frame", ["嵴锋龙相框"], [36, 45, 245, 245], [318, 318]],
  ["mihoyo_thunderbolt_slime_frame", ["雷史莱姆相框", "雷电史莱姆相框"], [40, 38, 245, 245], [318, 318]],
  ["mihoyo_traveler_frame", ["旅行者相框"], [36, 40, 245, 245], [318, 318]],
  ["mihoyo_wind_slime_frame", ["风史莱姆相框"], [38, 38, 245, 245], [318, 318]],
  ["springframe", ["春日燕归来"], [23, 28, 159, 159], [200, 200]],
] as const;

function layerFixture(width = 318, height = 318) {
  const canvas = new Canvas(width, height);
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

test("旧相框保留目录别名、精确偏移、透明圆形裁剪和框在上方的图层顺序", async () => {
  const avatar = new File([Buffer.from(await avatarFixture().png)], "avatar.png");
  expect(avatarFrameMemeTemplates).toHaveLength(expected.length);
  for (const [index, [key, keywords, [left, top, width, height], size]] of expected.entries()) {
    const { context, paths } = layerFixture(...size);
    const template = avatarFrameMemeTemplates[index]!;
    expect(template.info).toEqual({
      key, keywords, tags: key === "springframe" ? [] : ["米哈游", "原神"],
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
    });
    const image = await loadImage(Buffer.from(await template.render({ images: [avatar], texts: [], args: {} }, context)));
    expect([image.width, image.height]).toEqual([...size]);
    const centerX = left + Math.floor(width / 2), centerY = top + Math.floor(height / 2);
    const pixel = pixels(image);
    expect(pixel(centerX, top - 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(centerX, top + 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(left - 1, centerY)).toEqual([0, 0, 0, 0]);
    expect(pixel(left + 1, centerY)).toEqual([255, 0, 0, 255]);
    expect(pixel(left + 1, top + 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(155, 155)).toEqual([0, 255, 0, 255]);
    expect(pixel(centerX, top + height)).toEqual([0, 0, 0, 0]);
    expect(pixel(left + width, centerY)).toEqual([0, 0, 0, 0]);
    const path = `anyliew/emoji/${key}/images/0.png`;
    expect(paths).toEqual([path]);
    expect(extraMemeAssets.get(`images/${path}`)?.path).toBe(`emoji/${key}/images/0.png`);
  }
});

test("相框预览可用且输入 GIF 的两帧与平均间隔保留在透明 GIF 输出", async () => {
  const { context } = layerFixture();
  const template = avatarFrameMemeTemplates.find(({ info }) => info.key === "mihoyo_kaveh_frame");
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
