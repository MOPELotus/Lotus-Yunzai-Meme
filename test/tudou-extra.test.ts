import { expect, test } from "bun:test";
import { Canvas, loadImage } from "skia-canvas";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { previewImage } from "../templates/template-layout.ts";
import { tudouExtraTemplates } from "../templates/tudou-extra.ts";

const signal = AbortSignal.timeout(30_000);
const context = { signal, ...createBundledMemeResources(signal) };
const find = (key: string) => tudouExtraTemplates.find(template => template.info.key === key)!;

test("飞鸡保留单帧 GIF 和两张头像，巨物保留不透明 PNG", async () => {
  const avatar = await previewImage(signal);
  const feiji = find("feiji");
  expect(feiji.info.params_type.min_images).toBe(2);
  const gif = await feiji.render({ images: [avatar, avatar], texts: [], args: {} }, context);
  expect(Buffer.from(gif).toString("ascii", 0, 6)).toBe("GIF89a");
  const decoded = await readMemeImageSequence(new File([new Uint8Array(gif)], "feiji.gif"), signal);
  expect(decoded.frames).toHaveLength(1);
  expect([decoded.frames[0].width, decoded.frames[0].height]).toEqual([1179, 1099]);

  const rendered = await find("juwu").render({ images: [avatar], texts: [], args: {} }, context);
  expect(Buffer.from(rendered).toString("hex", 0, 8)).toBe("89504e470d0a1a0a");
  const preview = await loadImage(Buffer.from(rendered));
  const canvas = new Canvas(preview.width, preview.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(preview, 0, 0);
  const pixels = draw.getImageData(0, 0, preview.width, preview.height).data;
  expect(pixels.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
});

test("相同动图输入保留白嫖怪的静图模式和哥们抱的动图模式", async () => {
  const frames = [40, 70, 100].map((delayMs, index) => ({
    delayMs,
    rgba: Uint8Array.from({ length: 8 * 8 * 4 }, (_, offset) => offset % 4 === index || offset % 4 === 3 ? 255 : 0),
  }));
  const gif = encodeMemeGif(8, 8, frames, signal);
  const input = { images: [new File([new Uint8Array(gif)], "animated.gif")], texts: [], args: {} };
  const jpeg = await find("baipiaoguai").render(input, context);
  expect(Buffer.from(jpeg).toString("hex", 0, 3)).toBe("ffd8ff");
  const result = await find("gemen_hug").render(input, context);
  const decoded = await readMemeImageSequence(new File([new Uint8Array(result)], "gemen.gif"), signal);
  expect(decoded.frames).toHaveLength(3);
  expect(decoded.averageDelayMs).toBe(70);
});
