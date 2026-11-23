import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { legacyPhotoSceneAssets } from "../backend-legacy-photo-scene-assets.ts";
import { imageMime } from "../generate-reply.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { legacyPhotoScenes } from "../templates/legacy-photo-scenes.ts";
import { louvreMemeTemplate } from "../templates/louvre.ts";

const signal = new AbortController().signal;
const context = { signal, ...createBundledMemeResources(signal) };
const byKey = new Map([...legacyPhotoScenes, louvreMemeTemplate].map(template => [template.info.key, template]));

async function portrait(color: string) {
  const { png } = await renderExactPng(117, 82, draw => {
    draw.fillStyle = color;
    draw.fillRect(12, 8, 94, 66);
    draw.fillStyle = "#0060c0";
    draw.fillRect(40, 9, 30, 35);
    draw.fillStyle = "#1f0822";
    draw.fillRect(75, 44, 31, 24);
  });
  return new File([new Uint8Array(png)], "sample.png");
}

async function generate(key: string, images: File[], texts: string[] = [], args: Record<string, unknown> = {}) {
  return Buffer.from(await byKey.get(key)!.render({ images, texts, args }, context));
}

test("六款原模板保留别名、图片参数和全部随模块素材", async () => {
  const { files } = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json() as {
    files: Record<string, string>;
  };
  expect(legacyPhotoSceneAssets).toHaveLength(51);
  for (const [path, { digest }] of legacyPhotoSceneAssets) expect(files[path]).toBe(digest);

  const photo = await portrait("#ca141c");
  const second = await portrait("#31c612");
  const specs = [
    ["fbi_photo", ["fbi", "FBI"], "image/jpeg", 1434, 1024],
    ["gong_xi_fa_cai", ["恭喜发财"], "image/jpeg", 2508, 3263],
    ["mihoyo_elysia_come", ["爱莉希雅降临"], "image/jpeg", 822, 1242],
    ["cinderella_eat", ["灰姑娘吃"], "image/gif", 600, 600],
    ["christmas_gift", ["圣诞礼物"], "image/gif", 300, 300],
    ["louvre", ["卢浮宫"], "image/png", 117, 82],
  ] as const;
  expect(byKey.size).toBe(specs.length);
  for (const [key, aliases, mime, width, height] of specs) {
    const template = byKey.get(key)!;
    const imageCount = key === "mihoyo_elysia_come" ? 2 : 1;
    const permittedText = key === "fbi_photo" || key === "gong_xi_fa_cai" ? 1 : 0;
    expect(builtinMemeTemplates.includes(template)).toBeTrue();
    expect(template.info.keywords).toEqual(aliases);
    expect(template.info.params_type).toMatchObject({ min_images: imageCount, max_images: imageCount, min_texts: 0, max_texts: permittedText });
    const bytes = await generate(key, imageCount === 1 ? [photo] : [photo, second], [], { number: 1 });
    expect(imageMime(bytes)).toBe(mime);
    const image = await loadImage(bytes);
    expect([image.width, image.height]).toEqual([width, height]);
    if (key === "cinderella_eat" || key === "christmas_gift") {
      const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), signal);
      expect([result.frames.length, result.averageDelayMs]).toEqual(key === "cinderella_eat" ? [6, 40] : [41, 30]);
    }
  }
}, 20_000);

test("FBI 名称优先级、二图左右位置、恭喜发财的空标题和卢浮宫旧参数", async () => {
  const red = await portrait("#df0000");
  const green = await portrait("#00bf05");
  const fbi = await generate("fbi_photo", [red], ["测试者"], { user_infos: [{ name: "应被覆盖" }] });
  expect(fbi).toEqual(await generate("fbi_photo", [red], ["测试者"]));
  expect(fbi.equals(await generate("fbi_photo", [red], [], { user_infos: [{ gender: "male" }] }))).toBeFalse();
  const elysia = await generate("mihoyo_elysia_come", [red, green]);
  expect(elysia.equals(await generate("mihoyo_elysia_come", [green, red]))).toBeFalse();
  const wealth = await generate("gong_xi_fa_cai", [red], ["保持原版"]);
  expect(wealth).toEqual(await generate("gong_xi_fa_cai", [red]));
  await expect(generate("louvre", [red], [], { number: 8 })).rejects.toThrow("模式编号错误");
  const all = await Promise.all(Array.from({ length: 7 }, (_, index) => generate("louvre", [red], [], { number: index + 1 })));
  expect(all.every(bytes => imageMime(bytes) === "image/png")).toBeTrue();
  expect(new Set(all.map(bytes => Bun.hash(bytes))).size).toBeGreaterThan(5);
}, 20_000);

test("三款照片处理保留原输入动图，而非仅使用首帧", async () => {
  const colors = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]];
  const bytes = encodeMemeGif(8, 8, colors.map((color, index) => ({
    rgba: Uint8Array.from(Array.from({ length: 64 }, () => color).flat()),
    delayMs: [50, 130, 90][index]!,
  })), signal);
  const avatar = new File([new Uint8Array(bytes)], "animated.gif");
  for (const key of ["fbi_photo", "gong_xi_fa_cai", "louvre"]) {
    const result = await generate(key, [avatar], [], { number: 3 });
    expect(imageMime(result)).toBe("image/gif");
    const rendered = await readMemeImageSequence(new File([new Uint8Array(result)], "animated.gif"), signal);
    expect([rendered.frames.length, rendered.averageDelayMs]).toEqual([3, 90]);
    if (key === "gong_xi_fa_cai") expect([rendered.frames[0].width, rendered.frames[0].height]).toEqual([2508, 3263]);
  }
}, 25_000);
