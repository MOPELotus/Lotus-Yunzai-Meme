import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { anyliewTwoLayerAnimationAssets } from "../backend-two-layer-animation-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { twoLayerAvatarAnimations } from "../templates/two-layer-avatar-animation.ts";

test("两层动图保留实际源注册和逐帧固定素材", () => {
  const templates = new Map(twoLayerAvatarAnimations.map(template => [template.info.key, template.info]));
  const assets = new Map<string, string>(anyliewTwoLayerAnimationAssets);
  expect(templates.size).toBe(12);
  expect(assets.size).toBe(316);
  expect(twoLayerAvatarAnimations.every(template => builtinMemeTemplates.includes(template))).toBeTrue();
  expect(anyliewTwoLayerAnimationAssets.every(([path, digest]) => extraMemeAssets.get(`images/anyliew/${path}`)?.digest === digest)).toBeTrue();
  expect(templates.get("clownish")).toMatchObject({ keywords: ["滑稽"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null } });
  expect(templates.get("clownish")?.tags).toBeUndefined();
  expect(templates.get("ikun_666")?.keywords).toEqual(["666", "六六六"]);
  expect(assets.get("emoji/ikun_666/images/108.png")).toMatch(/^[\da-f]{64}$/u);
  expect(assets.has("emoji/ikun_666/images/109.png")).toBeFalse();
});

test("滑稽保留负坐标裁切，咖波拉继续在后段使用 2×2 头像层和原停顿", async () => {
  const [avatar, overlay] = await Promise.all([
    renderExactPng(40, 22, draw => {
      draw.fillStyle = "red";
      draw.fillRect(0, 0, 40, 22);
    }),
    renderExactPng(210, 190, () => {}),
  ]);
  const signal = new AbortController().signal;
  const input = { images: [new File([new Uint8Array(avatar.png)], "avatar.png")], texts: [], args: {} };
  function render(key: string) {
    const template = twoLayerAvatarAnimations.find(item => item.info.key === key)!;
    return template.render(input, { signal, async imageAsset() { return overlay.png; },
      async fontAsset() { throw new Error("旧模板不读取字体"); } });
  }
  const clown = await readMemeImageSequence(new File([new Uint8Array(await render("clownish"))], "clown.gif"), signal);
  expect(clown.frames).toHaveLength(12);
  expect(clown.averageDelayMs).toBe(80);
  const first = await renderRgba(210, 190, draw => draw.drawImage(clown.frames[0], 0, 0));
  expect([...first.rgba.subarray(56 * 4, 57 * 4)]).toEqual([255, 0, 0, 255]);
  expect([...first.rgba.subarray(54 * 4, 55 * 4)]).toEqual([0, 0, 0, 0]);

  const capoo = await readMemeImageSequence(new File([new Uint8Array(await render("capoo_take_dump"))], "capoo.gif"), signal);
  expect(capoo.frames).toHaveLength(5);
  expect(capoo.averageDelayMs * capoo.frames.length).toBe(1900);
  const last = await renderRgba(210, 190, draw => draw.drawImage(capoo.frames.at(-1)!, 0, 0));
  expect(last.rgba[(1 * 210 + 1) * 4 + 3]).toBe(255);
  expect(last.rgba[(3 * 210 + 3) * 4 + 3]).toBe(0);
});
