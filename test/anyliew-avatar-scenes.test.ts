import { expect, test } from "bun:test";
import { Canvas, loadImage } from "skia-canvas";
import { anyliewAvatarSceneAssets } from "../backend-anyliew-avatar-scene-assets.ts";
import { anyliewAvatarSceneTemplates } from "../templates/anyliew-avatar-scenes.ts";

const expected = [
  ["all_the_days", ["一生一世"], 2, 0],
  ["begged_me", ["求我"], 1, 1],
  ["chillet_deer", ["疾风鹿"], 1, 1],
  ["cleverer", ["比聪明"], 1, 1],
  ["commemorate", ["奠", "寄"], 1, 1],
  ["dinosaur_head", ["恐龙头"], 1, 1],
  ["dog_girl", ["狗妹"], 1, 0],
  ["double_happiness", ["双喜"], 2, 0],
  ["ending", ["下场"], 2, 0],
] as const;

test("保留九项场景模板的原注册键、别名、素材路径和输入约束", () => {
  expect(anyliewAvatarSceneAssets.map<string>(([path]) => path)).toEqual(expected.map(([key]) => `emoji/${key}/images/0.png`));
  expect(anyliewAvatarSceneTemplates.map(({ info }) => [
    info.key, info.keywords, info.params_type.min_images, info.params_type.max_texts,
  ])).toEqual(expected.map(([key, keywords, images, texts]) => [key, keywords, images, texts]));
});

test("一生一世对应双头像位置、中心裁切和圆形蒙版", async () => {
  const signal = AbortSignal.timeout(10_000);
  async function avatar(background: string, square: string) {
    const canvas = new Canvas(90, 30);
    const draw = canvas.getContext("2d");
    draw.fillStyle = background;
    draw.fillRect(0, 0, 90, 30);
    draw.fillStyle = square;
    draw.fillRect(30, 0, 30, 30);
    return new File([new Uint8Array(await canvas.toBuffer("png"))], "avatar.png", {type: "image/png" });
  }
  const frame = new Canvas(776, 642);
  const draw = frame.getContext("2d");
  draw.fillStyle = "white";
  draw.fillRect(0, 0, 776, 642);
  const template = anyliewAvatarSceneTemplates.find(({ info }) => info.key === "all_the_days")!;
  const output = await template.render({ images: [await avatar("green", "blue"), await avatar("black", "red")], texts: [], args: {} }, {
    signal,
    async imageAsset(path) {
      expect(path).toBe("anyliew/emoji/all_the_days/images/0.png");
      return frame.toBuffer("png");
    },
    async fontAsset() { throw new Error("原模板没有文字"); },
  });
  expect([...output.slice(0, 2)]).toEqual([255, 216]);
  draw.drawImage(await loadImage(Buffer.from(output)), 0, 0);
  const pixel = (x: number, y: number) => [...draw.getImageData(x, y, 1, 1).data];
  expect(pixel(302, 302)).toEqual([254, 0, 0, 255]);
  expect(pixel(472, 257)).toEqual([0, 0, 254, 255]);
  expect(pixel(257, 257)).toEqual([255, 255, 255, 255]);
});
