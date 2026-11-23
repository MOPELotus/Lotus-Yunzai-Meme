import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { pjskAssets } from "../backend-pjsk-assets.ts";
import { createModule, prepareMemeRequest } from "../lotus.ts";
import { pjskCharacters } from "../pjsk-characters.ts";
import { pjskTemplate } from "../templates/pjsk.ts";

test("世界计划的角色编号与源素材逐一对应", () => {
  const required = pjskCharacters.flatMap(([, directory,,count]) =>
    Array.from({ length: count }, (_, index) =>
      `images/python/meme_generator/memes/pjsk/images/${directory}/${String(index).padStart(2, "0")}.png` as const));
  expect(required).toHaveLength(364);
  expect(pjskAssets.map(([key]) => key)).toEqual(required);
  expect(pjskTemplate.info.shortcuts).toHaveLength(26);
});

test("世界计划旧角色快捷词选择底图，保留用户文字、图片编号和范围反馈", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "lotus-meme-pjsk-"));
  const config = join(scratch, "config");
  const previousConfig = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const previousDb = Bun.env.LOTUS_MEME_DB;
  await mkdir(config);
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  Bun.env.LOTUS_MEME_DB = join(scratch, "meme.db");
  const signal = new AbortController().signal;
  const module = createModule({ signal });
  const event = { message_type: "private" as const, user_id: 8234, isMaster: true, isBotMaster: () => true };
  const run = (text: string) => module.fallback(text, { ...event, message: [{ type: "text", text }] });
  try {
    const command = "#世界计划_airi 早安 图片编号 15";
    const reply = await run(command);
    if (!reply || typeof reply !== "object" || !("type" in reply) || reply.type !== "image" || typeof reply.file === "string") {
      throw new Error("世界计划未返回 PNG：" + String(reply));
    }
    const png = Buffer.from(reply.file);
    const bundles = createBundledMemeResources(signal);
    const source = await bundles.imageAsset("python/meme_generator/memes/pjsk/images/airi/14.png");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([source.readUInt32BE(16), source.readUInt32BE(20)]);
    const prepared = await prepareMemeRequest("#PJSK-初音未来 台词 -n 13", event);
    if (!prepared || typeof prepared === "string") throw new Error("世界计划未解析快捷词：" + String(prepared));
    expect(prepared.key).toBe("pjsk");
    expect(prepared.body.getAll("texts")).toEqual(["台词"]);
    expect(JSON.parse(String(prepared.body.get("args")))).toMatchObject({ character: 16, number: 13 });
    expect(await run("#pjsk爱莉 台词 -n 16")).toBe("角色爱莉的图片编号错误，请输入1-15");
    expect(await run("#pjsk 台词 角色编号 27")).toBe("角色编号错误，请输入1-26");
  } finally {
    await module.dispose();
    if (previousConfig === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previousConfig;
    if (previousDb === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previousDb;
    await rm(scratch, { recursive: true, force: true });
  }
});
