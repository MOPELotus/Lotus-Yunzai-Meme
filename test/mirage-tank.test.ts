import { expect, test } from "bun:test";
import { encodeBandedPng } from "../../../packages/skia/banded-png.ts";
import { mirageTankTemplates } from "../templates/mirage-tank.ts";
import { readStraightPng } from "../templates/straight-png.ts";

const context = () => ({
  signal: AbortSignal.timeout(5_000),
  async imageAsset(): Promise<Buffer> { throw new Error("幻影坦克无需内置素材。"); },
  async fontAsset(): Promise<Buffer> { throw new Error("幻影坦克无需字体。"); },
});

async function fixture(bytes: readonly number[], width: number, height: number) {
  const png = await encodeBandedPng(width, height, (async function* () { yield Buffer.from(bytes); })());
  return new File([new Uint8Array(png)], "input.png", { type: "image/png" });
}

test("幻影坦克棋盘格用原始颜色计算透明度，包括 alpha 为零的像素", async () => {
  const tank = mirageTankTemplates.find(({ info }) => info.key === "miragetank")!;
  const cover = await fixture([
    94, 40, 251, 0, 0, 0, 0, 255,
    0, 0, 0, 255, 255, 255, 255, 0,
  ], 2, 2);
  const base = await fixture([
    0, 0, 0, 255, 0, 200, 0, 86,
    255, 0, 0, 0, 0, 0, 0, 255,
  ], 2, 2);
  const output = await tank.render({ images: [cover, base], texts: [], args: {} }, context());
  expect([...readStraightPng(Buffer.from(output), 2, 2)!]).toEqual([
    255, 255, 255, 175, 0, 0, 0, 138,
    0, 0, 0, 179, 255, 255, 255, 0,
  ]);
});

test("幻影分离先输出加白底的封面，再以原范围增强黑底图", async () => {
  const separate = mirageTankTemplates.find(({ info }) => info.key === "miragetank_separate")!;
  const source = await fixture([130, 50, 70, 128], 1, 1);
  const output = await separate.render({ images: [source], texts: ["3.25"], args: {} }, context());
  expect([...readStraightPng(Buffer.from(output), 2, 1)!]).toEqual([
    192, 152, 162, 255, 211, 81, 113, 255,
  ]);
});
