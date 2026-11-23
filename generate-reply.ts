import { MemeTemplateFeedback } from "./builtin-template.ts";
import { catalogPath } from "./catalog-file.ts";
import { isExcludedMemeCatalogKey } from "./catalog-exclusions.ts";
import { type generationServer, generationSettings, safeCatalogKey } from "./catalog-policy.ts";
import type { GenerationInput } from "./generation.ts";
import { recordMemeUsage } from "./usage.ts";

type InboundSegment = Readonly<Record<string, unknown>> & { readonly type: string };
type Image = { readonly type: "image"; readonly file: Uint8Array };
type GenerationMessage = Image | readonly [string, Image];
type Server = NonNullable<ReturnType<typeof generationServer>>;
type PreparedRequest = {
  readonly key: string;
  readonly body: FormData;
  readonly quote: boolean;
  readonly summary?: string;
};

export interface FallbackContext {
  readonly message_type: "terminal" | "group" | "private";
  readonly user_id?: number;
  readonly inlineImageByteLimit?: number;
  readonly isMaster: boolean;
  readonly isDelegated?: boolean;
  readonly isBotMaster: (userId: number) => boolean;
  readonly message?: string | readonly InboundSegment[];
  readonly reply_id?: number | string;
  readonly lookupReply?: () => Promise<{ user_id: number; message: readonly InboundSegment[] } | undefined>;
  readonly sender?: Readonly<Record<string, unknown>>;
}

const maxImageBytes = 8 * 1024 * 1024;
export const maxAvatarBytes = 512 * 1024;
const maxCachedAvatars = 32;
const cachedAvatars = new Map<string, { avatar: Blob; modified: number }>();

