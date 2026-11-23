import { expect, test } from "bun:test";
import { Canvas, loadImage } from "skia-canvas";
import { anyliewStaticAvatarAssets } from "../backend-anyliew-static-avatar-assets.ts";
import { anyliewStaticAvatarTemplates } from "../templates/anyliew-static-avatar.ts";

const expected = [
  ["shipborne_laser_weapons", ["舰载激光武器"], 1, "png"],
  ["steal_two", ["双偷"], 3, "png"],
  ["swimsuit_group_photo", ["泳衣合影", "比基尼合影"], 2, "png"],
  ["throwing_poop", ["扔史"], 1, "png"],
  ["together_two", ["在一起"], 2, "jpg"],
  ["torture_yourself", ["折磨自己"], 2, "png"],
  ["ice_tea_head", ["冰红茶"], 1, "png"],
  ["mahiro_fuck", ["真寻中指", "中指", "🖕🏻"], 1, "png"],
  ["mi_monkey", ["米猴", "🐒", "🐵"], 1, "png"],
  ["mihoyo_funina_death_penalty", ["死刑"], 1, "png"],
  ["mihoyo_funina_finger", ["芙芙指", "芙宁娜指", "芙芙酱指"], 1, "png"],
  ["mihoyo_genshin_impact_op", ["OP", "op", "Op", "oP"], 1, "png"],
  ["mihoyo_genshin_impact_players", ["原批", "原神玩家"], 1, "png"],
  ["miss_in_my_sleep", ["睡梦中想念"], 1, "png"],
  ["ikun_durian_head", ["榴莲坤头"], 1, "png"],
  ["mihoyo_funina_square_head", ["芙芙方形头像", "芙宁娜方形头像"], 1, "png"],
  ["naruro_s_ninja", ["S忍", "s忍"], 1, "png"],
  ["pig_surrounded", ["被猪包围"], 1, "png"],
] as const;

test("头像场景保留旧键、触发词、图片数量和原素材名", () => {
  expect(anyliewStaticAvatarTemplates.filter(({ info }) => info.tags?.includes("原神")).map(({ info }) => info.key)).toEqual([
    "mihoyo_funina_death_penalty", "mihoyo_funina_finger", "mihoyo_genshin_impact_op",
    "mihoyo_genshin_impact_players", "mihoyo_funina_square_head",
  ]);
  expect(anyliewStaticAvatarAssets.map<string>(([path]) => path)).toEqual(
    expected.map(([key, , , ext]) => `emoji/${key}/images/0.${ext}`));
  expect(anyliewStaticAvatarTemplates.map(({ info }) => [
    info.key, info.keywords, info.params_type.min_images, info.params_type.max_images,
    info.params_type.min_texts, info.params_type.max_texts,
  ])).toEqual(expected.map(([key, keywords, images]) => [key, keywords, images, images, 0, 0]));
});

test("双偷保留三个圆形头像顺序及遮挡层", async () => {
  async function avatar(color: string) {
    const canvas = new Canvas(30, 30);
    const draw = canvas.getContext("2d");
    draw.fillStyle = color;
    draw.fillRect(0, 0, 30, 30);
    return new File([new Uint8Array(await canvas.toBuffer("png"))], "avatar.png", {type: "image/png" });
  }
  const canvas = new Canvas(805, 805);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#fea";
  draw.fillRect(265, 131, 60, 40);
  const template = anyliewStaticAvatarTemplates.find(({ info }) => info.key === "steal_two")!;
  const output = await template.render({ images: await Promise.all(["red", "green", "blue"].map(avatar)), texts: [], args: {} }, {
    signal: AbortSignal.timeout(10_000),
    async imageAsset(path) {
      expect(path).toBe("anyliew/emoji/steal_two/images/0.png");
      return canvas.toBuffer("png");
    },
    async fontAsset() { throw new Error("原模板没有文字"); },
  });
  expect([...output.slice(0, 2)]).toEqual([255, 216]);
  draw.drawImage(await loadImage(Buffer.from(output)), 0, 0);
  const pixel = (x: number, y: number) => [...draw.getImageData(x, y, 1, 1).data];
  expect(pixel(342, 145)).toEqual([254, 0, 0, 255]);
  expect(pixel(81, 374)).toEqual([0, 128, 0, 255]);
  expect(pixel(594, 449)).toEqual([0, 0, 254, 255]);
  expect(pixel(297, 150)[1]).toBeGreaterThan(220);
  expect(pixel(12, 306)).toEqual([255, 255, 255, 255]);
});
