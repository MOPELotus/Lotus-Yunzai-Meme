import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { anyliewLocalCanvasAssets, hanbaomaodieCanvasAssets } from "../backend-local-canvas-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { localCanvasAnimations } from "../templates/local-canvas-animation.ts";

test("保留各源动图的旧别名与单图参数", () => {
  expect(localCanvasAnimations.map(({ info }) => [info.key, info.keywords])).toEqual([
    ["lemon", ["柠檬"]], ["estrous", ["发情"]], ["hanbaomaodie", ["汉堡耄耋"]], ["lemonade", ["柠檬水"]],
  ]);
  for (const template of localCanvasAnimations) {
    expect(builtinMemeTemplates.includes(template)).toBeTrue();
    expect(template.info.params_type).toMatchObject({
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null,
    });
  }
});

test("本机包注册全部局部原帧并从内置资源读取", async () => {
  const { files } = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json() as {
    files: Record<string, string>;
  };
  expect(anyliewLocalCanvasAssets.length + hanbaomaodieCanvasAssets.length).toBe(278);
  expect(anyliewLocalCanvasAssets.every(([path, digest]) => files[`images/anyliew/${path}`] === digest)).toBeTrue();
  expect(hanbaomaodieCanvasAssets.every(([path, { digest }]) => files[path] === digest)).toBeTrue();
  const bundled = createBundledMemeResources(new AbortController().signal);
  for (const path of ["anyliew/emoji/lemon/images/92.png", "anyliew/emoji/estrous/images/33.png",
    "python/meme_generator/memes/hanbaomaodie/tudou/0.png", "anyliew/emoji/lemonade/images/147.png"]) {
    expect((await bundled.imageAsset(path)).subarray(0, 4)).toEqual(Buffer.from([137, 80, 78, 71]));
  }
});

test("缩小的局部帧裁掉伸出本帧的头像部分，下一帧恢复且保留总时长", async () => {
  const [avatar, wide, narrow] = await Promise.all([
    renderExactPng(32, 16, draw => {
      draw.fillStyle = "#f00";
      draw.fillRect(0, 0, 32, 16);
    }),
    renderExactPng(117, 119, () => {}),
    renderExactPng(50, 42, () => {}),
  ]);
  const signal = new AbortController().signal;
  const { render } = localCanvasAnimations[0]!;
  const bytes = await render({ images: [new File([new Uint8Array(avatar.png)], "avatar.png")], texts: [], args: {} }, {
    signal,
    async imageAsset(path) { return path.endsWith("/2.png") ? narrow.png : wide.png; },
    async fontAsset() { throw new Error("旧模板不读取字体"); },
  });
  const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), signal);
  expect(result.frames).toHaveLength(3);
  expect(result.averageDelayMs * result.frames.length).toBe(92 * 60);
  for (const [index, frame] of result.frames.entries()) {
    expect([frame.width, frame.height]).toEqual([117, 119]);
    const { rgba } = await renderRgba(frame.width, frame.height, draw => draw.drawImage(frame, 0, 0));
    expect(rgba[(35 * frame.width + 45) * 4 + 3]).toBe(255);
    expect(rgba[(61 * frame.width + 52) * 4 + 3]).toBe(index === 1 ? 0 : 255);
    expect(rgba[(118 * frame.width + 116) * 4 + 3]).toBe(0);
  }
});
