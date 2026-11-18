import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDirectory = fileURLToPath(new URL("../../data/meme/config/", import.meta.url));

function readConfig(directory: string, filename: string): Record<string, unknown> {
  let source: string;
  try {
    source = readFileSync(join(directory, filename), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const yaml: unknown = Bun.YAML.parse(source);
  if (yaml === undefined || yaml === null) return {};
  if (typeof yaml !== "object" || Array.isArray(yaml)) throw new Error("无效的表情配置");
  return yaml as Record<string, unknown>;
}

function flag(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("无效的表情配置开关");
  return value;
}

function list(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("无效的表情名单");
  return value.map((item: unknown) => {
    if (typeof item !== "string" && !Number.isSafeInteger(item)) throw new Error("无效的表情名单项");
    return String(item).trim();
  }).filter(Boolean);
}

export function catalogPolicy(userId: number | undefined) {
  const directory = Bun.env.LOTUS_MEME_CONFIG_DIR;
  if (directory !== undefined && !statSync(directory).isDirectory()) throw new Error("无效的表情配置目录");

  const meme = readConfig(directory ?? defaultDirectory, "meme.yaml");
  const access = readConfig(directory ?? defaultDirectory, "access.yaml");
  const enabled = flag(meme.enable, true);
  let allowed = true;
  if (flag(access.enable, false)) {
    const mode = access.mode ?? 0;
    if (mode !== 0 && mode !== 1) throw new Error("无效的表情名单模式");
    const users = list(mode === 0 ? access.userWhiteList : access.userBlackList);
    allowed = userId !== undefined && users.includes(String(userId)) === (mode === 0);
  }
  const hidden = flag(access.blackListEnable, false) ? list(access.blackList) : [];
  return { enabled, allowed, hidden };
}
