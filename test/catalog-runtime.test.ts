import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModule, resolveMemeTrigger } from "../lotus.ts";

test("就绪后补空目录，按旧设定增量同步且故障保留原目录", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-runtime-"));
  const file = join(root, "data.db");
  const env = ["LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_DB", "LOTUS_MEME_SERVER_URL"] as const;
  const previous = env.map((name) => Bun.env[name]);
  const requests: string[] = [];
  let keys = ["ba_say"];
  let broken = false;
  const fixture = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const path = new URL(request.url).pathname;
    requests.push(path);
    if (path === "/memes/keys") return Response.json(keys);
    const key = path.split("/")[2];
    if (!key || (broken && key === "new")) return new Response(null, { status: 503 });
    return Response.json({ key, keywords: [key], params_type: { min_images: 0, max_images: 0, min_texts: 0, max_texts: 0 } });
  } });
  let activate: (() => void) | undefined;
  let schedule: (() => Promise<void>) | undefined;
  const registered: string[] = [];
  const runtime = {
    whenReady(start: () => void) { activate = start; return () => { activate = undefined; }; },
    registerTask(cron: string, run: () => Promise<void>) {
      registered.push(cron);
      schedule = run;
      return () => { schedule = undefined; };
    },
  };
  let module: ReturnType<typeof createModule> | undefined;
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = root;
    Bun.env.LOTUS_MEME_DB = file;
    Bun.env.LOTUS_MEME_SERVER_URL = fixture.url.href;
    module = createModule({ signal: new AbortController().signal, memeRuntime: runtime });
    expect(requests).toEqual([]);
    expect(registered).toEqual([]);
    expect(await Bun.file(file).exists()).toBe(false);
    activate!();
    expect(registered).toEqual(["0 0 2 * * *"]);
    await schedule!();
    expect(requests).toEqual(["/memes/keys", "/memes/ba_say/info"]);
    expect(resolveMemeTrigger("#ba_say")).toMatchObject({ key: "ba_say" });
    expect(resolveMemeTrigger("#心奈说")).toMatchObject({ key: "ba_say" });

    keys = ["ba_say", "new"];
    broken = true;
    await schedule!();
    expect(requests.slice(-2)).toEqual(["/memes/keys", "/memes/new/info"]);
    expect(resolveMemeTrigger("#ba_say")).toMatchObject({ key: "ba_say" });
    expect(resolveMemeTrigger("#new")).toBeUndefined();
    broken = false;
    await schedule!();
    expect(requests.slice(-2)).toEqual(["/memes/keys", "/memes/new/info"]);
    expect(resolveMemeTrigger("#new")).toMatchObject({ key: "new" });

    await writeFile(join(root, "other.yaml"), "autoUpdateRes: false\n");
    const count = requests.length;
    await schedule!();
    expect(requests).toHaveLength(count);
    await module.dispose();
    expect(activate).toBeUndefined();
    expect(schedule).toBeUndefined();

    const stale = new Database(file);
    stale.exec("DROP TABLE preset");
    stale.close();
    await writeFile(join(root, "server.yaml"), "backend: remote\n");
    module = createModule({ signal: new AbortController().signal, memeRuntime: runtime });
    delete Bun.env.LOTUS_MEME_SERVER_URL;
    activate!();
    const deadline = performance.now() + 1_000;
    while (!resolveMemeTrigger("#心奈说") && performance.now() < deadline) await Bun.sleep(10);
    expect(resolveMemeTrigger("#心奈说")).toMatchObject({ key: "ba_say" });
    expect(registered).toHaveLength(1);
    expect(requests).toHaveLength(count);
  } finally {
    await module?.dispose();
    for (const [index, name] of env.entries()) {
      const value = previous[index];
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await fixture.stop(true);
    await rm(root, { recursive: true, force: true });
  }
});
