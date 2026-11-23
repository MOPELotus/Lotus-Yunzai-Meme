import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { createLocalMemeBackend } from "../backend-lifecycle.ts";
import { initializeLocalCatalog } from "../catalog-update.ts";
import { createModule, prepareMemeRequest } from "../lotus.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { anyliewStaticAvatarTemplates } from "../templates/anyliew-static-avatar.ts";
import { anyliewWordCardTemplates } from "../templates/anyliew-word-cards.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const beverageKeys = ["mixue_jasmine_milk_green", "mixue_stick_beaten_fresh_orange", "kfc_thursday", "kfc"];

test("AnyLiew 通知书、说话、手写、外框及头像卡从隔离私聊离线出图", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-word-cards-"));
  const config = join(root, "config");
  await mkdir(config);
  const before = { config: Bun.env.LOTUS_MEME_CONFIG_DIR, database: Bun.env.LOTUS_MEME_DB };
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  Bun.env.LOTUS_MEME_DB = join(root, "catalog.sqlite");
  const signal = new AbortController().signal;
  const paired = anyliewStaticAvatarTemplates.filter(({ info }) => beverageKeys.includes(info.key));
  expect(paired.map(entry => entry.info.key)).toEqual(beverageKeys);
  const backend = createLocalMemeBackend(signal, [...anyliewWordCardTemplates, ...paired]);
  const handler = createModule({ signal });
  const context = { message_type: "private" as const, user_id: 1234, isMaster: true, isBotMaster: () => true };
  try {
    await backend.ensure();
    await initializeLocalCatalog(signal);
    const { png } = await renderExactPng(32, 24, draw => {
      draw.fillStyle = "#0068bb";
      draw.fillRect(0, 0, 32, 24);
    });
    const segment = { type: "image", file: "base64://" + png.toString("base64") };
    for (const [text, key, marker, dimensions, numImages] of [
      ["#录取通知书 --name 测试对象 原来姓名", "admission_letter", "ffd8ff", [1111, 1416], 0],
      ["#樱羽艾玛说", "aima_say", "ffd8ff", undefined, 0],
      ["#亚托莉说", "atri_say", "ffd8ff", [549, 489], 0],
      ["#Deepseek说 -n 1", "deepseek_say", "ffd8ff", [1254, 1254], 0],
      ["#鲸鱼娘说 --number 4 样本", "deepseek_say", "ffd8ff", [1254, 1254], 0],
      ["#宇智波鼬说", "naruto_uchiha_itachi_say", "ffd8ff", [1080, 1062], 0],
      ["#兜说", "naruto_yakushi_kabuto_say", "ffd8ff", [1423, 1400], 0],
      ["#手写", "handwriting", "ffd8ff", [2560, 2560], 0],
      ["#恶语相向", "bully_me", "ffd8ff", undefined, 1],
      ["#茉莉奶绿", "mixue_jasmine_milk_green", "ffd8ff", [750, 750], 2],
      ["#棒打鲜橙", "mixue_stick_beaten_fresh_orange", "ffd8ff", [974, 974], 2],
      ["#疯狂星期四", "kfc_thursday", "ffd8ff", [2055, 2894], 1],
      ["#肯德基", "kfc", "89504e47", [1065, 1071], 1],
    ] as const) {
      const message = [{ type: "text", text }, ...Array.from({ length: numImages }, () => segment)];
      if (numImages === 0) {
        const prepared = await prepareMemeRequest(text, context);
        if (!prepared || typeof prepared === "string") throw new Error("未识别命令 " + text);
        expect(prepared.key).toBe(key);
        if (key === "admission_letter") {
          expect(JSON.parse(String(prepared.body.get("args"))).name).toBe("测试对象");
          expect(prepared.body.getAll("texts")).toEqual(["原来姓名"]);
        }
        if (key === "deepseek_say") expect(JSON.parse(String(prepared.body.get("args"))).number).toBe(text.includes("4") ? 4 : 1);
      }
      const reply = await handler.fallback(text, { ...context, message });
      if (!reply || typeof reply !== "object" || !("type" in reply) || reply.type !== "image" || typeof reply.file === "string") {
        throw new Error("没有出图 " + text + " " + String(reply));
      }
      const bytes = Buffer.from(reply.file);
      expect(bytes.toString("hex", 0, marker.length / 2)).toBe(marker);
      const image = await loadImage(bytes);
      if (dimensions) expect([image.width, image.height]).toEqual([...dimensions]);
      else if (key === "aima_say") expect([[417, 569], [497, 509]]).toContainEqual([image.width, image.height]);
      else expect(image.width).toBe(650);
    }
    const invalid = "#大肥鱼说 --number 5";
    expect(await handler.fallback(invalid, { ...context, message: [{ type: "text", text: invalid }] })).toContain("1～4");

    const frame = (red: number) => Uint8Array.from({ length: 16 * 16 * 4 }, (_, index) => index % 4 === 3 ? 255 : index % 4 === 0 ? red : 45);
    const gif = encodeMemeGif(16, 16, [{ rgba: frame(20), delayMs: 60 }, { rgba: frame(220), delayMs: 120 }], signal);
    const resources = { signal, ...createBundledMemeResources(signal) };
    for (const template of paired.slice(2)) {
      const bytes = await template.render({ images: [new File([new Uint8Array(gif)], "avatar.gif")], texts: [], args: {} },
        resources);
      expect(Buffer.from(bytes).toString("ascii", 0, 6)).toMatch(/^GIF8[79]a$/u);
      const sequence = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), signal);
      expect(sequence.frames).toHaveLength(2);
      expect(sequence.averageDelayMs).toBe(90);
    }
  } finally {
    await handler.dispose();
    backend.dispose();
    if (before.config === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = before.config;
    if (before.database === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = before.database;
    await rm(root, { recursive: true, force: true });
  }
}, 35_000);
