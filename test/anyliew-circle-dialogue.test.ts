import { expect, test } from "bun:test";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { anyliewCircleDialogueAssets } from "../backend-circle-dialogue-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { buildGenerationBody } from "../generation.ts";
import { anyliewCircleDialogueTemplates } from "../templates/anyliew-circle-dialogue.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

const avatar = new File([Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=")], "avatar.png",
  { type: "image/png" });

test("圆裁对话使用旧别名以及与源匹配的 JPEG 和 PNG", async () => {
  expect(anyliewCircleDialogueTemplates).toHaveLength(17);
  expect(anyliewCircleDialogueTemplates.every(template => builtinMemeTemplates.includes(template))).toBe(true);
  expect(anyliewCircleDialogueAssets.every(([path, digest]) => extraMemeAssets.get(`images/anyliew/${path}`)?.digest === digest)).toBe(true);
  const images: string[] = [];
  const assets = new Map<string, string>(anyliewCircleDialogueAssets);
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { images.push(path); throw new Error("图像夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  const jpeg = ["atri_finger", "azur_lane_cheshire_thumbs_up", "doro_thumbs_up", "laughing", "yuzu_soft_murasame_clothes"];
  for (const template of anyliewCircleDialogueTemplates) {
    if (template.info.key === "national_day_plan") continue;
    const asset = `emoji/${template.info.key}/images/0.${jpeg.includes(template.info.key) ? "jpg" : "png"}`;
    expect(template.info.params_type).toEqual({ min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, args_type: null, default_texts: [] });
    expect(assets.get(asset)).toMatch(/^[\da-f]{64}$/u);
    await expect(template.render({ images: [avatar], texts: [], args: {} }, context)).rejects.toThrow("图像夹具");
    expect(images.at(-1)).toBe(`anyliew/${asset}`);
  }
  const contract = anyliewCircleDialogueTemplates.find(({ info }) => info.key === "contract")!;
  expect(contract.info.keywords).toContain("橙喵契约");
});

test("国庆计划支持原四张底图、编号选项和首位备注", async () => {
  const template = anyliewCircleDialogueTemplates.find(({ info }) => info.key === "national_day_plan")!;
  const phone = 10030;
  const input = await buildGenerationBody(template.info.key, template.info.keywords, "-n 4",
    JSON.stringify(template.info.params_type), {
      user_id: 10001, isMaster: false, images: [avatar], mentions: [phone, 10031],
      nickname: async user => user === String(phone) ? "首位备注" : "其他备注",
      gender: async () => "female",
    });
  if (typeof input === "string") throw new Error(input);
  expect(JSON.parse(String(input.body.get("args")))).toEqual({ user_infos: [{ name: "首位备注", gender: "female" }], number: 4 });
  expect(input.body.getAll("texts")).toEqual([]);
  const frames: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { frames.push(path); throw new Error("图像夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  for (const number of [1, 2, 3, 4]) {
    await expect(template.render({ images: [avatar], texts: [], args: { number } }, context)).rejects.toThrow("图像夹具");
  }
  expect(frames).toEqual([0, 1, 2, 3].map(index => `anyliew/emoji/national_day_plan/images/${index}.png`));
  expect(() => template.render({ images: [avatar], texts: [], args: { number: 5 } }, context)).toThrow("0～4");
});
