import { expect, test } from "bun:test";
import { anyliewTailAssets } from "../backend-anyliew-tail-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { buildGenerationBody } from "../generation.ts";
import { anyliewTailTemplates } from "../templates/anyliew-tail.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { isExcludedMemeTemplate } from "../template-policy.ts";

test("旧静图与头像动图家族注册原入口和全部已校验底图", () => {
  expect(anyliewTailTemplates.map(({ info }) => info.key).sort()).toEqual([
    "up_to", "white_cat_say", "widow", "xiluo_disgust", "xueli_say", "xueli_think", "yuzu_soft_ayachi_nene",
    "yuzu_soft_murasame_blackboard", "yuzu_soft_murasame_hug", "yuzu_soft_murasame_husband", "yuzu_soft_murasame_say",
  ]);
  expect(anyliewTailAssets).toHaveLength(14);
  for (const template of anyliewTailTemplates) {
    expect(builtinMemeTemplates.filter(candidate => candidate.info.key === template.info.key)).toEqual([template]);
    expect(isExcludedMemeTemplate(template.info.key, template.info.tags)).toBeFalse();
  }
  for (const [path, digest] of anyliewTailAssets) {
    expect(extraMemeAssets.get(`images/anyliew/${path}`)?.digest).toBe(digest);
  }
  for (const key of ["up_to", "xiluo_disgust", "xueli_think", "yuzu_soft_murasame_husband"]) {
    expect(anyliewTailTemplates.find(template => template.info.key === key)?.info.params_type).toMatchObject({
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 1,
    });
  }
});

test("保留两组编号选择和白猫说的旧默认文案", async () => {
  const named = (key: string) => anyliewTailTemplates.find(template => template.info.key === key)!;
  const cat = named("white_cat_say");
  const input = await buildGenerationBody(cat.info.key, cat.info.keywords, "--number 2",
    JSON.stringify(cat.info.params_type), { user_id: 10001, isMaster: false });
  if (typeof input === "string") throw new Error(input);
  expect(input.body.getAll("texts")).toEqual(["宝贝~"]);
  expect(JSON.parse(String(input.body.get("args"))).number).toBe(2);
  const assetPaths: string[] = [];
  const context: MemeTemplateContext = {
    signal: AbortSignal.timeout(5000),
    async imageAsset(path) { assetPaths.push(path); throw new Error("底图夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  const avatar = new File(["头像"], "avatar.png", { type: "image/png" });
  const hug = named("yuzu_soft_murasame_hug");
  for (const [template, images, variants] of [[cat, [], 2], [hug, [avatar], 3]] as const) {
    for (let number = 1; number <= variants; number++) {
      await expect(template.render({ images, texts: [], args: { number } }, context)).rejects.toThrow("底图夹具");
    }
    await expect(template.render({ images, texts: [], args: { number: variants + 1 } }, context)).rejects.toThrow(`1～${variants}`);
  }
  expect(assetPaths).toEqual(["white_cat_say/images/1.png", "white_cat_say/images/2.png",
    "yuzu_soft_murasame_hug/images/1.png", "yuzu_soft_murasame_hug/images/2.png", "yuzu_soft_murasame_hug/images/3.png"]
    .map(path => `anyliew/emoji/${path}`));
});