export function imageMime(bytes: Uint8Array): string | undefined {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  if (bytes.length >= 8 && startsWith(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (bytes.length >= 3 && startsWith(255, 216, 255)) return "image/jpeg";
  if (bytes.length >= 6 && startsWith(71, 73, 70, 56) &&
      (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return "image/gif";
  if (bytes.length >= 12 && startsWith(82, 73, 70, 70) &&
      bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
}

function embeddedImage(segment: InboundSegment): Blob | undefined {
  const value = segment.file ?? segment.url;
  let bytes: Uint8Array<ArrayBuffer>;
  if (value instanceof Uint8Array && value.byteLength <= maxImageBytes) {
    bytes = new Uint8Array(value);
  } else if (typeof value === "string") {
    const match = /^(?:base64:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)([A-Za-z0-9+/]+={0,2})$/u.exec(value);
    const encoded = match?.[1];
    if (!encoded || encoded.length > Math.ceil(maxImageBytes / 3) * 4 ||
        encoded.length % 4 !== 0) return;
    bytes = Uint8Array.fromBase64(encoded);
  } else return;
  const type = imageMime(bytes);
  if (type && bytes.byteLength <= maxImageBytes) return new Blob([bytes], { type });
}

async function readResult(response: Response, maxBytes = maxImageBytes): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    return;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.byteLength > maxBytes) {
        await reader.cancel();
        return;
      }
      chunks.push(chunk.value);
      length += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const image = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    image.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (imageMime(image)) return image;
}

function requestSignal(timeout: number, signal?: AbortSignal) {
  const expires = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, expires]) : expires;
}

function nativeImage(bytes: Uint8Array<ArrayBuffer> | undefined, key: string, signal: AbortSignal) {
  if (!signal.aborted && !isExcludedMemeCatalogKey(key) && bytes instanceof Uint8Array &&
      bytes.byteLength <= maxImageBytes && imageMime(bytes)) return bytes;
}

export async function fetchAvatar(user: string, { size = 0, signal, cache = false }:
  { size?: 0 | 100; signal?: AbortSignal; cache?: boolean } = {}): Promise<Blob | undefined> {
  if (signal?.aborted || !/^[1-9]\d{0,15}$/u.test(user) || !Number.isSafeInteger(Number(user))) return;
  const url = new URL("https://q1.qlogo.cn/g");
  url.search = new URLSearchParams({ b: "qq", s: String(size), nk: user }).toString();
  const key = `${user}:${size}`;
  const cached = cache ? cachedAvatars.get(key) : undefined;
  try {
    const timeout = AbortSignal.timeout(3_000);
    const active = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(url, {
      redirect: "error", signal: active, credentials: "omit",
      ...(cached && { headers: { "If-Modified-Since": new Date(cached.modified).toUTCString() } }),
    });
    const bytes = response.status === 304 && cached ? undefined : await readResult(response, maxAvatarBytes);
    if (active.aborted) return;
    const avatar = bytes ? new Blob([bytes], { type: imageMime(bytes) }) : response.status === 304 ? cached?.avatar : undefined;
    const modified = response.status === 304 ? cached?.modified : Date.parse(response.headers.get("last-modified") ?? "");
    if (cache && avatar && modified !== undefined && Number.isFinite(modified) && modified >= (cachedAvatars.get(key)?.modified ?? -Infinity)) {
      cachedAvatars.delete(key);
      if (cachedAvatars.size >= maxCachedAvatars) {
        const oldest = cachedAvatars.keys().next().value;
        if (oldest !== undefined) cachedAvatars.delete(oldest);
      }
      cachedAvatars.set(key, { avatar, modified });
    }
    return avatar;
  } catch {
    // The legacy image planner can use the remaining materials if one avatar fails.
  }
}

export async function requestMemeImage(
  { key, body }: Pick<PreparedRequest, "key" | "body">,
  server: Server,
  signal?: AbortSignal,
) {
  if (!safeCatalogKey(key) || isExcludedMemeCatalogKey(key) || signal?.aborted) return;
  const active = requestSignal(server.timeout, signal);
  if (server.protocol === "native") return nativeImage(await server.generate(key, body, active), key, active);
  const endpoint = new URL(server.base);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, "")}/memes/${encodeURIComponent(key)}/`;
  return readResult(await fetch(endpoint, {
    method: "POST", body, redirect: "error", signal: active,
  }));
}

export async function requestMemePreview(
  key: string, server: Server, signal?: AbortSignal,
) {
  if (!safeCatalogKey(key) || isExcludedMemeCatalogKey(key) || signal?.aborted) return;
  try {
    const active = requestSignal(server.timeout, signal);
    if (server.protocol === "native") return nativeImage(await server.preview(key, active), key, active);
    const endpoint = new URL(server.base);
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, "")}/memes/${encodeURIComponent(key)}/preview`;
    const bytes = await readResult(await fetch(endpoint, {
      redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
      signal: active,
    }));
    if (!signal?.aborted) return bytes;
  } catch {
    // The local metadata is still available when the preview service cannot reply.
  }
}

export function recordGeneratedMeme(key: string, catalog: string) {
  try {
    recordMemeUsage(key, catalog);
  } catch {
    console.warn("[meme] 无法记录表情调用次数。");
  }
}

function qqImageUrl(value: unknown): URL | undefined {
  if (typeof value !== "string" || value.length > 4096 || /[\\\s]/u.test(value)) return;
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return;
  const { hostname, pathname } = url;
  if ((hostname === "multimedia.nt.qq.com.cn" && pathname === "/download") ||
      (hostname === "gchat.qpic.cn" && (pathname === "/download" || pathname.startsWith("/gchatpic_new/"))) ||
      (hostname === "c2cpicdw.qpic.cn" && pathname.startsWith("/offpic_new/"))) return url;
}

async function downloadImage(part: InboundSegment, signal: AbortSignal): Promise<Blob | undefined> {
  const inline = embeddedImage(part);
  if (inline) return inline;
  const direct = qqImageUrl(part.url) ?? qqImageUrl(part.file);
  const url = direct ?? (typeof part.getDownloadUrl === "function" && !signal.aborted
    ? qqImageUrl(await part.getDownloadUrl()) : undefined);
  if (!url || signal.aborted) return;
  const bytes = await readResult(await fetch(url, { redirect: "error", signal }));
  if (bytes) return new Blob([bytes], { type: imageMime(bytes) });
}

