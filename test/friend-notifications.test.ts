import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadImage } from "skia-canvas";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { createLocalMemeBackend } from "../backend-lifecycle.ts";
import module, { prepareMemeRequest } from "../lotus.ts";
import { friendNotificationMemeTemplates } from "../templates/friend-notifications.ts";

const [friend, steam] = friendNotificationMemeTemplates;
const signal = new AbortController().signal;

const sample = new File([Uint8Array.fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
)], "avatar.png");

test("我朋友说保留自定义昵称和最多十段独立对话", async () => {
  const context = { signal, ...createBundledMemeResources(signal) };
  const render = async (texts: string[]) => {
    const bytes = await friend.render({ images: [sample], texts, args: { name: "测试甲" } }, context);
    const image = await loadImage(Buffer.from(bytes));
    return [image.width, image.height];
  };
  expect(await render(["要不去玩游戏"])).toEqual([510, 221]);
  expect(await render(["第一句", "以及第二句话", "第三句"])).toEqual([510, 663]);
  await expect(render(Array(11).fill("太多"))).rejects.toThrow("数量");
});

test("Steam 旧快捷方式同时捕获称呼参数和游戏文本", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-steam-shortcut-"));
  const previous = { LOTUS_MEME_DB: Bun.env.LOTUS_MEME_DB, LOTUS_MEME_CONFIG_DIR: Bun.env.LOTUS_MEME_CONFIG_DIR };
  const lifetime = new AbortController();
  const backend = createLocalMemeBackend(lifetime.signal, [friend, steam]);
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_DB = join(directory, "meme.sqlite");
    await writeFile(join(directory, "meme.yaml"), "forceSharp: true\n");
    await backend.ensure();
    const png = sample;
    const input = { user_id: 42, isMaster: false, quoted: { userId: 43, images: [png] } };
    await module.fallback("#steam消息 -n 测试甲 黑神话：悟空", {
      user_id: 42, message_type: "group", isMaster: false, isBotMaster: () => false,
      reply_id: 12, lookupReply: async () => ({ user_id: 43, message: [{ type: "image", file: await png.bytes() }] }),
    });
    const shortcut = await prepareMemeRequest("#测试甲正在玩黑神话：悟空", input);
    const named = await prepareMemeRequest("#steam消息 -n 测试甲 黑神话：悟空", input);
    if (!shortcut || typeof shortcut === "string" || !named || typeof named === "string") {
      throw new Error("Steam 旧命令未接通。");
    }
    expect(shortcut.key).toBe("steam_message");
    expect(shortcut.body.getAll("texts")).toEqual(["黑神话：悟空"]);
    expect(JSON.parse(String(shortcut.body.get("args")))).toMatchObject({ name: "测试甲" });
    expect(JSON.parse(String(shortcut.body.get("args")))).toEqual(JSON.parse(String(named.body.get("args"))));
    const context = { signal, ...createBundledMemeResources(signal) };
    const direct = await steam.render({ images: [png], texts: ["黑神话：悟空"], args: { name: "测试甲" } }, context);
    const image = await loadImage(Buffer.from(direct));
    expect([image.width, image.height]).toEqual([1781, 440]);
  } finally {
    lifetime.abort();
    backend.dispose();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
