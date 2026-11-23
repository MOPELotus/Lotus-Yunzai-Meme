import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import { anyliewAvatarCycleAssets, anyliewDeerHelpAsset } from "../backend-anyliew-avatar-cycle-assets.ts";
import { anyliewAvatarCycleTemplates } from "../templates/anyliew-avatar-cycle.ts";
import { anyliewDeerHelpTemplate } from "../templates/anyliew-deer-help.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { createFixedAvatarAnimation } from "../templates/fixed-avatar-animation.ts";
import { encodeMemeGif } from "../templates/gif.ts";

test("旧固定头像批次只登记实际素材，帮鹿沿用旧两图版本", () => {
  expect(anyliewAvatarCycleTemplates).toHaveLength(9);
  expect(anyliewAvatarCycleAssets).toHaveLength(375);
  expect(anyliewDeerHelpAsset[1].sources[0]).toContain("5ccd78638b9a5272472659d411fba9a408705a92");
  expect(anyliewDeerHelpTemplate.info).toMatchObject({
    key: "deer_help", keywords: ["帮鹿", "帮🦌"], params_type: { min_images: 2, max_images: 2, max_texts: 0 },
  });
});

test("仅显式选择零延时才保留原 0 厘秒", () => {
  const signal = AbortSignal.timeout(10_000);
  const frame = { rgba: Uint8Array.from([255, 0, 0, 255]), delayMs: 0 };
  const delay = (bytes: Uint8Array) => {
    const buffer = Buffer.from(bytes);
    const gce = buffer.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
    return buffer.readUInt16LE(gce + 4);
  };
  expect(delay(encodeMemeGif(1, 1, [frame], signal))).toBe(1);
  expect(delay(encodeMemeGif(1, 1, [frame], signal, { preserveZeroDelay: true }))).toBe(0);
});

test("动头像按原源帧顺序循环，从可见区起记且取中心方形", async () => {
  const signal = AbortSignal.timeout(10_000);
  function portrait(color: readonly [number, number, number], delayMs: number) {
    const rgba = new Uint8Array(6 * 2 * 4);
    for (let n = 0; n < 12; n++) rgba.set(n % 6 === 2 || n % 6 === 3 ? [...color, 255] : [0, 255, 0, 255], n * 4);
    return { rgba, delayMs };
  }
  const file = new File([new Uint8Array(encodeMemeGif(6, 2, [
    portrait([255, 0, 0], 20), portrait([0, 0, 255], 200),
  ],signal))], "avatar.gif");
  const template = createFixedAvatarAnimation({
    key: "fixture", keywords: [], frames: 4, delayMs: 60, positions: [0, 0], sizes: [4, 4],
    avatarStart: 1, avatarFrames: 3, cycleSquareAvatar: true,
  });
  const overlay = await new Canvas(6, 6).toBuffer("png");
  const gif = await template.render({ images: [file], texts: [], args: {} }, {
    signal, async imageAsset() { return overlay; }, async fontAsset() { throw new Error("不读取字体"); },
  });
  const decoded = await readMemeImageSequence(new File([new Uint8Array(gif)], "output.gif"), signal);
  expect(decoded.frames).toHaveLength(4);
  expect(decoded.averageDelayMs).toBe(60);
  const rgba = decoded.frames.map(frame => {
    const canvas = new Canvas(6, 6);
    const draw = canvas.getContext("2d");
    draw.drawImage(frame, 0, 0);
    return [...draw.getImageData(2, 2, 1, 1).data];
  });
  expect(rgba).toEqual([[0, 0, 0, 0], [255, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 0]]);
});