async function imagesIn(segments: readonly InboundSegment[], signal: AbortSignal): Promise<Blob[] | undefined> {
  const images: Blob[] = [];
  for (const part of segments) {
    if (part.type !== "image") continue;
    const image = await downloadImage(part, signal).catch(() => undefined);
    if (!image) return;
    images.push(image);
  }
  return images;
}

export async function generateMemeReply(
  context: FallbackContext,
  prepare: (input: GenerationInput) => Promise<PreparedRequest | string | undefined>,
  server: Server,
  signal?: AbortSignal,
): Promise<GenerationMessage | { type: "quoted"; message: GenerationMessage } | string | undefined> {
  const userId = context.user_id;
  if (userId === undefined || signal?.aborted) return;

  let errorReply = true;
  try {
    const settings = generationSettings();
    errorReply = settings.errorReply;
    const timeout = AbortSignal.timeout(8_000);
    const mediaBudget = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let quoted: GenerationInput["quoted"];
    if (settings.quotedImages && context.reply_id !== undefined) {
      const source = await context.lookupReply?.();
      if (signal?.aborted) return;
      if (!source) return errorReply ? "当前无法读取引用消息中的表情素材。" : undefined;
      const images = await imagesIn(source.message, mediaBudget);
      if (signal?.aborted) return;
      if (!images) return errorReply ? "当前无法读取引用消息中的表情图片。" : undefined;
      quoted = { userId: source.user_id, images };
    }

    const segments: readonly InboundSegment[] = Array.isArray(context.message) ? context.message : [];
    const images = settings.imagesInMessage ? await imagesIn(segments, mediaBudget) : [];
    if (signal?.aborted) return;
    if (!images) return errorReply ? "当前无法读取该表情图片素材。" : undefined;
    const mentions = segments.flatMap((part) =>
      part.type === "at" && (typeof part.qq === "number" || typeof part.qq === "string") ? [part.qq] : []);
    const avatars = new Map<string, Promise<Blob | undefined>>();
    const prepared = await prepare({
      user_id: userId,
      isMaster: context.isDelegated !== true && (context.isMaster || context.isBotMaster(userId)),
      mentions,
      images,
      hasMessageImage: segments.some((part) => part.type === "image"),
      quoted,
      avatar: (user) => {
        const cached = avatars.get(user);
        if (cached) return cached;
        const pending = fetchAvatar(user, { signal: mediaBudget, cache: settings.avatarCache });
        avatars.set(user, pending);
        return pending;
      },
      isTargetMaster: (id) => Number.isSafeInteger(Number(id)) && context.isBotMaster(Number(id)),
      gender: async (id) => {
        if (id !== String(userId)) return;
        const gender = context.sender?.sex;
        if (gender === "male" || gender === "female") return gender;
      },
      nickname: async (id) => {
        if (id !== String(userId)) return;
        const name = context.sender?.card || context.sender?.nickname;
        return typeof name === "string" ? name : undefined;
      },
    });
    if (signal?.aborted) return;
    if (!prepared || typeof prepared === "string") return errorReply ? prepared : undefined;

    if (isExcludedMemeCatalogKey(prepared.key)) return;
    const catalog = catalogPath();
    const bytes = await requestMemeImage(prepared, server, signal);
    if (bytes && !signal?.aborted) {
      recordGeneratedMeme(prepared.key, catalog);
      const image: Image = { type: "image", file: bytes };
      const message: GenerationMessage = prepared.summary ? [prepared.summary, image] : image;
      return prepared.quote ? { type: "quoted", message } : message;
    }
  } catch (error) {
    if (error instanceof MemeTemplateFeedback && errorReply && !signal?.aborted) return error.message;
  }
  return errorReply && !signal?.aborted ? "表情生成失败，请稍后再试。" : undefined;
}
