import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeCatalogTable } from "../catalog-file.ts";
import type { LocalMemeProvider } from "../catalog-policy.ts";
import { requestMemeImage, requestMemePreview } from "../generate-reply.ts";
import { parseGenerationArgs } from "../generation-args.ts";

const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=");

test("内置表情直接调用本地渲染器，拒绝被排除、取消及超限的结果", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-native-boundary-"));
  const previous = Bun.env.LOTUS_MEME_DB;
  const fixture = join(directory, "catalog.db");
  Bun.env.LOTUS_MEME_DB = fixture;
  const db = new Database(fixture);
  db.run(`CREATE TABLE ${nativeCatalogTable} (key TEXT PRIMARY KEY, tags TEXT, info TEXT, keyWords TEXT)`);
  db.run(`INSERT INTO ${nativeCatalogTable} VALUES ('example', '[]', '{}', '[]')`);
  db.run(`INSERT INTO ${nativeCatalogTable} VALUES ('tagged', '[\"鸣潮\"]', '{}', '[]')`);
  const body = new FormData();
  body.append("images", new Blob([png], { type: "image/png" }), "avatar.png");
  body.append("texts", "测试文字");
  body.append("args", JSON.stringify({ ratio: 2.5, user_infos: [{ name: "测试用户", gender: "unknown" }] }));
  const calls: string[] = [];
  let output = png;
  let afterGenerate: (() => void) | undefined;
  const server: LocalMemeProvider = {
    timeout: 5000, catalogIdentity: "fixture",
    async keys() { return ["example"]; },
    async info() { return {}; },
    async generate(key, value, signal) {
      expect(signal?.aborted).toBe(false);
      expect(value).toBeInstanceOf(FormData);
      const file = value.get("images");
      expect(file).toBeInstanceOf(File);
      if (file instanceof File) {
        expect(file.name).toBe("avatar.png");
        expect(file.type).toBe("image/png");
        expect(await file.bytes()).toEqual(png);
      }
      expect(value.getAll("texts")).toEqual(["测试文字"]);
      expect(JSON.parse(String(value.get("args")))).toEqual({ ratio: 2.5, user_infos: [{ name: "测试用户", gender: "unknown" }] });
      calls.push(`generate:${key}`);
      afterGenerate?.();
      return output;
    },
    async preview(key, signal) {
      expect(signal?.aborted).toBe(false);
      calls.push(`preview:${key}`);
      return output;
    },
  };
  const failFetch = Object.assign(async () => { throw new Error("unexpected network"); }, { preconnect: () => {} });
  const fetched = spyOn(globalThis, "fetch").mockImplementation(failFetch);
  try {
    expect(await requestMemeImage({ key: "jinhsi", body }, server)).toBeUndefined();
    expect(await requestMemePreview("tagged", server)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(await requestMemeImage({ key: "example", body }, server)).toEqual(png);
    expect(await requestMemePreview("example", server)).toEqual(png);

    const signal = new AbortController();
    afterGenerate = () => signal.abort();
    expect(await requestMemeImage({ key: "example", body }, server, signal.signal)).toBeUndefined();
    expect(await requestMemePreview("example", server, signal.signal)).toBeUndefined();
    afterGenerate = undefined;
    output = new Uint8Array(8 * 1024 * 1024 + 1);
    output.set(png);
    expect(await requestMemePreview("example", server)).toBeUndefined();
    output = new Uint8Array([42]);
    expect(await requestMemeImage({ key: "example", body }, server)).toBeUndefined();

    output = png;
    afterGenerate = () => db.run(`UPDATE ${nativeCatalogTable} SET tags = '[\"鸣潮\"]' WHERE key = 'example'`);
    expect(await requestMemeImage({ key: "example", body }, server)).toBeUndefined();
    expect(calls).toEqual(["generate:example", "preview:example", "generate:example", "preview:example", "generate:example", "generate:example"]);
    expect(fetched).not.toHaveBeenCalled();
  } finally {
    fetched.mockRestore();
    db.close();
    if (previous === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("模板参数保留小数上下界、负数和中文选项别名", () => {
  const schema = { args_model: { properties: { ratio: { type: "number", minimum: -1, maximum: 10 }, mirror: { type: "boolean" } } },
    parser_options: [{ dest: "ratio", names: ["--ratio", "--比例"], args: [{ name: "ratio" }] },
      { dest: "mirror", names: ["-镜"], args: [], action: { type: 0, value: true } }] };
  expect(parseGenerationArgs(schema, "保留文字 --比例 -.5 -镜")).toMatchObject({ text: "保留文字", values: { ratio: -0.5, mirror: true }, issue: undefined });
  expect(parseGenerationArgs(schema, "--比例 -2").issue).toContain("无效");
  expect(parseGenerationArgs(schema, "--比例 -镜").issue).toContain("缺少值");
});
