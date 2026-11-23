import { expect, test } from "bun:test";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { textSpeechMemeTemplates } from "../templates/text-speech.ts";

const ba = textSpeechMemeTemplates.find(({ info }) => info.key === "ba_say")!;

test("旧说话模板保留默认文字、咖波多段，以及七种档案角色快捷指令", () => {
  expect(textSpeechMemeTemplates.map(({ info }) => [
    info.key, info.keywords, info.params_type.default_texts, info.params_type.max_texts,
  ])).toEqual([
    ["ba_say", ["ba说"], ["那我问你"], 1],
    ["capoo_say", ["咖波说"], ["寄"], 10],
    ["luotianyi_say", ["洛天依说", "天依说"], ["好想去海边啊～"], 1],
    ["luxun_say", ["鲁迅说", "鲁迅说过"], ["我没有说过这句话"], 1],
  ]);
  expect(ba.info.shortcuts?.map(({ key, args }) => [key, args])).toEqual([
    ["心奈说", ["--character", "1"]], ["爱丽丝说", ["--character", "2"]], ["泉奈说", ["--character", "3"]],
    ["key说", ["--character", "4"]], ["玛丽说", ["--character", "5"]], ["濑名说", ["--character", "6"]],
    ["优香说", ["--character", "7"]],
  ]);
  const schema = ba.info.params_type.args_type;
  expect(parseGenerationArgs(schema, "左 --character 3 你好")).toMatchObject({
    values: { character: 3, position: "left" }, text: "你好",
  });
});

test("档案角色按编号只加载当次原图，非法编号沿用原提示", async () => {
  const images: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { images.push(path); throw new Error("图片夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  const input = { images: [], texts: ["测试"], args: { character: 8, position: "left" } };
  await expect(ba.render(input, context)).rejects.toThrow("角色编号错误，请输入1-7");
  expect(images).toHaveLength(0);
  await expect(ba.render({ ...input, args: { character: 7 } }, context)).rejects.toThrow("图片夹具");
  expect(images).toEqual(["ba_say/yuuka.png"]);
});
