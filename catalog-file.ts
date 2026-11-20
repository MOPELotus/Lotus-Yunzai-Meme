import { realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const defaultPath = fileURLToPath(new URL("../../data/meme/data.db", import.meta.url));

export function catalogPath(): string {
  return Bun.env.LOTUS_MEME_DB || defaultPath;
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
  return JSON.stringify([path, database, ...files]);
}
