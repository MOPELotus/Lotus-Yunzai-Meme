import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { nativeShortcutPattern } from "../backend-lifecycle.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { matchFixedShortcut } from "../legacy-caption-shortcuts.ts";
import { specialPrintCardTemplates } from "../templates/special-print-cards.ts";

const path = "images/python/meme_generator/memes/";
const signal = AbortSignal.timeout(18_000);
const context = { ...createBundledMemeResources(signal), signal };

test("有参数的旧文字卡保留原素材尺寸、选项和所有心奈背景", async () => {
  for (const [key, args, size] of [
    ["certificate", { time: "2024-02-29" }, [2692, 2000]],
    ["yeshu", {}, [600, 1200]],
    ["panda_dragon_figure", { name: "责怪龙" }, [550, 550]],
    ["atri_pillow", { mode: "no" }, [750, 422]],
    ["kokona_seal", { number: 12 }, [640, 640]],
  ] as const) {
    const template = specialPrintCardTemplates.find(({ info }) => info.key === key)!;
    const content = Buffer.from(await template.render({
      images: [], texts: template.info.params_type.default_texts!, args,
    }, context));
    const decoded = await loadImage(content);
    expect(content[0]).toBe(137);
    expect([decoded.width, decoded.height]).toEqual([...size]);
  }
  const kokona = specialPrintCardTemplates.find(({ info }) => info.key === "kokona_seal")!;
  await expect(kokona.render({ images: [], texts: ["满分"], args: { number: 13 } }, context)).rejects.toThrow("图片编号错误，请选择 1~12");
  for (let number = 1; number <= 12; number++) {
    expect(extraMemeAssets.get(path + "kokona_seal/images/" + number + ".png")?.digest).toMatch(/^[a-f0-9]{64}$/u);
  }
}, 16_000);

test("熊猫龙图仅使用固定上游快捷式，同时捕获名称和正文", () => {
  const dragon = specialPrintCardTemplates.find(({ info }) => info.key === "panda_dragon_figure")!;
  const source = dragon.info.shortcuts![0]!.key;
  const shortcut = nativeShortcutPattern(dragon.info.key, source)!;
  expect(shortcut.pattern.exec("责怪龙：我要玩原神")?.groups).toEqual({ name: "责怪", text: "我要玩原神" });
  expect(shortcut.option).toEqual({ name: "name", capture: "name", suffix: "龙" });
  expect(matchFixedShortcut(shortcut, "责怪龙：我要玩原神")).toEqual({
    keyword: "责怪龙：我要玩原神", shortcutTexts: ["我要玩原神"], preset: { name: "name", value: "责怪龙" },
  });
  expect(nativeShortcutPattern(dragon.info.key, source + ".*")).toBeUndefined();
});

test("固定捷径只捕获参数时，保留触发词后的正文", () => {
  const definition = {
    template: "fixture", source: "示例(?P<id>\\d+)", pattern: /^示例(?<id>\d+)(?=\s|$)/u,
    option: { name: "number", capture: "id", suffix: "" },
  };
  expect(matchFixedShortcut(definition, "示例12 正文")).toEqual({
    keyword: "示例12", shortcutTexts: undefined, preset: { name: "number", value: "12" },
  });
});
