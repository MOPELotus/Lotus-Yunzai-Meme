import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const defaultPath = fileURLToPath(new URL("../../data/meme/data.db", import.meta.url));

export function catalogPath(): string {
  return Bun.env.LOTUS_MEME_DB || defaultPath;
}

export function catalogVersion(path = catalogPath()): string {
  const files = [path, `${path}-wal`, `${path}-journal`].map((file) => {
    const stat = statSync(file, { bigint: true, throwIfNoEntry: false });
    return stat ? [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":") : "";
  });
  return JSON.stringify([path, ...files]);
}
