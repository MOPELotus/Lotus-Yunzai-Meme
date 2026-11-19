import { generationSettings } from "./catalog-policy.ts";
import { parseGenerationArgs } from "./generation-args.ts";

export interface GenerationInput {
  readonly user_id: number;
  readonly isMaster: boolean;
  readonly mentions?: readonly (number | string)[];
  readonly images?: readonly Blob[];
  readonly hasMessageImage?: boolean;
  readonly quoted?: { readonly userId: number; readonly images?: readonly Blob[] };
  readonly avatar?: (user: string) => Promise<Blob | undefined>;
  readonly nickname?: (user: string) => Promise<string | undefined>;
  readonly gender?: (user: string) => Promise<"male" | "female" | "unknown" | undefined>;
  readonly isTargetMaster?: (user: string) => boolean;
}

function paramsOf(serialized: string | undefined) {
  if (!serialized) throw new Error();
  const params: unknown = JSON.parse(serialized);
  if (typeof params !== "object" || params === null || Array.isArray(params)) throw new Error();
  const row = params as Record<string, unknown>;
  const { min_images, max_images, min_texts, max_texts, args_type } = row;
  if (typeof min_images !== "number" || typeof max_images !== "number" ||
      typeof min_texts !== "number" || typeof max_texts !== "number" ||
      ![min_images, max_images, min_texts, max_texts].every(Number.isSafeInteger) ||
      min_images < 0 || min_texts < 0 || max_images < min_images || max_texts < min_texts) throw new Error();
  const defaults: unknown = row.default_texts;
  const texts = Array.isArray(defaults) ? defaults.filter((item) => typeof item === "string") : [];
  return { min_images, max_images, min_texts, max_texts, args_type, texts };
}

async function assembleImages(
  key: string,
  aliases: readonly string[],
  users: readonly string[],
  min: number,
  max: number,
  input: GenerationInput,
  settings: ReturnType<typeof generationSettings>,
): Promise<Blob[] | string> {
  const ownImages = input.images ?? [];
  const quotedImages = settings.quotedImages && input.quoted ? [...(input.quoted.images ?? [])] : [];
  if (settings.quotedImages && input.quoted && quotedImages.length === 0 && !input.hasMessageImage && ownImages.length === 0) {
    const fallback = await input.avatar?.(String(input.quoted.userId));
    if (fallback) quotedImages.push(fallback);
  }
  const messageImages = settings.imagesInMessage ? [...quotedImages, ...ownImages] : quotedImages;
  const avatars = (await Promise.all(users.map((user) => input.avatar?.(user))))
    .filter((value): value is Blob => value !== undefined);
  if ((min === 1 && messageImages.length === 0) || avatars.length + messageImages.length < min) {
    const fallback = await input.avatar?.(String(input.user_id));
    if (fallback) {
      if (min === 1 && messageImages.length === 0) avatars.push(fallback);
      else avatars.unshift(fallback);
    }
  }

  const target = users[users.length === 1 ? 0 : 1];
  const protectedTemplate = settings.protectedTemplates.some((entry) => entry === key || aliases.includes(entry));
  if (target && protectedTemplate) {
    if (settings.master && !input.isMaster && !input.isTargetMaster) {
      return "表情保护需要宿主确认目标的主人身份。";
    }
    if (settings.master ? !input.isMaster && input.isTargetMaster?.(target) : settings.protectedUsers.includes(target)) {
      avatars.reverse();
    }
  }

  return [...avatars, ...messageImages].slice(0, max);
}

export async function buildGenerationBody(
  key: string,
  aliases: readonly string[],
  text: string,
  serialized: string | undefined,
  input: GenerationInput,
) {
  let settings: ReturnType<typeof generationSettings>;
  let params: ReturnType<typeof paramsOf>;
  try {
    settings = generationSettings();
    params = paramsOf(serialized);
  } catch {
    return "无法读取表情生成配置或参数。";
  }
  const typedMentions = [...text.matchAll(/@\s*(\d+)/gu)].map((match) => match[1]!);
  const users = [...new Set([...(input.mentions ?? []).map(String), ...typedMentions])]
    .filter((id) => /^\d+$/u.test(id) && id !== String(input.quoted?.userId));
  const message = text.replace(/@\s*\d+/gu, "").trim();
  const parsed = params.args_type == null ? undefined : parseGenerationArgs(params.args_type, message);
  if (parsed?.issue) return parsed.issue;
  const caption = parsed?.text ?? message;
  const texts = caption ? caption.split("/").map((part) => part.trim()).slice(0, params.max_texts) : [];
  try {
    const body = new FormData();
    const firstUser = users[0] ?? String(input.user_id);
    let nickname: string | undefined;
    if (parsed) {
      nickname = await input.nickname?.(firstUser);
      const gender = await input.gender?.(firstUser) ?? "unknown";
      body.append("args", JSON.stringify({
        user_infos: [{ name: nickname || "未知", gender }],
        ...parsed.values,
      }));
    }
    if (params.max_images > 0) {
      const images = await assembleImages(key, aliases, users, params.min_images, params.max_images, input, settings);
      if (typeof images === "string") return images;
      if (images.length < params.min_images) return `该表情需要 ${params.min_images}–${params.max_images} 张图片。`;
      for (const [index, image] of images.entries()) body.append("images", image, `image${index}.png`);
    }

    if (params.max_texts > 0) {
      if (!texts.length && settings.useNickname) {
        texts.push(nickname || await input.nickname?.(firstUser) || "未知");
      }
      while (texts.length < params.min_texts && params.texts.length) {
        texts.push(params.texts[Math.floor(Math.random() * params.texts.length)]!);
      }
      if (texts.length < params.min_texts) return `该表情需要 ${params.min_texts}–${params.max_texts} 段文字。`;
      for (const part of texts) body.append("texts", part);
    }
    return { key, body, quote: settings.quote };
  } catch {
    return "无法取得表情生成所需的图片或昵称。";
  }
}
