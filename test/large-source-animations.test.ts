import { expect, test } from "bun:test";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { largeSourceAnimations } from "../templates/large-source-animations.ts";

const getTemplate = (key: string) => largeSourceAnimations.find(template => template.info.key === key)!;

async function solid(width: number, height: number, color: string) {
  return (await renderExactPng(width, height, draw => {
    draw.fillStyle = color;
    draw.fillRect(0, 0, width, height);
  })).png;
}

test("原神吃的中文选项与八个快捷词写入原角色编号", () => {
  const template = getTemplate("genshin_eat");
  const args = template.info.params_type.args_type;
  expect(parseGenerationArgs(args, "角色 6")).toMatchObject({ values: { character: 6 }, text: "" });
  expect(template.info.shortcuts?.map(({ args }) => parseGenerationArgs(template.info.params_type.args_type, args!.join(" ")).values))
    .toEqual([1, 1, 1, 2, 3, 4, 5, 6].map(character => ({ character })));
});

test("望远镜的长输入按旧版秒制进位延长第一帧，原动画随后完整播放", async () => {
  const signal = AbortSignal.timeout(10_000);
  const pixels = [20, 40, 60, 80].map((red, index) => ({
    rgba: Uint8Array.of(red, 0, 0, 255), delayMs: [2090, 2030, 2070, 2110][index]!,
  }));
  const animation = encodeMemeGif(1, 1, pixels, signal);
  const art = [await solid(6, 5, "green"), await solid(6, 5, "blue")];
  const paths: string[] = [];
  const output = await getTemplate("telescope").render({
    images: [new File([new Uint8Array(animation)], "avatar.gif")], texts: [], args: {},
  }, {
    signal,
    async imageAsset(path) {
      paths.push(path);
      return art[Number(/(\d+)\.png$/u.exec(path)?.[1]) % 2]!;
    },
    async fontAsset() { throw new Error("该模板无字体"); },
  });
  const decoded = await readMemeImageSequence(new File([new Uint8Array(output)], "sample.gif"), signal);
  expect(paths).toHaveLength(69);
  expect(decoded.frames).toHaveLength(69);
  expect(decoded.averageDelayMs * decoded.frames.length).toBeCloseTo(8400);
});

test("快逃沿用旧版 .5 舍到偶数的画布尺寸", async () => {
  const signal = AbortSignal.timeout(10_000);
  const avatar = await solid(48, 49, "green");
  const art = await solid(20, 20, "blue");
  const gif = Buffer.from(await getTemplate("run_away").render({
    images: [new File([new Uint8Array(avatar)], "avatar.png")], texts: [], args: {},
  }, {
    signal, async imageAsset() { return art; }, async fontAsset() { throw new Error("该模板无字体"); },
  }));
  expect([gif.readUInt16LE(6), gif.readUInt16LE(8)]).toEqual([24, 24]);
});
