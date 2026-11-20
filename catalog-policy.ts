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

export function configDirectory(): string {
  const directory = Bun.env.LOTUS_MEME_CONFIG_DIR;
  if (directory !== undefined && !statSync(directory).isDirectory()) throw new Error("无效的表情配置目录");
  return directory ?? defaultDirectory;
}

export function catalogPolicy(userId: number | undefined, forGeneration = false) {
  const directory = configDirectory();
  const meme = readConfig(directory, "meme.yaml");
  const access = readConfig(directory, "access.yaml");
  const enabled = flag(meme.enable, true);
  let allowed = true;
  if (flag(access.enable, false)) {
    const mode = access.mode ?? 0;
    if (mode !== 0 && mode !== 1) throw new Error("无效的表情名单模式");
    const users = list(mode === 0 ? access.userWhiteList : access.userBlackList);
    allowed = userId !== undefined && users.includes(String(userId)) === (mode === 0);
  }
  const hidden = flag(access.blackListEnable, false) ? list(access.blackList) : [];
  return { enabled, allowed, hidden, forceSharp: forGeneration && flag(meme.forceSharp, false) };
}


export function generationSettings() {
  const directory = configDirectory();
  const meme = readConfig(directory, "meme.yaml");
  const protect = readConfig(directory, "protect.yaml");
  const protection = flag(protect.enable, false);
  const master = protection && flag(protect.master, false);
  const users = protection && !master && flag(protect.userEnable, false);
  const userList = typeof protect.user === "string" || typeof protect.user === "number"
    ? [protect.user] : protect.user;
  return {
    imagesInMessage: flag(meme.imagesInMessage, true),
    quotedImages: flag(meme.quotedImages, true),
    useNickname: flag(meme.userName, false),
    quote: flag(meme.reply, false),
    errorReply: flag(meme.errorReply, true),
    master,
    protectedUsers: users ? list(userList) : [],
    protectedTemplates: protection ? list(protect.list) : [],
  };
}


export function generationServer() {
  const settings = readConfig(configDirectory(), "server.yaml");
  const value = Bun.env.LOTUS_MEME_SERVER_URL ?? settings.url;
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string") throw new Error("无效的表情服务地址");
  const base = new URL(value);
  if ((base.protocol !== "https:" && base.protocol !== "http:") ||
      base.username || base.password || base.search || base.hash) throw new Error("无效的表情服务地址");
  const timeout = settings.timeout ?? 5;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0 || timeout > 120) {
    throw new Error("无效的表情服务请求超时");
  }
  return { base, timeout: Math.ceil(timeout * 1_000) };
}

export function catalogRefreshSchedule(): string | undefined {
  const settings = readConfig(configDirectory(), "other.yaml");
  if (!flag(settings.autoUpdateRes, true)) return;
  const cron = settings.autoUpdateResCron ?? "0 0 2 * * ?";
  if (typeof cron !== "string") throw new Error("无效的表情目录更新时间");
  const fields = cron.trim().split(/\s+/u);
  if (fields.length === 5) fields.unshift("0");
  if (fields.length !== 6) throw new Error("无效的表情目录更新时间");
  for (const index of [3, 5]) if (fields[index] === "?") fields[index] = "*";
  return fields.join(" ");
}
