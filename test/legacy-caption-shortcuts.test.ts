import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalMemeBackend, nativeShortcutPattern } from "../backend-lifecycle.ts";
import { initializeLocalCatalog } from "../catalog-update.ts";
import { legacyCaptionShortcutPatterns } from "../legacy-caption-shortcuts.ts";
import { createModule, prepareMemeRequest } from "../lotus.ts";
import { legacyCaptionShortcutTemplates } from "../templates/legacy-caption-shortcuts.ts";

test("文字表情只识别与固定旧注册匹配的捕获正则", () => {
  expect(legacyCaptionShortcutTemplates.map(entry => entry.info.key)).toEqual(["high_EQ", "intel_inside", "scratchcard", "wakeup", "wujing"]);
  for (const { template, source, pattern } of legacyCaptionShortcutPatterns) {
    expect(nativeShortcutPattern(template, source)?.pattern).toBe(pattern);
    expect(nativeShortcutPattern(template, source + ".*")).toBeUndefined();
    expect(nativeShortcutPattern("scratchcard", source)).toBeUndefined();
  }
  expect(legacyCaptionShortcutTemplates[0]!.info.params_type.default_texts).toEqual(["高情商", "低情商"]);
  expect(legacyCaptionShortcutTemplates.at(-1)!.info.params_type.default_texts).toEqual(["不买华为不是", "人"]);
});

test("旧快捷捕获传完整双段和空字段，并从本机私聊生成真 JPEG", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-legacy-caption-"));
  const config = join(directory, "config");
  const before = { config: Bun.env.LOTUS_MEME_CONFIG_DIR, database: Bun.env.LOTUS_MEME_DB };
  await mkdir(config);
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  Bun.env.LOTUS_MEME_DB = join(directory, "meme.db");
  const signal = new AbortController().signal;
  const backend = createLocalMemeBackend(signal, legacyCaptionShortcutTemplates);
  const module = createModule({ signal });
  const privateEvent = { message_type: "private" as const, user_id: 1234, isMaster: true, isBotMaster: () => true };
  try {
    await backend.ensure();
    await initializeLocalCatalog(signal);
    for (const [message, key, expected] of [
      ["#高情商:真好 低情商:慢/点", "high_EQ", ["慢/点", "真好"]],
      ["#低情商:慢/点 高情商:真好", "high_EQ", ["慢/点", "真好"]],
      ["#高低情商 左 / 右", "high_EQ", ["左", "右"]],
      ["#低高情商", "high_EQ", ["高情商", "低情商"]],
      ["#in/tel inside", "intel_inside", ["in/tel"]],
      ["#inside", "intel_inside", ["intel"]],
      ["#好 起来了", "wakeup", ["好"]],
      ["#好起来了", "wakeup", ["好"]],
      ["#吴京:中国右", "wujing", ["", "右"]],
      ["#吴京:左中国", "wujing", ["左", ""]],
      ["#吴京 中国", "wujing", ["", ""]],
      ["#吴京中国", "wujing", ["不买华为不是", "人"]],
      ["#刮刮乐 奖品", "scratchcard", ["奖品"]],
      ["#刮刮乐", "scratchcard", ["谢谢参与"]],
    ] as const) {
      const prepared = await prepareMemeRequest(message, privateEvent);
      expect(prepared && typeof prepared !== "string" && prepared.key).toBe(key);
      if (!prepared || typeof prepared === "string") throw new Error("旧指令未准备成功：" + message);
      const submitted = prepared.body.getAll("texts");
      if (message === "#低高情商" || message === "#吴京中国") {
        // The old chat client samples each missing text from default_texts.
        expect(submitted).toHaveLength(expected.length);
        expect(submitted.every(text => expected.some(value => value === text))).toBeTrue();
      } else expect(submitted).toEqual([...expected]);
      const reply = await module.fallback(message, { ...privateEvent, message: [{ type: "text", text: message }] });
      if (!reply || typeof reply !== "object" || !("type" in reply) || reply.type !== "image" || typeof reply.file === "string") {
        throw new Error("固定表情未返回图像：" + message + " " + String(reply));
      }
      expect(Buffer.from(reply.file).toString("hex", 0, 3)).toBe("ffd8ff");
    }
    for (const message of ["#12345678901 inside", "#天马上就要 起来了", "#低情商 左 错字 右"]) {
      expect(await prepareMemeRequest(message, privateEvent)).toBeUndefined();
    }
  } finally {
    await module.dispose();
    backend.dispose();
    if (before.config === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = before.config;
    if (before.database === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = before.database;
    await rm(directory, { recursive: true, force: true });
  }
}, 12_000);
