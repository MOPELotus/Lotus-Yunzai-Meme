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
    ["slogan", ["口号"], 6, 6, [
      "我们是谁？", "浙大人！", "到浙大来做什么？", "混！", "将来毕业后要做什么样的人？", "混混！",
    ]],
    ["ascension", ["升天"], 1, 1, ["学的是机械"]],
    ["meteor", ["流星"], 1, 1, ["我要对象"]],
    ["wish_fail", ["许愿失败"], 1, 1, ["我要对象"]],
    ["top_notch", ["顶尖"], 1, 1, ["运营"]],
    ["my_opinion", ["我的意见如下", "我的意见是"], 1, 1, []],
    ["not_call_me", ["不喊我"], 1, 1, ["开银趴不喊我是吧"]],
    ["hold_grudge", ["记仇"], 1, 1, ["群友不发涩图"]],
  ]);
});
