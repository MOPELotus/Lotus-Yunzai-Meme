import { expect, test } from "bun:test";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { legacyArchiveAssets } from "../backend-legacy-archive-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { legacyArchiveOverlayTemplates } from "../templates/legacy-archive-overlays.ts";
import { previewImage } from "../templates/template-layout.ts";

const registry = new Map(legacyArchiveOverlayTemplates.map(template => [template.info.key, template]));

test("保留旧目录的素材范围、共享别名和一段可忽略文字", () => {
  expect(legacyArchiveAssets.length).toBe(138);
  expect(registry.size).toBe(11);
  expect(registry.get("big_do")?.info.keywords).toEqual(["大撅", "狠狠地撅"]);
  expect(registry.get("do")?.info.keywords).toEqual(["撅"]);
  expect(registry.get("moistening_water")?.info.params_type.max_texts).toBe(1);
  expect(registry.has("laydown_do")).toBeFalse();
  expect(registry.has("sitdown_do")).toBeFalse();
});

test("相邻重复原画面合并时保留原版总时长", async () => {
  const signal = AbortSignal.timeout(15_000);
  const resources = createBundledMemeResources(signal);
  const fixture = await previewImage(signal);
  for (const [key, count, expected] of [["behind_do", 2, [300, 207, 7, 100]], ["spraypee", 1, [618, 618, 15, 80]]] as const) {
    const output = await registry.get(key)!.render({ images: Array<File>(count).fill(fixture), texts: [], args: {} }, { signal, ...resources });
    const gif = await readMemeImageSequence(new File([new Uint8Array(output)], key + ".gif"), signal);
    expect([gif.frames[0].width, gif.frames[0].height, gif.frames.length, gif.averageDelayMs]).toEqual([...expected]);
  }
});
