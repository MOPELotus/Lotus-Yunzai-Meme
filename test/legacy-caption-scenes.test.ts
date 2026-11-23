import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalMemeBackend } from "../backend-lifecycle.ts";
import { initializeLocalCatalog } from "../catalog-update.ts";
import { createModule, prepareMemeRequest } from "../lotus.ts";
import { legacyCaptionSceneTemplates } from "../templates/legacy-caption-scenes.ts";
import { previewImage } from "../templates/template-layout.ts";

test("旧头像字幕快捷捕获完整文本，并从随包原素材输出 PNG", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "lotus-meme-caption-scene-"));
  const config = join(scratch, "config");
  const priorConfig = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const priorDatabase = Bun.env.LOTUS_MEME_DB;
  await mkdir(config);
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  Bun.env.LOTUS_MEME_DB = join(scratch, "meme.db");
  const signal = new AbortController().signal;
  const backend = createLocalMemeBackend(signal, legacyCaptionSceneTemplates);
  const module = createModule({ signal });
  try {
    await backend.ensure();
    await initializeLocalCatalog(signal);
    const avatar = await previewImage(signal);
    const command = "#你的早/晚主要都是由这个引起的";
    const event = { message_type: "private" as const, user_id: 4321, isMaster: true, isBotMaster: () => true };
    const prepared = await prepareMemeRequest(command, { ...event, images: [avatar] });
    if (!prepared || typeof prepared === "string") throw new Error("旧快捷指令未命中：" + String(prepared));
    expect(prepared.key).toBe("caused_by_this");
    expect(prepared.body.getAll("texts")).toEqual(["早/晚"]);
    const file = "base64://" + Buffer.from(await avatar.arrayBuffer()).toString("base64");
    const reply = await module.fallback(command, { ...event, message: [{ type: "text", text: command }, { type: "image", file }] });
    if (!reply || typeof reply !== "object" || !("type" in reply) || reply.type !== "image" || typeof reply.file === "string") {
      throw new Error("旧快捷指令未返回图片：" + String(reply));
    }
    expect(Buffer.from(reply.file).toString("hex", 0, 8)).toBe("89504e470d0a1a0a");
  } finally {
    await module.dispose();
    await backend.dispose();
    if (priorConfig === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = priorConfig;
    if (priorDatabase === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = priorDatabase;
    await rm(scratch, { force: true, recursive: true });
  }
});
