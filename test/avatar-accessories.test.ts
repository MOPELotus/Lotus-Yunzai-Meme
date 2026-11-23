import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { avatarAccessoryMemeTemplates, readAbstinenceDate } from "../templates/avatar-accessories.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const signal = new AbortController().signal;
const context = { signal, ...createBundledMemeResources(signal) };
const template = (key: string) => avatarAccessoryMemeTemplates.find(item => item.info.key === key)!;

async function picture() {
  const { png } = await renderExactPng(80, 79, draw => {
    draw.fillStyle = "#f23599";
    draw.fillRect(0, 0, 35, 79);
    draw.fillStyle = "#28aada";
    draw.fillRect(35, 0, 45, 79);
  });
  return new File([new Uint8Array(png)], "头像.png");
}

function options(key: string, command: string) {
  const argsType = (template(key).info.params_type as { args_type?: unknown }).args_type;
  return parseGenerationArgs(argsType, command);
}

test("戒导、奶茶、手枪和小丑面具按原前后及左右别名选择素材", async () => {
  expect(options("abstinence", '-n "测试 甲" -t 2025-07-06').values).toEqual({ name: "测试 甲", time: "2025-07-06" });
  expect(options("bubble_tea", "左手").values).toEqual({ position: "left" });
  expect(options("gun", "--both").values).toEqual({ position: "both" });
  expect(options("clown_mask", "后").values).toEqual({ mode: "behind" });
  expect(options("guichu", "-d upper").issue).toMatch(/无效/u);

  const images = [await picture()];
  const physical = async (key: string, args: Record<string, unknown>) => {
    const bytes = await template(key).render({ images, texts: [], args }, context);
    const image = await loadImage(Buffer.from(bytes));
    return { width: image.width, height: image.height, signature: Buffer.from(bytes).subarray(0, 3).toString("hex"), bytes };
  };
  expect(await physical("abstinence", { name: "甲", time: "2025年7月6日" })).toMatchObject({ width: 675, height: 918, signature: "ffd8ff" });
  for (const key of ["bubble_tea", "gun"]) {
    const original = await physical(key, {});
    const both = await physical(key, { position: "both" });
    expect(original).toMatchObject({ width: 500, height: 500, signature: "ffd8ff" });
    expect(both.bytes).not.toEqual(original.bytes);
  }
  const front = await physical("clown_mask", {});
  const behind = await physical("clown_mask", { mode: "behind" });
  expect(front).toMatchObject({ width: 690, height: 690, signature: "89504e" });
  expect(behind.bytes).not.toEqual(front.bytes);
});

test("小丑面具保留输入动画，拍头与鬼畜各按旧时间轴生成 GIF", async () => {
  const rgba = Uint8Array.from({ length: 12 * 10 * 4 }, (_, index) => index % 4 === 3 ? 255 : 80);
  const next = Uint8Array.from(rgba, (value, index) => index % 4 ? value : 180);
  const input = encodeMemeGif(12, 10, [{ rgba, delayMs: 60 }, { rgba: next, delayMs: 120 }], signal);
  const decode = (bytes: Uint8Array) => readMemeImageSequence(new File([new Uint8Array(bytes)], "结果.gif"), signal);
  const clown = await template("clown_mask").render({
    images: [new File([new Uint8Array(input)], "头像.gif")], texts: [], args: { mode: "behind" },
  }, context);
  const shape = (gif: Awaited<ReturnType<typeof decode>>) =>
    [gif.frames[0].width, gif.frames[0].height, gif.frames.length, gif.averageDelayMs];
  expect(shape(await decode(clown))).toEqual([690, 690, 2, 90]);
  const images = [await picture()];
  const beats = await template("beat_head").render({ images, texts: ["自己决定"], args: {} }, context);
  expect(shape(await decode(beats))).toEqual([331, 270, 3, 50]);
  for (const direction of ["left", "right", "top", "bottom"]) {
    const glitch = await template("guichu").render({ images, texts: [], args: { direction } }, context);
    expect(shape(await decode(glitch))).toEqual([80, 79, 16, 400]);
  }
});

test("戒导时间参数按旧常见日期、多语言相对日期及回落处理", () => {
  const now = new Date(2026, 10, 23, 13, 30);
  const date = (value: string) => {
    const result = readAbstinenceDate(value, now);
    return [result.getFullYear(), result.getMonth() + 1, result.getDate()];
  };
  for (const value of ["2025-06-07", "2025年6月7日", "2025/06/07", "2025.6.7", "June 7, 2025", "2025-06-07T23:00:00-05:00"]) {
    expect(date(value)).toEqual([2025, 6, 7]);
  }
  expect(date("6月7日")).toEqual([2026, 6, 7]);
  expect(date("2025-06")).toEqual([2025, 6, 23]);
  expect(date("前天")).toEqual([2026, 11, 21]);
  expect(date("2周前")).toEqual([2026, 11, 9]);
  expect(date("3天后")).toEqual([2026, 11, 26]);
  expect(date("2个月后")).toEqual([2027, 1, 23]);
  expect(date("in 2 weeks")).toEqual([2026, 12, 7]);
  expect(date("2 years ago")).toEqual([2024, 11, 23]);
  expect(date("2025-02-30")).toEqual([2026, 11, 23]);
  expect(date("2025-02-30T10:00:00")).toEqual([2026, 11, 23]);
  expect(date("无效日期")).toEqual([2026, 11, 23]);
  expect(now.getDate()).toBe(23);
});
