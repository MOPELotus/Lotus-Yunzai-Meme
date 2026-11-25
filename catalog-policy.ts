import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDirectory = fileURLToPath(new URL("../../data/meme/config/", import.meta.url));

export function readConfig(directory: string, filename: string): Record<string, unknown> {
  let source: string;
  try {
    source = readFileSync(join(directory, filename), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const yaml: unknown = Bun.YAML.parse(source);
  if (yaml === undefined || yaml === null) return {};
  if (typeof yaml !== "object" || Array.isArray(yaml)) throw new Error($t("catalog-policy.text_324980952c"));
  return yaml as Record<string, unknown>;
}

function flag(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error($t("catalog-policy.text_0e28992659"));
  return value;
}

function list(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error($t("catalog-policy.text_ad984b0b7e"));
  return value.map((item: unknown) => {
    if (typeof item !== "string" && !Number.isSafeInteger(item)) throw new Error($t("catalog-policy.text_7c0d04092f"));
    return String(item).trim();
  }).filter(Boolean);
}

export function configDirectory(): string {
  const directory = Bun.env.LOTUS_MEME_CONFIG_DIR;
  if (directory !== undefined && !statSync(directory).isDirectory()) throw new Error($t("catalog-policy.text_c12bf1714f"));
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
    if (mode !== 0 && mode !== 1) throw new Error($t("catalog-policy.text_6d1e2d2ab0"));
    const users = list(mode === 0 ? access.userWhiteList : access.userBlackList);
    allowed = userId !== undefined && users.includes(String(userId)) === (mode === 0);
  }
  const hidden = flag(access.blackListEnable, false) ? list(access.blackList) : [];
  return { enabled, allowed, hidden, forceSharp: forGeneration && flag(meme.forceSharp, false) };
}

export const defaultAvatarCache = true;
export const defaultManagedMemeTimeout = 30;

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
    avatarCache: flag(meme.cache, defaultAvatarCache),
    master,
    protectedUsers: users ? list(userList) : [],
    protectedTemplates: protection ? list(protect.list) : [],
  };
}

export function memeUsageEnabled() {
  return flag(readConfig(configDirectory(), "stat.yaml").enable, true);
}


export function safeCatalogKey(value: unknown): value is string {
  return typeof value === "string" && value !== "." && value !== ".." && /^[^/\\\s\x00-\x1f]{1,255}$/u.test(value);
}

export interface LocalMemeProvider {
  readonly timeout: number;
  readonly catalogIdentity: string;
  keys(signal?: AbortSignal): Promise<readonly string[]>;
  info(key: string, signal?: AbortSignal): Promise<unknown>;
  generate(key: string, body: FormData, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer> | undefined>;
  preview(key: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer> | undefined>;
}

let localRenderer: Omit<LocalMemeProvider, "timeout"> | undefined;

export function publishMemeProvider(provider: NonNullable<typeof localRenderer>) {
  localRenderer = provider;
  return () => {
    if (localRenderer === provider) localRenderer = undefined;
  };
}

export function memeProvider(): LocalMemeProvider | undefined {
  if (!localRenderer) return;
  const timeout = readConfig(configDirectory(), "server.yaml").managedTimeout ?? defaultManagedMemeTimeout;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0 || timeout > 120) {
    throw new Error($t("catalog-policy.text_e81d26dcff"));
  }
  return { ...localRenderer, timeout: Math.ceil(timeout * 1_000) };
}

export function sameMemeProvider(
  first: LocalMemeProvider | undefined,
  second: LocalMemeProvider | undefined,
): boolean {
  return first?.generate === second?.generate;
}
