import { expect, test } from "bun:test";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { textAnnouncementMemeTemplates } from "../templates/text-announcements.ts";

test("喜报、悲报和罗永浩说沿用旧别名、默认文本和原素材", async () => {
  expect(textAnnouncementMemeTemplates.map(({ info }) => [
    info.key, info.keywords, info.params_type.default_texts, info.params_type.min_images, info.params_type.min_texts,
  ])).toEqual([
    ["bad_news", ["悲报"], ["喜报"], 0, 1],
    ["good_news", ["喜报"], ["悲报"], 0, 1],
    ["luoyonghao_say", ["罗永浩说"], ["又不是不能用"], 0, 1],
  ]);
  const files: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { files.push(path); throw new Error("图片夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  for (const template of textAnnouncementMemeTemplates) {
    await expect(template.preview!(context)).rejects.toThrow("图片夹具");
  }
  expect(files).toEqual(["bad_news/0.png", "good_news/0.jpg", "luoyonghao_say/0.jpg"]);
});
