import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModule, type MemePokeContext } from "../lotus.ts";
import { readMemeUsage } from "../usage.ts";
import { initializeLocalCatalog } from "../catalog-update.ts";
import { publishMemeProvider } from "../catalog-policy.ts";

const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=");
const baseConfig = "pokeEnable: true\npokeProbability: 100\npokeLimit: 20\n";
type Reply = Parameters<MemePokeContext["reply"]>[0];
type Renderer = (key: string) => Uint8Array<ArrayBuffer> | undefined | Promise<Uint8Array<ArrayBuffer> | undefined>;

async function fixture(run: (options: {
  handle: (input: MemePokeContext) => Promise<void>;
  input: MemePokeContext;
  replies: Reply[];
  avatars: string[];
  renders: string[];
  warnings: string[];
  config: (meme: string) => Promise<void>;
  access: (value: string) => Promise<void>;
  count: () => number;
  setRenderer: (renderer: Renderer) => void;
  setRandom: (value: number) => void;
}) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "lotus-meme-poke-"));
  const catalog = join(dir, "catalog.db");
  const orig = Object.fromEntries(["LOTUS_MEME_DB", "LOTUS_MEME_CONFIG_DIR"]
    .map(key => [key, Bun.env[key]]));
  Bun.env.LOTUS_MEME_DB = catalog;
  Bun.env.LOTUS_MEME_CONFIG_DIR = dir;
  const config = (value: string) => writeFile(join(dir, "meme.yaml"), value);
  const access = (value: string) => writeFile(join(dir, "access.yaml"), value);
  const avatarPaths: string[] = [];
  const renderPaths: string[] = [];
  const replies: Reply[] = [];
  const warnings: string[] = [];
  let render: Renderer = () => png;
  let roll = 0;
  const random = spyOn(Math, "random").mockImplementation(() => roll);
  const logger = spyOn(console, "warn").mockImplementation((message: string) => { warnings.push(message); });
  const fetchMock = async (resource: RequestInfo | URL) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    expect(url.origin).toBe("https://q1.qlogo.cn");
    expect(url.pathname).toBe("/g");
    avatarPaths.push(url.searchParams.get("nk") ?? "");
    return new Response(png);
  };
  const entries = new Map(([
    ["single-a", 1, 0], ["single-b", 1, 0], ["hidden", 1, 0], ["two", 2, 0], ["caption", 1, 1],
  ] as const).map(([key, images, texts]) => [String(key), { key, keywords: [`触发词-${key}`],
    params_type: { min_images: images, max_images: images, min_texts: texts, max_texts: texts } }]));
  const withdraw = publishMemeProvider({
    catalogIdentity: "lotus-skia:fixture-poke",
    async keys() { return [...entries.keys()]; },
    async info(key) { return entries.get(key); },
    async generate(key, form, signal) {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(form.getAll("texts")).toEqual([]);
      const images = form.getAll("images") as Blob[];
      expect(images).toHaveLength(1);
      expect(await images[0]!.bytes()).toEqual(png);
      renderPaths.push(key);
      return render(key);
    },
    async preview() { return; },
  });
  const intercept = spyOn(globalThis, "fetch").mockImplementation(Object.assign(fetchMock, {
    preconnect: () => {},
  }));
  const controller = new AbortController();
  let module: ReturnType<typeof createModule> | undefined;
  try {
    await initializeLocalCatalog(controller.signal);
    await access("blackListEnable: true\nblackList: [触发词-hidden]\n");
    module = createModule({ signal: controller.signal });
    const input: MemePokeContext = {
      backend: "onebot", botId: 99, actorId: 42, targetId: 99, groupId: 23,
      signal: controller.signal, allowed: () => true, isBotMaster: () => false,
      reply(body) { replies.push(body); return true; },
    };
    const count = () => {
      const db = new Database(catalog, { readonly: true });
      try {
        return [...readMemeUsage(db, catalog).values()].reduce((sum, next) => sum + next, 0);
      } finally {
        db.close();
      }
    };
    await run({
      handle: module.handlePoke, input, replies, avatars: avatarPaths, renders: renderPaths,
      warnings, config, access, count, setRenderer: next => { render = next; }, setRandom: value => { roll = value; },
    });
  } finally {
    controller.abort();
    await module?.dispose();
    withdraw();
    intercept.mockRestore();
    logger.mockRestore();
    random.mockRestore();
    for (const [key, value] of Object.entries(orig)) {
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("旧表情戳触发默认关闭、概率分界、只取操作者头像和绑定范围内的成功冷却", () =>
  fixture(async ({ handle, input, replies, avatars, renders, config, count, setRandom }) => {
    await handle(input);
    await config("pokeEnable: true\nenable: false\n");
    await handle(input);
    await config("pokeEnable: true\n");
    await handle({ ...input, targetId: 43 });
    await handle({ ...input, actorId: 99 });
    await handle({ ...input, allowed: () => false });
    setRandom(0.5);
    await handle(input);
    expect(avatars).toEqual([]);
    expect(renders).toEqual([]);

    setRandom(0.49);
    await handle(input);
    expect(avatars).toEqual(["42"]);
    expect(renders[0]).toMatch(/^single-[ab]$/u);
    expect(replies[0]).toEqual([expect.stringContaining("触发词-single-"), { type: "image", file: png }]);
    await handle(input);
    expect(renders).toHaveLength(1);
    await handle({ ...input, backend: "milky" });
    await handle({ ...input, groupId: 24 });
    await handle({ ...input, groupId: undefined });
    await handle({ ...input, actorId: 43 });
    await handle({ ...input, botId: 100, targetId: 100 });
    expect(renders).toHaveLength(6);
    expect(count()).toBe(6);

    await config(baseConfig.replace("100", "0"));
    await handle({ ...input, actorId: 65 });
    expect(renders).toHaveLength(6);
    await config(baseConfig.replace("20", "0"));
    await handle(input);
    expect(renders).toHaveLength(7);
  }));

test("戳一戳生成失败只重试另一模板，只有明确送达才记账和冷却", () =>
  fixture(async ({ handle, input, replies, avatars, renders, warnings, config, count, setRenderer }) => {
    await config(baseConfig);
    let attempt = 0;
    setRenderer(() => ++attempt === 1 ? undefined : png);
    await handle({ ...input, reply: body => { replies.push(body); return false; } });
    expect(avatars).toEqual(["42"]);
    expect(renders).toHaveLength(2);
    expect(new Set(renders).size).toBe(2);
    expect(replies).toHaveLength(1);
    expect(count()).toBe(0);
    await handle(input);
    expect(replies).toHaveLength(2);
    expect(renders).toHaveLength(3);
    expect(count()).toBe(1);
    await config(baseConfig + "errorReply: false\n");
    setRenderer(() => undefined);
    await handle({ ...input, actorId: 43 });
    expect(renders).toHaveLength(5);
    expect(replies).toHaveLength(2);
    expect(warnings).toEqual(["[meme] 戳一戳表情发送未确认。", "[meme] 戳一戳头像表情生成未完成。"]);
    await config(baseConfig);
    await handle({ ...input, actorId: 43 });
    expect(replies.at(-1)).toBe("戳一戳表情生成失败，请稍后再试。");
    expect(count()).toBe(1);
  }));

test("并发戳只启动一次，等待中的会话失效或模板禁用不回复", () =>
  fixture(async ({ handle, input, replies, renders, config, access, count, setRenderer }) => {
    await config(baseConfig);
    const pending = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const entered = Promise.withResolvers<void>();
    setRenderer(() => { entered.resolve(); return pending.promise; });
    let allowed = true;
    const event = { ...input, allowed: () => allowed };
    const first = handle(event);
    await entered.promise;
    await handle(event);
    expect(renders).toHaveLength(1);
    allowed = false;
    pending.resolve(png);
    await first;
    expect(replies).toEqual([]);
    const enteredAgain = Promise.withResolvers<void>();
    const pendingAgain = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    setRenderer(() => { enteredAgain.resolve(); return pendingAgain.promise; });
    allowed = true;
    const next = handle(event);
    await enteredAgain.promise;
    await access("blackListEnable: true\nblackList: [single-a, single-b, hidden]\n");
    pendingAgain.resolve(png);
    await next;
    expect(replies).toEqual([]);

    await access("blackListEnable: true\nblackList: [hidden]\n");
    const enteredAbort = Promise.withResolvers<void>();
    const pendingAbort = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    const live = new AbortController();
    setRenderer(() => { enteredAbort.resolve(); return pendingAbort.promise; });
    const aborted = handle({ ...event, signal: live.signal });
    await enteredAbort.promise;
    live.abort();
    pendingAbort.resolve(png);
    await aborted;
    expect(replies).toEqual([]);
    expect(count()).toBe(0);
  }));
