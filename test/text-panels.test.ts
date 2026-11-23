import { expect, test } from "bun:test";
import { textPanelMemeTemplates } from "../templates/text-panels.ts";

test("原版文本面板沿用别名、单段、四段和预览的默认文字顺序", () => {
  expect(textPanelMemeTemplates.map(({ info }) => [
    info.key, info.keywords, info.params_type.min_texts, info.params_type.max_texts, info.params_type.default_texts,
  ])).toEqual([
    ["fanatic", ["狂爱", "狂粉"], 1, 1, ["洛天依"]],
    ["dont_press", ["不要按"], 1, 1, ["世界毁灭"]],
    ["find_chips", ["整点薯条"], 4, 4, [
      "我们要飞向何方", "我打算待会去码头整点薯条", "我说的是归根结底，活着是为了什么", "为了待会去码头整点薯条",
    ]],
  ]);
});
