import { expect, test } from "bun:test";
import { FontLibrary, loadImage, type Image } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { googleLogoText, layoutMemeText, parseMemeBbcode } from "../templates/bbcode-text.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { textGraphicsMemeTemplates } from "../templates/text-graphics.ts";

const signal = new AbortController().signal;
const context: MemeTemplateContext = {
  signal,
  async imageAsset() { throw new Error("文字表情无需固定素材"); },
  async fontAsset() { throw new Error("文字标记不读取文件"); },
};
const [universal, google] = textGraphicsMemeTemplates;

test("内置目录登记万能表情和 Google", () => {
  expect(builtinMemeTemplates.filter(({ info }) => info.key === "universal" || info.key === "google")).toEqual([universal, google]);
});

async function readPixels(image: Image) {
  const { rgba, engine } = await renderRgba(image.width, image.height, draw => draw.drawImage(image, 0, 0));
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") {
    expect(engine.renderer).toBe("GPU");
    expect(engine.device).toContain("RTX A4000");
  }
  return rgba;
}

test("只解析旧文字标记，同名嵌套、换行和对齐保持独立", () => {
  const installed = FontLibrary.families.find(name => name === "DejaVu Serif") ?? FontLibrary.families[0]!;
  const input = `[align=left][COLOR=red][b][i][u][del][stroke=#abcdef][font="${installed}"][size=61]角色[/size][/font][/stroke][/del][/u][/i][/b][/color]尾[/align]\r\n\r\n[align=right]右[/align]中`;
  const parsed = parseMemeBbcode(input, 45, "center");
  expect(parsed.map(paragraph => paragraph.alignment)).toEqual(["left", "right", "center"]);
  expect(parsed[0]?.spans).toMatchObject([
    { text: "角色", size: 61, color: "red", stroke: "#abcdef", family: installed, bold: true, italic: true, underline: true, strike: true },
    { text: "尾", size: 45, bold: false, italic: false, underline: false, strike: false },
  ]);
  const nested = parseMemeBbcode("[color=red]A[color=blue]B[/color]C[/color]D", 45, "left")[0]!.spans;
  expect(nested.map(({ text, color }) => [text, color])).toEqual([["A", "red"], ["B", "blue"], ["C", "red"], ["D", undefined]]);
  const literal = parseMemeBbcode("[url]a[/url]<img>[font=/tmp/arbitrary.ttf]B[/font]", 45, "left")[0]!.spans;
  expect(literal.map(span => span.text).join("")).toBe("[url]a[/url]<img>B");
  expect(literal.at(-1)?.family).toBe("");
  expect(parseMemeBbcode("[color=rgb(255,0,0)]x[/color]", 45, "left")[0]?.spans[0]?.color).toBeUndefined();
});

test("Google 使用旧六色，空格参与索引并按原换行变为空格", async () => {
  const render = (text: string) => google!.render({ images: [], texts: [text], args: {} }, context);
  const line = await render("A B");
  expect(await render("A\nB")).toEqual(line);
  expect(await render("A B\n")).toEqual(line);
  const image = await loadImage(Buffer.from(line));
  const pixels = await readPixels(image);
  let blue = 0, yellow = 0, red = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const [r, g, b] = pixels.subarray(index, index + 3);
    if (b! > 180 && b! > r! + 90 && b! > g! + 50) blue++;
    if (r! > 190 && g! > 130 && b! < 70) yellow++;
    if (r! > 160 && g! < 110 && b! < 100) red++;
  }
  expect(blue).toBeGreaterThan(3000);
  expect(yellow).toBeGreaterThan(3000);
  expect(red).toBeLessThan(50);
  expect([...pixels.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
  const empty = await loadImage(Buffer.from(await render("")));
  expect([empty.width, empty.height]).toEqual([100, 100]);
});

test("逐字着色保留右向连写字形，两种装饰线可以同时显示", async () => {
  expect(googleLogoText("Ae\u0301👩‍🚀B")[0]!.spans.map(({ text, color }) => [text, color])).toEqual([
    ["A", "#4285f4"], ["e\u0301", "#db4437"], ["👩‍🚀", "#4285f4"], ["B", "#4285f4"],
  ]);
  const text = "😀 العربية אבג";
  const colored = await google!.render({ images: [], texts: [text], args: {} }, context);
  const image = await loadImage(Buffer.from(colored));
  const mask = await readPixels(image);
  const plain = layoutMemeText(parseMemeBbcode(text, 200, "left"));
  const { rgba } = await renderRgba(image.width, image.height, draw => plain.draw(draw, 50, 50));
  let glyphPixels = 0;
  let overlap = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset + 3]! < 220) continue;
    glyphPixels++;
    if (Math.min(mask[offset]!, mask[offset + 1]!, mask[offset + 2]!) < 190) overlap++;
  }
  expect(glyphPixels).toBeGreaterThan(10_000);
  expect(overlap / glyphPixels).toBeGreaterThan(0.96);

  const decoration = layoutMemeText(parseMemeBbcode("[u][del]MMMM[/del][/u]", 45, "left"));
  const lines = await renderRgba(decoration.width + 8, decoration.height + 8, draw => decoration.draw(draw, 4, 4));
  const rows = Array.from({ length: decoration.height + 8 }, (_, y) => {
    let visible = 0;
    for (let x = 4; x < decoration.width + 3; x++) {
      if (lines.rgba[(y * (decoration.width + 8) + x) * 4 + 3]! > 180) visible++;
    }
    return visible > decoration.width * 0.9;
  });
  expect(rows.filter((visible, index) => visible && !rows[index - 1]).length).toBe(2);
});

test("万能表情保留原段落和底部留白，GIF 显示各帧并统一原平均时间", async () => {
  expect(universal?.info).toMatchObject({ keywords: ["万能表情", "空白表情"],
    params_type: { min_images: 1, max_images: 1, min_texts: 1, max_texts: 10, default_texts: ["在此处添加文字"] } });
  const source = encodeMemeGif(10, 4, [
    { rgba: Buffer.alloc(10 * 4 * 4, Uint8Array.of(0, 0, 215, 255)), delayMs: 40 },
    { rgba: Buffer.alloc(10 * 4 * 4, Uint8Array.of(0, 215, 0, 255)), delayMs: 90 },
  ], signal);
  const texts = ["[b][color=red]First[/color][/b]\n[align=right][size=53]第二行[/size][/align]",
    "[u][del]Third[/del][/u]"];
  const output = await universal!.render({
    images: [new File([new Uint8Array(source)], "avatar.gif")], texts, args: {},
  }, context);
  const sequence = await readMemeImageSequence(new File([new Uint8Array(output)], "result.gif"), signal);
  const textHeight = texts.reduce((height, text) => height + layoutMemeText(parseMemeBbcode(text, 45, "center"), 480).height, 0);
  expect(sequence.frames).toHaveLength(2);
  expect(sequence.averageDelayMs).toBe(60);
  expect([sequence.frames[0].width, sequence.frames[0].height]).toEqual([500, 200 + textHeight + 10]);
  const [first, second] = await Promise.all(sequence.frames.map(readPixels));
  expect([...first!.subarray(0, 4)]).toEqual([0, 0, 215, 255]);
  expect([...second!.subarray(0, 4)]).toEqual([0, 215, 0, 255]);
  expect([...second!.subarray(-4)]).toEqual([255, 255, 255, 255]);
});
