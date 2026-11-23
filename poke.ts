import { catalogPath, catalogVersion } from "./catalog-file.ts";
import { catalogPolicy, generationServer, maxPokeCooldown, pokeSettings } from "./catalog-policy.ts";
import { fetchAvatar, recordGeneratedMeme, requestMemeImage } from "./generate-reply.ts";
import { buildGenerationBody } from "./generation.ts";

export interface MemePokeContext {
  readonly backend: "onebot" | "milky";
  readonly botId: number;
  readonly groupId?: number;
  readonly actorId: number;
  readonly targetId: number;
  readonly signal: AbortSignal;
  readonly allowed: () => boolean;
  readonly isBotMaster: (id: number) => boolean;
  readonly reply: (body: string | readonly [string, { readonly type: "image"; readonly file: Uint8Array }]) =>
    boolean | Promise<boolean>;
}

export interface PokeTemplate {
  readonly key: string;
  readonly aliases: readonly string[];
  readonly params: string;
}

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
const selectFailure = "未找到仅需一张头像的表情。";
const renderFailure = "戳一戳表情生成失败，请稍后再试。";

export function createMemePokeHandler(
  lifecycle: AbortSignal,
  selectTemplates: (hidden: readonly string[]) => PokeTemplate[] | string,
) {
  const recent = new Map<string, number>();
  const running = new Set<string>();
  let nextCleanup = 0;

  return async function handlePoke(input: MemePokeContext) {
    const { actorId, botId, groupId, targetId } = input;
    if (!validId(actorId) || !validId(botId) || (groupId !== undefined && !validId(groupId)) ||
        targetId !== botId || actorId === botId) return;
    const signal = AbortSignal.any([lifecycle, input.signal]);
    const key = `${input.backend}:${botId}:${groupId ?? "private"}:${actorId}`;
    if (running.has(key)) return;

    function checkPolicy(template?: PokeTemplate) {
      if (signal.aborted) return;
      try {
        if (!input.allowed()) return;
        const settings = pokeSettings();
        if (!settings.enabled) return;
        const policy = catalogPolicy(actorId);
        if (!policy.enabled || !policy.allowed) return;
        if (template && [template.key, ...template.aliases].some(name => policy.hidden.includes(name))) return;
        return { settings, hidden: policy.hidden };
      } catch {
        console.warn("[meme] 无法读取戳一戳表情配置。");
      }
    }

    const active = checkPolicy();
    if (!active || Math.floor(Math.random() * 100) + 1 > active.settings.probability) return;
    const now = performance.now();
    if (now >= nextCleanup) {
      for (const [scope, at] of recent) if (at <= now - maxPokeCooldown * 1_000) recent.delete(scope);
      nextCleanup = now + 60_000;
    }
    const last = recent.get(key);
    if (last !== undefined && now - last < active.settings.cooldown * 1_000) return;

    running.add(key);
    try {
      const server = generationServer();
      if (!server) return;
      const catalog = catalogPath();
      const version = catalogVersion();
      const templates = selectTemplates(active.hidden);
      if (typeof templates === "string" || !templates.length) {
        console.warn("[meme] 无法为戳一戳选择头像表情。");
        if (checkPolicy()?.settings.errorReply) await input.reply(selectFailure);
        return;
      }

      const avatar = await fetchAvatar(String(actorId), { signal, cache: active.settings.avatarCache });
      if (!checkPolicy()) return;
      if (avatar) for (const template of templates) {
        if (!checkPolicy(template) || catalogVersion() !== version) return;
        const prepared = await buildGenerationBody(template.key, template.aliases, "", template.params, {
          user_id: actorId, isMaster: input.isBotMaster(actorId), avatar: async () => avatar,
        });
        if (typeof prepared === "string" || prepared.body.getAll("images").length !== 1 || prepared.body.has("texts")) continue;
        if (!checkPolicy(template) || catalogVersion() !== version) return;
        const bytes = await requestMemeImage(prepared, server, signal).catch(() => undefined);
        if (!bytes) continue;
        if (!checkPolicy(template) || catalogVersion() !== version) return;
        const alias = template.aliases.map(word => `[${word}]`).join(" ") || "[无]";
        if (await input.reply([`随机表情哦~:\n这是指令哦~: ${alias}\n`, { type: "image", file: bytes }]) === true) {
          recent.set(key, performance.now());
          recordGeneratedMeme(template.key, catalog);
        } else if (!signal.aborted) {
          console.warn("[meme] 戳一戳表情发送未确认。");
        }
        return;
      }
      if (signal.aborted) return;
      console.warn("[meme] 戳一戳头像表情生成未完成。");
      if (checkPolicy()?.settings.errorReply) await input.reply(renderFailure);
    } catch {
      if (!signal.aborted) console.warn("[meme] 戳一戳表情处理失败。");
    } finally {
      running.delete(key);
    }
  };
}
