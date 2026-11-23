import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { specialTextCardTemplates } from "../templates/special-text-cards.ts";

const cases = [
  ["nokia", ["诺基亚", "有内鬼"], ["无内鬼，继续交易"], 1242, 1119, 255],
  ["bluearchive", ["蔚蓝档案标题", "batitle"], ["Blue", "Archive"], 1416, 450, 255],
  ["douyin", ["douyin"], ["douyin"], 814, 310, 71],
  ["p5letter", ["女神异闻录5预告信", "P5预告信"], ["TAKEYOURHEART"], 1770, 1300, 137],
  ["5000choyen", ["5000兆"], ["我去", "洛天依"], 1061, 580, 255],
] as const;

test("五个文字模板注册原别名、默认文案与入参数量，并使用离线原素材", async () => {
  const signal = AbortSignal.timeout(12_000);
  const context = { ...createBundledMemeResources(signal), signal };
  for (const [key, keywords, defaults, width, height, signature] of cases) {
    const template = specialTextCardTemplates.find(({ info }) => info.key === key);
    expect(template).toBeDefined();
    expect(builtinMemeTemplates).toContain(template!);
    expect(template!.info).toMatchObject({ keywords, params_type: {
      min_images: 0, max_images: 0, min_texts: defaults.length, max_texts: defaults.length,
      default_texts: defaults, args_type: null,
    } });
    const content = Buffer.from(await template!.render({ images: [], texts: defaults, args: {} }, context));
    expect(content[0]).toBe(signature);
    const decoded = await loadImage(content);
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    if (signature === 71) {
      const gif = await readMemeImageSequence(new File([content], "douyin.gif"), signal);
      expect(gif.frames).toHaveLength(10);
      expect(gif.averageDelayMs).toBe(200);
    }
  }
  for (const path of ["nokia/images/0.jpg", "bluearchive/images/halo.png", "bluearchive/images/cross.png", "p5letter/images/background.png"]) {
    expect(extraMemeAssets.get("images/python/meme_generator/memes/" + path)?.digest).toMatch(/^[a-f0-9]{64}$/u);
  }
}, 15_000);
