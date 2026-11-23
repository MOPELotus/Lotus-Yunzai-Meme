import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { spatialRotationTemplates } from "../templates/spatial-rotation.ts";

test("三维旋转沿原画布和角度运行，球面旋转保留原半球与内壁", async () => {
  const signal = AbortSignal.timeout(10_000);
  const { png } = await renderExactPng(105, 83, draw => {
    draw.fillStyle = "#ec344866";
    draw.fillRect(0, 0, 52, 83);
    draw.fillStyle = "#5ecc31";
    draw.fillRect(52, 0, 53, 83);
  });
  const input = new File([new Uint8Array(png)], "sample.png");
  const unexpected = async () => { throw new Error("无素材旋转模板尝试读取文件"); };
  for (const [index, template] of spatialRotationTemplates.entries()) {
    const data = await template.render({images:[input],texts:[],args:{}}, {signal,imageAsset:unexpected,fontAsset:unexpected});
    const gif = await readMemeImageSequence(new File([new Uint8Array(data)], "rotation.gif"), signal);
    const [width, height, frames, delay] = index === 0 ? [126, 124, 30, 70] as const : [300, 300, 60, 40] as const;
    expect([gif.frames[0].width, gif.frames[0].height, gif.frames.length, gif.averageDelayMs]).toEqual([width, height, frames, delay]);
    const first = await renderRgba(width, height, draw => draw.drawImage(gif.frames[0], 0, 0));
    const alphaAt = (x: number, y: number) => first.rgba[(y * width + x) * 4 + 3];
    if (index === 0) {
      expect(alphaAt(36, 42)).toBe(255);
      expect(first.rgba[(42 * width + 36) * 4]).toBeLessThan(110);
    } else {
      expect(alphaAt(115, 150)).toBe(0);
      expect(alphaAt(175, 150)).toBe(255);
    }
  }
});
