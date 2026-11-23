import { expect, test } from "bun:test";
import type { Image } from "skia-canvas";
import { renderPng, renderRgba } from "../../../packages/skia/index.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { anyliewFixedAnimationAssets } from "../backend-fixed-animation-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { fixedAvatarAnimations } from "../templates/fixed-avatar-animation.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const signal = new AbortController().signal;

test("默认本机目录注册全部三十七项且只接入固定上游帧的白名单", () => {
  const selected = new Set(fixedAvatarAnimations.map(({ info }) => info.key));
  expect(selected.size).toBe(37);
  expect(builtinMemeTemplates.filter(({ info }) => selected.has(info.key))).toEqual([...fixedAvatarAnimations]);
  for (const [path, digest] of anyliewFixedAnimationAssets) {
    expect(extraMemeAssets.get(`images/anyliew/${path}`)).toMatchObject({ path, digest });
  }
  expect(extraMemeAssets.has("images/anyliew/emoji/kurogames_start/images/1.png")).toBeFalse();
});

async function foreground(color: string) {
  const { rgba } = await renderRgba(300, 220, draw => {
    draw.fillStyle = color;
    draw.fillRect(0, 0, 12, 12);
    draw.fillRect(29, 60, 6, 6);
  });
  return Buffer.from(encodeMemeGif(300, 220, [{ rgba, delayMs: 30 }], signal));
}

function inputGif() {
  const width = 126;
  const height = 42;
  const frames = [false, true].map(second => {
    const rgba = new Uint8Array(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
      const x = pixel % width;
      const channel = second ? 2 : x <= 29 ? 0 : x <= 95 ? 1 : 2;
      rgba[pixel * 4 + channel] = 255;
      rgba[pixel * 4 + 3] = 255;
    }
    return { rgba, delayMs: 60 };
  });
  return new File([new Uint8Array(encodeMemeGif(width, height, frames, signal))], "avatar.gif");
}

function mockContext(frames: readonly Buffer[], paths: string[]): MemeTemplateContext {
  return {
    signal,
    async imageAsset(path) {
      paths.push(path);
      const frame = Number(path.match(/\/(\d+)\.png$/u)?.[1]);
      return frames[(frame - 1) % frames.length]!;
    },
    async fontAsset() { throw new Error("该表情不使用字体"); },
  };
}

async function pixels(image: Image, points: readonly (readonly [number, number])[]) {
  const { rgba, engine } = await renderRgba(image.width, image.height, draw => draw.drawImage(image, 0, 0));
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") {
    expect(engine.renderer).toBe("GPU");
    expect(engine.device).toContain("RTX A4000");
  }
  return points.map(([x, y]) => [...rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]);
}

test("逐项保留固定动画的原关键词、参数和资产路径，并输出有效 GIF", async () => {
  const foregrounds = await Promise.all([foreground("#ffffff"), foreground("#111111")]);
  const cases = [
    ["capoo_smash_egg", ["咖波砸蛋"], 3, 110],
    ["ikun_trainee", ["练习生"], 12, 50],
    ["mihoyo_kirara_delivery", ["绮良良派送", "派送"], 4, 40],
    ["christmas_eve", ["平安夜", "平安夜快乐"], 3, 500],
    ["doro_chasing", ["doro追", "Doro追", "桃乐丝追"], 4, 70],
    ["doro_lick", ["桃乐丝舔", "doro舔", "Doro舔", "DORO舔"], 5, 90],
    ["dog_ear_hat", ["狗耳帽", "狗帽"], 12, 90],
    ["cheer", ["欢呼"], 10, 100],
    ["happy_mid_autumn_festival", ["中秋快乐", "中秋节快乐"], 7, 150],
    ["happy_national_day", ["国庆快乐", "国庆节快乐"], 4, 80],
    ["happy_new_year", ["新年好"], 4, 70],
    ["picking_flowers", ["摘花"], 4, 200],
    ["small_hands", ["小手"], 3, 80],
    ["wifi", ["wifi", "WIFI"], 4, 100],
    ["slacking_off", ["摸鱼"], 4, 200],
    ["bring_wealth", ["来财"], 24, 70],
    ["capoo_fished_out", ["咖波掏"], 20, 100],
    ["capoo_gothammered", ["咖波被锤"], 20, 50],
    ["cat_lick", ["猫舔", "猫猫舔"], 30, 60],
    ["doro_banging", ["doro敲", "Doro敲", "桃乐丝敲"], 11, 30],
    ["doro_do", ["doro撅", "Doro撅", "桃乐丝撅"], 4, 50],
    ["doro_kiss", ["桃乐丝亲", "Doro亲", "doro亲"], 9, 60],
    ["doro_knight", ["骑士", "doro骑士", "Doro骑士", "DORO骑士"], 16, 100],
    ["doro_stroke", ["抚摸", "doro抚摸", "Doro抚摸", "桃乐丝抚摸"], 16, 70],
    ["doro_trampoline", ["跳床", "蹦床", "doro蹦床", "桃乐丝蹦床", "doro跳床", "桃乐丝跳床"], 15, 60],
    ["bonfire_dance", ["篝火舞", "圈舞"], 61, 40],
    ["burning", ["燃烧"], 29, 50],
    ["capoo_take_smash", ["咖波砸"], 20, 50],
    ["chain", ["锁链"], 45, 30],
    ["cooking", ["炒菜"], 52, 50],
    ["doro_openlight", ["开灯", "桃乐丝开灯", "doro开灯", "Doro开灯", "DORO开灯"], 63, 30],
    ["double_guns", ["双枪"], 7, 100],
    ["dragon_hand", ["龙手"], 18, 60],
    ["fever", ["为爱发烧", "发烧"], 13, 90],
    ["fishing", ["钓鱼"], 8, 110],
    ["frieren_snuggle", ["芙莉莲贴贴"], 17, 50],
    ["heartbeat", ["心跳"], 7, 40],
  ] as const;

  const input = { images: [inputGif()], texts: [], args: {} };
  expect(fixedAvatarAnimations.map(({ info }) => info.key)).toEqual(cases.map(([key]) => key));
  for (const [key, keywords, frames, delay] of cases) {
    const template = fixedAvatarAnimations.find(item => item.info.key === key)!;
    expect(template.info.keywords).toEqual(keywords);
    expect(template.info.params_type).toEqual({
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null, default_texts: [],
    });
    const paths: string[] = [];
    const output = await template.render(input, mockContext(foregrounds, paths));
    const result = await readMemeImageSequence(new File([new Uint8Array(output)], "result.gif"), signal);
    expect(result.frames).toHaveLength(frames);
    expect(result.averageDelayMs).toBe(delay);
    expect(paths).toEqual(Array.from({ length: frames }, (_, index) => `anyliew/emoji/${key}/images/${index + 1}.png`));
    for (const path of paths) expect(anyliewFixedAnimationAssets.get(path.slice("anyliew/".length))).toMatch(/^[a-f0-9]{64}$/u);
  }
}, 20_000);

