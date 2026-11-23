import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGuobaForm } from "../../../lib/panel-guoba.ts";
import { MemeTemplateFeedback } from "../builtin-template.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

test("典中典保留三条关键词和单段输入提示的旧参数", () => {
  const template = builtinMemeTemplates.find(({ info }) => info.key === "dianzhongdian");
  expect(template?.info).toMatchObject({ key: "dianzhongdian", keywords: ["入典", "典中典", "黑白草图"],
    params_type: { min_images: 1, max_images: 1, min_texts: 1, max_texts: 2, default_texts: ["救命啊"], args_type: null } });
});

test("单段或空日语文案先返回本机用法，不读取头像或字体", async () => {
  const template = builtinMemeTemplates.find(({ info }) => info.key === "dianzhongdian")!;
  const context = {
    signal: new AbortController().signal,
    async imageAsset() { throw new Error("单段文案不读取素材"); },
    async fontAsset() { throw new Error("单段文案不读取字体"); },
  };
  for (const texts of [["救命啊"], ["救命啊", "  "]]) {
    const render = template.render({ images: [new File([], "unused.png")], texts, args: {} }, context);
    await expect(render).rejects.toThrow(MemeTemplateFeedback);
    await expect(render).rejects.toThrow("请用斜杠补上日语文案，例如 #典中典 救命啊/助けて。");
  }
});

test("本机表情面板隐藏已退役的翻译字段，保持旧凭据文件原样", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-dianzhongdian-local-"));
  const previous = Bun.env.LOTUS_MEME_CONFIG_DIR;
  Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
  try {
    const path = join(directory, "translation.yaml");
    const legacy = 'baidu_trans_appid: "12345678901234567"\nbaidu_trans_apikey: "fixture-only-legacy-secret"\n';
    await writeFile(path, legacy, { mode: 0o600 });
    const form = await loadGuobaForm(fileURLToPath(new URL("../", import.meta.url)));
    if (!form) throw new Error("表情合成面板未加载");
    expect(form.schemas.some(schema => "field" in schema && typeof schema.field === "string" && schema.field.startsWith("translation."))).toBe(false);
    expect(JSON.stringify(await form.read())).not.toContain("fixture-only-legacy-secret");
    expect(await form.save({ "translation.baidu_trans_apikey": null })).toMatchObject({ ok: false });
    expect(await form.save({ "meme.cache": false })).toMatchObject({ ok: true });
    expect(await readFile(path, "utf8")).toBe(legacy);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  } finally {
    if (previous === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
