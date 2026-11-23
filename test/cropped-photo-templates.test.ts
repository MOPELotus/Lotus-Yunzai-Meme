import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { croppedPhotoAssets } from "../backend-cropped-photo-assets.ts";
import { imageMime } from "../generate-reply.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { croppedPhotoTemplates } from "../templates/cropped-photo-templates.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

const signal = new AbortController().signal;
const context = { signal, ...createBundledMemeResources(signal) };

const layouts = [
  ["china_flag", ["国旗"], "image/jpeg", 640, 640],
  ["perfect", ["完美"], "image/jpeg", 652, 524],
  ["raise_image", ["举"], "image/jpeg", 900, 603],
  ["jerry_stare", ["杰瑞盯"], "image/png", 352, 459],
  ["karyl_point", ["凯露指"], "image/png", 1080, 1080],
  ["maimai_awaken", ["旅行伙伴觉醒"], "image/jpeg", 600, 600],
  ["what_I_want_to_do", ["我想上的"], "image/jpeg", 662, 890],
  ["erised_mirror", ["意若思镜"], "image/png", 720, 786],
  ["marriage", ["结婚申请", "结婚登记"], "image/jpeg", 1500, 1080],
  ["captain", ["舰长"], "image/jpeg", 640, 1320],
  ["saimin_app", ["催眠app"], "image/gif", 600, 400],
] as const;
const byKey = new Map(croppedPhotoTemplates.map(template => [template.info.key, template]));

async function photo(width: number, height: number) {
  const { png } = await renderExactPng(width, height, draw => {
    draw.fillStyle = "red";
    draw.fillRect(0, 0, width, height);
    draw.fillStyle = "blue";
    draw.fillRect(width / 2, 0, width / 2, height);
    draw.clearRect(width / 8, height / 8, width / 4, height / 4);
  });
  return new File([new Uint8Array(png)], "photo.png");
}
function render(key: string, images: File[]) {
  return byKey.get(key)!.render({ images, texts: [], args: {} }, context);
}

test("裁切模板保留原键、别名、输入数和本机素材", async () => {
  const manifest = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json() as {
    files: Record<string, string>;
  };
  expect(croppedPhotoTemplates).toHaveLength(layouts.length);
  expect(croppedPhotoAssets).toHaveLength(38);
  for (const [path, { digest }] of croppedPhotoAssets) expect(manifest.files[path]).toBe(digest);
  const input = await photo(120, 80);
  for (const [key, keywords, mime, width, height] of layouts) {
    const template = byKey.get(key)!;
    const isCaptain = key === "captain";
    expect(builtinMemeTemplates.includes(template)).toBeTrue();
    expect(template.info.keywords).toEqual(keywords);
    expect(template.info.params_type).toMatchObject({
      min_images: isCaptain ? 2 : 1, max_images: isCaptain ? 5 : 1, min_texts: 0, max_texts: 0,
    });
    const actual = await render(key, isCaptain ? [input, input] : [input]);
    expect(imageMime(actual)).toBe(mime);
    const result = await loadImage(Buffer.from(actual));
    expect([result.width, result.height]).toEqual([width, height]);
  }
}, 25_000);

test("双人舰长补齐三格且开放五格；竖照用原长宽比裁切", async () => {
  const portrait = await photo(80, 120);
  const captain = await loadImage(Buffer.from(await render("captain", Array<File>(5).fill(portrait))));
  const marriage = await loadImage(Buffer.from(await render("marriage", [portrait])));
  const app = await loadImage(Buffer.from(await render("saimin_app", [portrait])));
  expect([captain.width, captain.height]).toEqual([640, 2200]);
  expect([marriage.width, marriage.height]).toEqual([800, 1080]);
  expect([app.width, app.height]).toEqual([398, 597]);
}, 20_000);

test("沿用动态图输入的平均帧时长，保留催眠画面自己的共帧规则", async () => {
  const palette = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]];
  const bytes = encodeMemeGif(12, 8, palette.map((rgba, index) => ({
    rgba: Uint8Array.from(Array.from({ length: 96 }, () => rgba).flat()),
    delayMs: [50, 130, 90][index]!,
  })), signal);
  const avatar = new File([new Uint8Array(bytes)], "avatar.gif");
  for (const key of ["raise_image", "jerry_stare", "maimai_awaken", "what_I_want_to_do", "erised_mirror", "saimin_app"]) {
    const result = await render(key, [avatar]);
    expect(imageMime(result)).toBe("image/gif");
    const sequence = await readMemeImageSequence(new File([new Uint8Array(result)], "result.gif"), signal);
    expect([sequence.frames.length, sequence.averageDelayMs]).toEqual(key === "saimin_app" ? [25, 30] : [3, 90]);
    if (key === "saimin_app") {
      const { rgba } = await renderRgba(1, 1, draw => draw.drawImage(sequence.frames[12]!, -500, -10));
      expect([...rgba]).toEqual([255, 0, 0, 255]);
    }
  }
}, 25_000);
