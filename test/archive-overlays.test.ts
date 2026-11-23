import { expect, test } from "bun:test";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { archiveOverlayTemplates } from "../templates/archive-overlays.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { previewImage } from "../templates/template-layout.ts";

test("原包装静图格式与随机底图编号分别保留", async () => {
  const signal = AbortSignal.timeout(12_000);
  const context = { ...createBundledMemeResources(signal), signal };
  const image = await previewImage(signal);
  const input = { images: [image], texts: ["画面测试"], args: {} };
  const get = (key: string) => archiveOverlayTemplates.find(template => template.info.key === key)!;
  const [angel, cleaner] = await Promise.all([
    get("fleshlight_angel").render(input, context),
    get("fleshlight_jissbon").render(input, context),
  ]);
  expect(Buffer.from(angel).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(Buffer.from(cleaner).subarray(0, 3).toString("hex")).toBe("ffd8ff");
  const random = get("fleshlight_random");
  const [first, last] = await Promise.all([
    random.render({ ...input, args: { number: 1 } }, context),
    random.render({ ...input, args: { number: 25 } }, context),
  ]);
  expect(Buffer.from(first).subarray(0, 3).toString("hex")).toBe("ffd8ff");
  expect(Buffer.from(first).equals(last)).toBeFalse();
  expect(() => random.render({ ...input, args: { number: 26 } }, context)).toThrow("1~25");
}, 15_000);

test("独立透视模板从原素材输出 GIF", async () => {
  const signal = AbortSignal.timeout(12_000);
  const context = { ...createBundledMemeResources(signal), signal };
  const animated = archiveOverlayTemplates.find(template => template.info.key === "fleshlight")!;
  const image = await previewImage(signal);
  const output = await animated.render({ images: [image], texts: [], args: {} }, context);
  const decoded = await readMemeImageSequence(new File([new Uint8Array(output)], "result.gif"), signal);
  expect([decoded.frames[0].width, decoded.frames[0].height]).toEqual([640, 360]);
  expect(decoded.averageDelayMs * decoded.frames.length).toBe(3_400);
}, 15_000);
