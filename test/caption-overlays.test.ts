import { expect, test } from "bun:test";
import { Canvas, loadImage } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplateContext } from "../builtin-template.ts";
import { captionOverlayMemeTemplates } from "../templates/caption-overlays.ts";
import { drawFittedText } from "../templates/template-layout.ts";

test("固定单图字幕表情保留旧库存别名和真默认值", () => {
  expect(captionOverlayMemeTemplates.map(({ info }) => [info.key, info.keywords, info.params_type.default_texts])).toEqual([
    ["acg_entrance", ["二次元入口"], ["走，跟我去二次元吧"]],
    ["addiction", ["上瘾", "毒瘾发作"], []],
    ["anya_suki", ["阿尼亚喜欢"], ["阿尼亚喜欢这个"]],
    ["father_work", ["闭嘴", "我爸爸"], ["此处添加文字"]],
    ["frieren_take", ["芙莉莲拿"], ["所谓的男人啊，只要送他们这种东西就会很开心"]],
    ["learn", ["偷学"], ["偷学群友数理基础"]],
    ["what_he_wants", ["最想要的东西"], ["今年520"]],
  ]);
  for (const { info } of captionOverlayMemeTemplates) {
    expect(info.params_type).toMatchObject({ min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, args_type: null });
  }
});

test("上瘾仅有字幕参数时扩展白底，头像保持叠在原画上方", async () => {
  const art = new Canvas(246, 246);
  const paint = art.getContext("2d");
  paint.fillStyle = "blue";
  paint.fillRect(0, 0, art.width, art.height);
  const avatar = new Canvas(16, 12);
  const color = avatar.getContext("2d");
  color.fillStyle = "red";
  color.fillRect(0, 0, avatar.width, avatar.height);
  const [frame, source] = await Promise.all([art.png, avatar.png]);
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { expect(path).toBe("addiction/0.png"); return frame; },
    async fontAsset() { throw new Error("空标题不依赖字体"); },
  };
  const meme = captionOverlayMemeTemplates.find(({ info }) => info.key === "addiction")!;
  const input = { images: [new File([new Uint8Array(source)], "avatar.png")], args: {} };
  const original = await loadImage(Buffer.from(await meme.render({ ...input, texts: [] }, context)));
  expect([original.width, original.height]).toEqual([246, 246]);
  const extended = await loadImage(Buffer.from(await meme.render({ ...input, texts: [""] }, context)));
  expect([extended.width, extended.height]).toEqual([246, 286]);
  const output = new Canvas(246, 286).getContext("2d");
  output.drawImage(extended, 0, 0);
  expect(output.getImageData(45, 45, 1, 1).data[0]).toBeGreaterThanOrEqual(245);
  expect(output.getImageData(100, 100, 1, 1).data[2]).toBeGreaterThanOrEqual(245);
  expect([...output.getImageData(180, 275, 1, 1).data]).toEqual([255, 255, 255, 255]);
});

test("底部字幕沿原框下缘对齐", () => {
  const draw = new Canvas(160, 160).getContext("2d");
  drawFittedText(draw, [10, 20, 150, 140], "TEST", "sans-serif", 36, 36, "center", "black", { wrap: false, vertical: "bottom" });
  expect(draw.getImageData(0, 0, 160, 90).data.some(channel => channel > 0)).toBe(false);
  expect(draw.getImageData(0, 92, 160, 48).data.some(channel => channel > 0)).toBe(true);
});

test("旧版段落按字体完整行高检查字幕区域", () => {
  const draw = new Canvas(180, 30).getContext("2d");
  drawFittedText(draw, [0, 0, 180, 30], "A", "sans-serif", 36, 36);
  expect(() => drawFittedText(draw, [0, 0, 180, 30], "A", "sans-serif", 36, 36, "center", "black",
    { paragraphMetrics: true })).toThrow(MemeTemplateFeedback);
});
