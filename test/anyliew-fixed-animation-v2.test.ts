import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import { anyliewFixedAnimationV2Assets } from "../backend-anyliew-fixed-animation-v2-assets.ts";
import { anyliewFixedAnimationV2 } from "../templates/anyliew-fixed-animation-v2.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";

const template = (key: string) => anyliewFixedAnimationV2.find(({ info }) => info.key === key)!;

function imageFile(bytes: Uint8Array, type: string) {
  return new File([new Uint8Array(bytes)], "image", { type });
}

async function avatar() {
  const canvas = new Canvas(20, 30);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#00f";
  draw.fillRect(0, 0, canvas.width, canvas.height);
  return imageFile(await canvas.toBuffer("png"), "image/png");
}

test("坤年的十二帧只按原节奏循环前七张固定底图", async () => {
  expect(anyliewFixedAnimationV2Assets.filter(([path]) => path.startsWith("emoji/ikun_year/"))).toHaveLength(7);
  const signal = AbortSignal.timeout(15_000);
  const frames: number[] = [];
  const output = await template("ikun_year").render({ images: [await avatar()], texts: [], args: {} }, {
    signal,
    async imageAsset(path) {
      const id = Number(/\/(\d+)\.png$/u.exec(path)?.[1]);
      frames.push(id);
      const canvas = new Canvas(224, 224);
      const draw = canvas.getContext("2d");
      draw.fillStyle = "#f00";
      draw.fillRect(id * 4, 1, 4, 4);
      return canvas.toBuffer("png");
    },
    async fontAsset() { throw new Error("原模板没有字体"); },
  });
  expect(frames).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5]);
  const decoded = await readMemeImageSequence(imageFile(output, "image/gif"), signal);
  expect(decoded.frames).toHaveLength(12);
  expect(decoded.averageDelayMs).toBe(50);
});

test("奶龙吻前三帧只保留原底图，第四帧开始显示头像", async () => {
  const signal = AbortSignal.timeout(15_000);
  const output = await template("nailoong_kiss").render({ images: [await avatar()], texts: [], args: {} }, {
    signal,
    async imageAsset(path) {
      const id = Number(/\/(\d+)\.png$/u.exec(path)?.[1]);
      const canvas = new Canvas(336, 300);
      const draw = canvas.getContext("2d");
      draw.fillStyle = "#f00";
      draw.fillRect(id * 4, 1, 4, 4);
      return canvas.toBuffer("png");
    },
    async fontAsset() { throw new Error("原模板没有字体"); },
  });
  const decoded = await readMemeImageSequence(imageFile(output, "image/gif"), signal);
  expect(decoded.frames).toHaveLength(20);
  expect(decoded.averageDelayMs).toBe(130);
  const avatarPixel = (index: number) => {
    const canvas = new Canvas(336, 300);
    const draw = canvas.getContext("2d");
    draw.drawImage(decoded.frames[index]!, 0, 0);
    return [...draw.getImageData(78, 67, 1, 1).data];
  };
  for (let index = 0; index < 3; index++) expect(avatarPixel(index)).toEqual([0, 0, 0, 0]);
  expect(avatarPixel(3)).toEqual([0, 0, 255, 255]);
});
