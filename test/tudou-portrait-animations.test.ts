import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { tudouPortraitAnimationAssets } from "../backend-tudou-portrait-animation-assets.ts";
import { tudouShortFramePath } from "../backend-tudou-short-animation-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { tudouPortraitAnimations } from "../templates/tudou-portrait-animations.ts";

const expected = [
  ["beiwodao", ["被窝导"], 3, 60],
  ["cha", ["叉"], 3, 50],
  ["huochailu", ["火柴撸"], 6, 50],
  ["jibao", ["挤爆"], 5, 50],
  ["kaimen", ["开门"], 1, 60],
  ["moni", ["摸你"], 6, 60],
  ["nailongpao", ["奶龙跑"], 12, 60],
  ["niulai", ["牛来"], 9, 60],
  ["qiu", ["求"], 1, 60],
  ["shuai", ["甩"], 4, 50],
  ["shuainiuzi", ["甩牛子", "甩鸡"], 8, 50],
  ["wanweiba", ["玩尾巴"], 6, 60],
  ["wudizhen", ["无敌帧"], 4, 50],
  ["yao", ["摇"], 14, 50],
] as const;

test("Tudou 的 14 个头像命令完整发布，82 个素材保留旧帧位置与验证路径", () => {
  expect(tudouPortraitAnimations.map(({ info }) => info.key)).toEqual(expected.map(([key]) => key));
  expect(tudouPortraitAnimationAssets).toHaveLength(82);
  for (const [key, keywords, frames] of expected) {
    const template = tudouPortraitAnimations.find(item => item.info.key === key)!;
    const images = key === "moni" ? 2 : 1;
    expect(builtinMemeTemplates.filter(item => item.info.key === key)).toEqual([template]);
    expect(template.info).toMatchObject({ keywords, params_type: { min_images: images, max_images: images, min_texts: 0, max_texts: 0 } });
    for (let index = 0; index < frames; index++) {
      const asset = extraMemeAssets.get(`images/${tudouShortFramePath(key, index)}`);
      expect(asset?.path).toBe(`meme/${key}/images/${index}.png`);
      expect(asset?.digest).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(extraMemeAssets.has(`images/${tudouShortFramePath(key, frames)}`)).toBeFalse();
  }
});

test("保留单帧和多帧 GIF 时长，两个原始头像位置不对调，椭圆外仍显示底图", async () => {
  const signal = new AbortController().signal;
  const avatar = (color: string) => renderExactPng(174, 125, draw => {
    draw.fillStyle = color;
    draw.fillRect(0, 0, 174, 125);
  }).then(({ png }) => new File([new Uint8Array(png)], "头像.png"));
  const [red, green] = await Promise.all([avatar("#ff0000"), avatar("#00ff00")]);
  const sourceFrames = await Promise.all(Array.from({ length: 14 }, (_, index) => renderExactPng(592, 592, draw => {
    draw.fillStyle = "#0000ff";
    draw.fillRect(0, 0, 592, 592);
    draw.fillStyle = "#ffffff";
    draw.fillRect(index, 0, 1, 1);
  })));
  for (const [key, , frames, delay] of expected) {
    const template = tudouPortraitAnimations.find(item => item.info.key === key)!;
    const reads: string[] = [];
    const context = { signal,
      async imageAsset(path: string) {
        reads.push(path);
        return sourceFrames[Number(/\/(\d+)\.png$/u.exec(path)![1])]!.png;
      },
      async fontAsset() { throw new Error("原版动画没有字体"); },
    };
    const input = { images: key === "moni" ? [red, green] : [red], texts: [], args: {} };
    if (key === "moni") await expect(template.render({ ...input, images: [red] }, context)).rejects.toThrow("两张图片");
    const result = await template.render(input, context);
    expect(reads).toEqual(Array.from({ length: frames }, (_, index) => tudouShortFramePath(key, index)));
    // The GIF decoder's average helper ignores timing for a still image, but the encoded container keeps it.
    const control = result.findIndex((byte, index) => byte === 0x21 && result[index + 1] === 0xf9 && result[index + 2] === 4);
    expect(new DataView(result.buffer, result.byteOffset).getUint16(control + 4, true) * 10).toBe(delay);
    const decoded = await readMemeImageSequence(new File([new Uint8Array(result)], "result.gif"), signal);
    expect(decoded.frames).toHaveLength(frames);
    if (key === "moni") {
      const { rgba } = await renderRgba(592, 592, draw => draw.drawImage(decoded.frames[0], 0, 0));
      const pixel = (x: number, y: number) => {
        const at = (y * 592 + x) * 4;
        return [...rgba.subarray(at, at + 4)];
      };
      expect(pixel(360, 190)).toEqual([255, 0, 0, 255]);
      expect(pixel(117, 462)).toEqual([0, 255, 0, 255]);
      expect(pixel(227, 102)).toEqual([0, 0, 255, 255]);
    }
  }
  const kaimen = tudouPortraitAnimations.find(item => item.info.key === "kaimen")!;
  const clear = await renderExactPng(24, 24, () => {});
  const result = await kaimen.render({ images: [new File([new Uint8Array(clear.png)], "透明.png")], texts: [], args: {} }, {
    signal, async imageAsset() { return sourceFrames[0]!.png; }, async fontAsset() { throw new Error("没有文字"); },
  });
  const { frames } = await readMemeImageSequence(new File([new Uint8Array(result)], "透明测试.gif"), signal);
  const { rgba } = await renderRgba(592, 592, draw => draw.drawImage(frames[0], 0, 0));
  expect([...rgba.subarray((90 * 592 + 39) * 4, (90 * 592 + 39) * 4 + 4)]).toEqual([0, 0, 0, 255]);
}, 20_000);
