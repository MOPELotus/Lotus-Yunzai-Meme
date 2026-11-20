import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogVersion } from "../catalog-file.ts";
import { readMemeUsage, recordMemeUsage } from "../usage.ts";

test("读取旧版同库统计并独立增加新计数，开关和目录更新不受影响", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-usage-"));
  const path = join(root, "data.db");
  const setting = join(root, "stat.yaml");
  const previous = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const catalog = new Database(path);
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = root;
    catalog.exec(`CREATE TABLE stat (key VARCHAR(255) NOT NULL PRIMARY KEY, "all" INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)`);
    catalog.run("INSERT INTO stat VALUES ('existing', 9, '2025-03-01', '2025-03-01'), ('removed', 12, '2025-03-01', '2025-03-01')");
    const before = await readFile(path);
    const version = catalogVersion(path);
    expect([...readMemeUsage(catalog, path)]).toEqual([["existing", 9], ["removed", 12]]);
    await writeFile(setting, "enable: false\n");
    recordMemeUsage("existing", path);
    expect(await Bun.file(`${path}.usage.sqlite`).exists()).toBe(false);

    await writeFile(setting, "enable: true\n");
    recordMemeUsage("existing", path);
    recordMemeUsage("existing", path);
    recordMemeUsage("new", path);
    expect([...readMemeUsage(catalog, path)]).toEqual([["existing", 11], ["removed", 12], ["new", 1]]);
    expect(catalogVersion(path)).toBe(version);
    expect(await readFile(path)).toEqual(before);

    await writeFile(setting, "enable: false\n");
    recordMemeUsage("new", path);
    expect(readMemeUsage(catalog, path).get("new")).toBe(1);
  } finally {
    catalog.close();
    if (previous === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