test("固定动画只取输入首帧，保留遮罩顺序和居中覆盖裁切", async () => {
  const overlay = await foreground("#ffffff");
  const input = { images: [inputGif()], texts: [], args: {} };
  const capoo = fixedAvatarAnimations[0]!;
  const ikun = fixedAvatarAnimations[1]!;
  const render = async (template: typeof capoo) => {
    const result = await template.render(input, mockContext([overlay], []));
    return readMemeImageSequence(new File([new Uint8Array(result)], "result.gif"), signal);
  };

  const [capooFrames, ikunFrames] = await Promise.all([render(capoo), render(ikun)]);

  expect(await pixels(capooFrames.frames[0]!, [[26, 58], [30, 61], [14, 14]])).toEqual([
    [255, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 0],
  ]);
  expect(await pixels(capooFrames.frames[1]!, [[25, 98]])).toEqual([[255, 0, 0, 255]]);
  expect(await pixels(ikunFrames.frames[0]!, [[63, 69], [113, 69], [57, 69]])).toEqual([
    [0, 255, 0, 255], [0, 255, 0, 255], [0, 0, 0, 0],
  ]);

  const { png } = await renderPng(8, 8, draw => {
    draw.fillStyle = "#ff8000a8";
    draw.fillRect(0, 0, 8, 8);
  });
  const transparent = new File([new Uint8Array(png)], "transparent.png");
  const masked = await capoo.render({ ...input, images: [transparent] }, mockContext([overlay], []));
  const maskedFrames = await readMemeImageSequence(new File([new Uint8Array(masked)], "masked.gif"), signal);
  expect(await pixels(maskedFrames.frames[0]!, [[26, 58]])).toEqual([[168, 84, 0, 255]]);

  const hands = fixedAvatarAnimations.find(item => item.info.key === "small_hands")!;
  const collapsed = await hands.render(input, mockContext([overlay, overlay, await foreground("#111111")], []));
  const sequence = await readMemeImageSequence(new File([new Uint8Array(collapsed)], "result.gif"), signal);
  expect(sequence.frames).toHaveLength(2);
  expect(sequence.averageDelayMs).toBe(120);
});

test("来财保留重复帧停顿，桃乐丝敲逐帧使用原坐标和尺寸", async () => {
  const [light, dark] = await Promise.all([foreground("#ffffff"), foreground("#111111")]);
  const input = { images: [inputGif()], texts: [], args: {} };
  const wealth = fixedAvatarAnimations.find(item => item.info.key === "bring_wealth")!;
  const originalHolds = [2, 3, 2, 3, 2, 2, 3, 2, 3, 2];
  const repeatedFrames = originalHolds.flatMap((count, index) => Array<Buffer>(count).fill(index % 2 ? light : dark));
  const held = await wealth.render(input, mockContext(repeatedFrames, []));
  const heldSequence = await readMemeImageSequence(new File([new Uint8Array(held)], "held.gif"), signal);
  expect(heldSequence.frames).toHaveLength(originalHolds.length);
  expect(heldSequence.averageDelayMs).toBe(168);

  const banging = fixedAvatarAnimations.find(item => item.info.key === "doro_banging")!;
  const result = await banging.render(input, mockContext([light], []));
  const { frames } = await readMemeImageSequence(new File([new Uint8Array(result)], "poses.gif"), signal);
  expect(frames).toHaveLength(5);
  const sample = [[142, 150], [243, 160], [157, 190]] as const;
  expect(await pixels(frames[0]!, sample)).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [255, 0, 0, 255]]);
  expect(await pixels(frames[1]!, sample)).toEqual([[255, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 0]]);
  expect(await pixels(frames[2]!, sample)).toEqual([[255, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 0]]);
});
