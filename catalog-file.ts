import { Database } from "bun:sqlite";
import { realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generationServer } from "./catalog-policy.ts";

const defaultPath = fileURLToPath(new URL("../../data/meme/data.db", import.meta.url));

export function catalogPath(): string {
  return Bun.env.LOTUS_MEME_DB || defaultPath;
}

export const nativeCatalogTable = "lotus_meme_native";
export type CatalogTable = "meme" | typeof nativeCatalogTable;

export function activeCatalogTable(): CatalogTable {
  try {
    if (generationServer()?.protocol === "native") return nativeCatalogTable;
  } catch {
    // The local legacy catalog can still be read after a bad service edit.
  }
  return "meme";
}

export function openMemeCatalogReader(path = catalogPath()) {
  const db = new Database(path, { readonly: true });
  try {
    if (activeCatalogTable() === nativeCatalogTable) {
      const nativeInstalled = db.query("SELECT 1 FROM main.sqlite_schema WHERE type = 'table' AND name = ?").get(nativeCatalogTable);
      // Scope the selected metadata to this reader. Presets and usage remain shared.
      db.exec(nativeInstalled
        ? `CREATE TEMP VIEW meme AS SELECT * FROM main.${nativeCatalogTable}`
        : "CREATE TEMP VIEW meme AS SELECT * FROM main.meme WHERE 0");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function catalogVersion(path = catalogPath()): string {
  let database = path;
  try {
    // SQLite attaches its WAL and rollback journal to the resolved database filename.
    database = realpathSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
  }
  const files = [database, `${database}-wal`, `${database}-journal`].map((file) => {
    const stat = statSync(file, { bigint: true, throwIfNoEntry: false });
    return stat ? [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":") : "";
  });
  return JSON.stringify([path, database, activeCatalogTable(), ...files]);
}
