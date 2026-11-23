import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModule, resolveMemeTrigger } from "../lotus.ts";

test("模块就绪后安装本机目录，历史远端设置与旧定时器均不再执行", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-runtime-"));
  const file = join(root, "data.db");
  const env = ["LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_DB", "LOTUS_MEME_SERVER_URL"] as const;
  const previous = env.map(name => Bun.env[name]);
  const requests: string[] = [];
  const fixture = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    requests.push(new URL(request.url).pathname);
    return new Response(null, { status: 503 });
  } });
  let activate: (() => void) | undefined;
  let scheduled = 0;
  const runtime = {
    whenReady(start: () => void) { activate = start; return () => { activate = undefined; }; },
    registerTask() { scheduled++; return () => {}; },
  };
  let module: ReturnType<typeof createModule> | undefined;
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = root;
    Bun.env.LOTUS_MEME_DB = file;
    Bun.env.LOTUS_MEME_SERVER_URL = fixture.url.href;
    await writeFile(join(root, "server.yaml"), `backend: remote\nurl: ${fixture.url}\nmanagedTimeout: 30\n`);
    await writeFile(join(root, "other.yaml"), "autoUpdateRes: true\nautoUpdateResCron: '*/10 * * * * *'\n");
    module = createModule({ signal: new AbortController().signal, memeRuntime: runtime });
    expect(await Bun.file(file).exists()).toBe(false);
    activate!();
    const waitForTemplate = async () => {
      const deadline = performance.now() + 3_000;
      let resolved = resolveMemeTrigger("#心奈说");
      while ((!resolved || typeof resolved === "string") && performance.now() < deadline) {
        await Bun.sleep(10);
        resolved = resolveMemeTrigger("#心奈说");
      }
      expect(resolved).toMatchObject({ key: "ba_say" });
    };
    await waitForTemplate();
    expect(scheduled).toBe(0);
    expect(requests).toEqual([]);
    await module.dispose();
    expect(activate).toBeUndefined();

    const stale = new Database(file);
    try { stale.exec("DROP TABLE preset"); } finally { stale.close(); }
    await writeFile(join(root, "server.yaml"), "backend: unsupported-mode\nurl: invalid-value\n");
    module = createModule({ signal: new AbortController().signal, memeRuntime: runtime });
    activate!();
    await waitForTemplate();
    expect(scheduled).toBe(0);
    expect(requests).toEqual([]);
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
