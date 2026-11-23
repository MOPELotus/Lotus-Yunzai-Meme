import { expect, test } from "bun:test";
import { anyliewTextDialogueAssets } from "../backend-text-dialogue-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { anyliewTextDialogueTemplates } from "../templates/anyliew-text-dialogue.ts";

const signal = new AbortController().signal;
const keys = [
  "mihoyo_funina_card", "mihoyo_liuwei_say", "mihoyo_neuvillette_say", "mihoyo_paimon_say", "miku_say",
  "moria_ruruka_say", "mygo_chihaya_anon_say", "mygo_togawa_sakiko_say", "mygo_wakaba_mutsumi_say",
] as const;

test("纯文字对话模板保留九个旧键的默认文字、输入形态及固定资源", async () => {
  expect(anyliewTextDialogueTemplates.map(template => template.info.key)).toEqual([...keys]);
  expect(anyliewTextDialogueAssets).toHaveLength(14);
  const paths = new Set<string>(anyliewTextDialogueAssets.map(([path]) => "anyliew/" + path));
  const context: MemeTemplateContext = {
    signal,
    async fontAsset() { throw new Error("离线用例无字体"); },
    async imageAsset(path) {
      expect(paths.has(path)).toBe(true);
      throw new Error("资源路径检查完成");
    },
  };

  for (const template of anyliewTextDialogueTemplates) {
    expect(template.info.params_type).toMatchObject({ min_images: 0, max_images: 0, min_texts: 1, max_texts: 1 });
    expect(template.info.params_type.default_texts).toHaveLength(1);
    expect(template.info.keywords.length).toBeGreaterThan(0);
    await expect(template.preview!(context)).rejects.toThrow("资源路径检查完成");
  }
});

test("两个 MyGO 编号参数选择准确底图，越界或非整数时不取资源", async () => {
  const assets: string[] = [];
  const context: MemeTemplateContext = {
    signal,
    async fontAsset() { throw new Error("离线用例无字体"); },
    async imageAsset(path) {
      assets.push(path);
      throw new Error("资源路径检查完成");
    },
  };
  for (const [key, count] of [["mygo_togawa_sakiko_say", 3], ["mygo_wakaba_mutsumi_say", 4]] as const) {
    const template = anyliewTextDialogueTemplates.find(entry => entry.info.key === key)!;
    const params = template.info.params_type.args_type;
    for (const flag of ["-n", "--number"]) {
      const parsed = parseGenerationArgs(params, flag + " " + count + " 新文字");
      expect(parsed.values.number).toBe(count);
      expect(parsed.text).toBe("新文字");
      await expect(template.render({ images: [], texts: [parsed.text], args: parsed.values }, context)).rejects.toThrow("资源路径检查完成");
      expect(assets.at(-1)).toBe("anyliew/emoji/" + key + "/images/" + count + ".png");
    }
    await expect(template.render({ images: [], texts: ["新文字"], args: { number: 0 } }, context)).rejects.toThrow("资源路径检查完成");
    expect(assets.at(-1)).toMatch(new RegExp("/[1-" + count + "]\\.png$", "u"));
    const before = assets.length;
    for (const number of [-1, count + 1, 1.5, "1"]) {
      await expect(template.render({ images: [], texts: ["新文字"], args: { number } }, context)).rejects.toThrow("图片编号错误");
    }
    expect(assets).toHaveLength(before);
  }
});
