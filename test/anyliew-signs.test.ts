import { expect, test } from "bun:test";
import { anyliewSignAssets } from "../backend-anyliew-sign-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { buildGenerationBody } from "../generation.ts";
import { anyliewSignTemplates } from "../templates/anyliew-signs.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

test("十一款原版举牌注册旧别名、字体模板底图和文本数量", async () => {
  expect(anyliewSignTemplates).toHaveLength(11);
  expect(anyliewSignAssets).toHaveLength(14);
  expect(anyliewSignTemplates.every(template => builtinMemeTemplates.includes(template))).toBeTrue();
  expect(anyliewSignAssets.every(([path, digest]) => extraMemeAssets.get(`images/anyliew/${path}`)?.digest === digest)).toBeTrue();
  const registry = new Map<string, string>(anyliewSignAssets);
  const read: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { read.push(path); throw new Error("底图夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  for (const template of anyliewSignTemplates) {
    const { key, params_type } = template.info;
    if (key === "acacia_anan_holdsign") continue;
    expect(params_type).toMatchObject({ min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, args_type: null });
    await expect(template.preview!(context)).rejects.toThrow("底图夹具");
    const path = read.at(-1)!.slice("anyliew/".length);
    expect(path).toStartWith(`emoji/${key}/images/0.`);
    expect(registry.get(path)).toMatch(/^[\da-f]{64}$/u);
  }
  const furina = anyliewSignTemplates.find(({ info }) => info.key === "mihoyo_funina_holdsign")!.info;
  expect(furina.keywords).toEqual(["芙宁娜举牌", "芙芙举牌", "芙芙酱举牌"]);
  expect(furina.params_type.default_texts?.[0]).toEndWith("我自己了。");
});

test("安安举牌命令带编号时继续可补默认文案，四个原底图可分别调用", async () => {
  const template = anyliewSignTemplates.find(({ info }) => info.key === "acacia_anan_holdsign")!;
  expect(template.info.tags).toEqual(["魔法少女的魔女审判", "夏目安安"]);
  const input = await buildGenerationBody(template.info.key, template.info.keywords, "-n 4",
    JSON.stringify(template.info.params_type), { user_id: 10001, isMaster: false });
  if (typeof input === "string") throw new Error(input);
  expect(input.body.getAll("texts")).toEqual(["快说吾辈可爱"]);
  expect(JSON.parse(String(input.body.get("args"))).number).toBe(4);
  const read: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { read.push(path); throw new Error("底图夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  for (const number of [1, 2, 3, 4]) {
    await expect(template.render({ images: [], texts: [], args: { number } }, context)).rejects.toThrow("底图夹具");
  }
  expect(read).toEqual(["0.png", "1.png", "2.jpg", "3.jpg"].map(asset => `anyliew/emoji/acacia_anan_holdsign/images/${asset}`));
  await expect(template.render({ images: [], texts: [], args: { number: 5 } }, context)).rejects.toThrow("1～4");
});
