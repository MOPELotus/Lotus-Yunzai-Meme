import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { tudouShortAnimationAssets, tudouShortFramePath } from "../backend-tudou-short-animation-assets.ts";
import { isExcludedMemeTemplate } from "../template-policy.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { tudouShortAnimations } from "../templates/tudou-short-animation.ts";

const expected = [
  ["aichuai", ["挨踹"], 7, 50],
  ["duidi", ["怼地", "怼"], 5, 50],
  ["huanying2", ["欢迎欢迎", "欢迎!", "欢迎！"], 4, 20],
  ["huanyingchuo", ["欢迎新人"], 4, 20],
  ["maomaochong", ["毛毛虫"], 12, 50],
  ["maomimobai", ["猫咪膜拜", "膜拜猫咪"], 3, 50],
  ["naonao_tou", ["挠挠头"], 15, 50],
  ["qilongwang", ["骑龙王"], 3, 50],
  ["tiaosheng", ["跳绳"], 23, 50],
  ["tuoni", ["托尼", "tony", "洗头"], 14, 50],
  ["xiaoxiongmaozi", ["小熊帽子"], 10, 80],
  ["zixingche", ["自行车"], 4, 50],
] as const;

test("Tudou 固定动画同步旧目录别名、参数与 104 个锁定素材", () => {
  expect(tudouShortAnimations.map(({ info }) => info.key)).toEqual(expected.map(([key]) => key));
  expect(tudouShortAnimationAssets).toHaveLength(104);
  for (const [key, keywords, frames] of expected) {
    const matching = builtinMemeTemplates.filter(template => template.info.key === key);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.info).toMatchObject({ keywords, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null,
    } });
    expect(isExcludedMemeTemplate(key)).toBeFalse();
    for (let frame = 0; frame < frames; frame++) {
      expect(extraMemeAssets.get(`images/${tudouShortFramePath(key, frame)}`)?.digest).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(extraMemeAssets.has(`images/${tudouShortFramePath(key, frames)}`)).toBeFalse();
  }
});

test("保留 GIF 的逐项帧序和时间，分别覆盖图层顺序与帽子无头像尾帧", async () => {
  const signal = new AbortController().signal;
  const { png: avatar } = await renderExactPng(130, 90, draw => {
    draw.fillStyle = "#ff0000";
    draw.fillRect(0, 0, 130, 90);
  });
  const sourceFrames = await Promise.all(Array.from({ length: 23 }, (_, frame) => renderExactPng(370, 350, draw => {
    draw.fillStyle = "#00ff00";
    draw.fillRect(frame, 0, 1, 1);
    draw.fillStyle = "#0000ff";
    draw.fillRect(24, 13, 5, 5);
    draw.fillRect(53, 38, 5, 5);
  })));
  for (const [key, , frames, delay] of expected) {
    const template = tudouShortAnimations.find(({ info }) => info.key === key)!;
    const reads: string[] = [];
    const result = await template.render({ images: [new File([new Uint8Array(avatar)], "avatar.png")], texts: [], args: {} }, {
      signal,
      async imageAsset(path) {
        reads.push(path);
        return sourceFrames[Number(/\/(\d+)\.png$/u.exec(path)![1])]!.png;
      },
      async fontAsset() { throw new Error("旧动画没有文字"); },
    });
    expect(reads).toEqual(Array.from({ length: frames }, (_, frame) => tudouShortFramePath(key, frame)));
    const decoded = await readMemeImageSequence(new File([new Uint8Array(result)], "result.gif"), signal);
    expect(decoded.frames).toHaveLength(frames);
    expect(decoded.averageDelayMs).toBe(delay);
    const pixel = async (frame: number, x: number, y: number) => {
      const { rgba } = await renderRgba(370, 350, draw => draw.drawImage(decoded.frames[frame]!, 0, 0));
      const offset = (y * 370 + x) * 4;
      return [...rgba.subarray(offset, offset + 4)];
    };
    if (key === "duidi") expect(await pixel(0, 55, 40)).toEqual([0, 0, 255, 255]);
    if (key === "zixingche") expect(await pixel(0, 26, 15)).toEqual([255, 0, 0, 255]);
    if (key === "xiaoxiongmaozi") {
      expect(await pixel(0, 111, 115)).toEqual([255, 0, 0, 255]);
      expect(await pixel(7, 111, 115)).toEqual([0, 0, 0, 0]);
    }
  }
}, 20_000);
