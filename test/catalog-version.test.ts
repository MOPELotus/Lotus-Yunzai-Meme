import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogVersion } from "../catalog-file.ts";
import module from "../lotus.ts";

test.skipIf(process.platform === "win32")("通过软链打开的表情库在查引用期间提交 WAL 时重新判定触发", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-catalog-version-"));
  const real = join(directory, "actual", "data.db");
  const alias = join(directory, "alias.db");
  const prior = {
    db: Bun.env.LOTUS_MEME_DB, config: Bun.env.LOTUS_MEME_CONFIG_DIR, server: Bun.env.LOTUS_MEME_SERVER_URL,
  };
  let calls = 0;
  const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=");
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch() {
      calls++;
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    },
  });
  let db: Database | undefined;
  try {
    await mkdir(join(directory, "actual"));
    await symlink(real, alias);
    db = new Database(real);
    db.exec(`CREATE TABLE meme (
      key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
      min_texts INTEGER, max_texts INTEGER, params TEXT
    )`);
    db.query("INSERT INTO meme VALUES (?, ?, 1, 1, 1, 1, ?)").run("old", JSON.stringify(["软链表情"]),
      JSON.stringify({ min_images: 1, max_images: 1, min_texts: 1, max_texts: 1 }));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
    const primary = await readFile(real);

    Bun.env.LOTUS_MEME_DB = alias;
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_SERVER_URL = server.url.href;
    const context = { message_type: "group" as const, user_id: 42, isMaster: false, isBotMaster: () => false, reply_id: 1 };
    const reply = { user_id: 99, message: [{ type: "image", file: png }] };
    expect(await module.fallback("#软链表情 测试", { ...context, lookupReply: async () => reply }))
      .toMatchObject({ type: "image", file: png });
    expect(calls).toBe(1);

    const before = catalogVersion();
    expect(await module.fallback("#软链表情 测试", {
      ...context,
      lookupReply: async () => {
        db!.exec("DELETE FROM meme");
        return reply;
      },
    })).toBeUndefined();
    expect(calls).toBe(1);
    expect(await readFile(real)).toEqual(primary);
    expect(await Bun.file(real + "-wal").exists()).toBe(true);
    expect(await Bun.file(alias + "-wal").exists()).toBe(false);
    expect(catalogVersion()).not.toBe(before);

    db.exec("PRAGMA journal_mode = DELETE");
    const beforeJournal = catalogVersion();
    db.exec("BEGIN IMMEDIATE; INSERT INTO meme(key) VALUES ('uncommitted')");
    expect(await Bun.file(real + "-journal").exists()).toBe(true);
    expect(await Bun.file(alias + "-journal").exists()).toBe(false);
    expect(catalogVersion()).not.toBe(beforeJournal);
    db.exec("ROLLBACK");
  } finally {
    db?.close();
    if (prior.db === undefined) delete Bun.env.LOTUS_MEME_DB; else Bun.env.LOTUS_MEME_DB = prior.db;
    if (prior.config === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR; else Bun.env.LOTUS_MEME_CONFIG_DIR = prior.config;
    if (prior.server === undefined) delete Bun.env.LOTUS_MEME_SERVER_URL; else Bun.env.LOTUS_MEME_SERVER_URL = prior.server;
    await server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});
