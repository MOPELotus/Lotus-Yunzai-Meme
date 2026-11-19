import { generationServer, generationSettings } from "./catalog-policy.ts";
import type { GenerationInput } from "./generation.ts";

type InboundSegment = Readonly<Record<string, unknown>> & { readonly type: string };
type Image = { readonly type: "image"; readonly file: Uint8Array };
type PreparedRequest = { readonly key: string; readonly body: FormData; readonly quote: boolean };

export interface FallbackContext {
  readonly message_type: "terminal" | "group" | "private";
  readonly user_id?: number;
  readonly isMaster: boolean;
  readonly isBotMaster: (userId: number) => boolean;
  readonly message?: string | readonly InboundSegment[];
  readonly reply_id?: number | string;
  readonly lookupReply?: () => Promise<{ user_id: number; message: readonly InboundSegment[] } | undefined>;
  readonly sender?: Readonly<Record<string, unknown>>;
}

const maxImageBytes = 8 * 1024 * 1024;

function imageMime(bytes: Uint8Array): string | undefined {
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

async function fetchAvatar(user: string): Promise<Blob | undefined> {
  if (!/^[1-9]\d{0,15}$/u.test(user) || !Number.isSafeInteger(Number(user))) return;
  const url = new URL("https://q1.qlogo.cn/g");
  url.search = new URLSearchParams({ b: "qq", s: "0", nk: user }).toString();
  try {
    const bytes = await readResult(await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    }), 512 * 1024);
    if (bytes) return new Blob([bytes], { type: imageMime(bytes) });
  } catch {
    // The legacy image planner can use the remaining materials if one avatar fails.
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
  server: NonNullable<ReturnType<typeof generationServer>>,
): Promise<Image | { type: "quoted"; message: Image } | string | undefined> {
  const userId = context.user_id;
  if (userId === undefined) return;

  let errorReply = true;
  try {
    const settings = generationSettings();
    errorReply = settings.errorReply;
    const mediaBudget = AbortSignal.timeout(8_000);
    let quoted: GenerationInput["quoted"];
    if (settings.quotedImages && context.reply_id !== undefined) {
      const source = await context.lookupReply?.();
      if (!source) return errorReply ? "当前无法读取引用消息中的表情素材。" : undefined;
      const images = await imagesIn(source.message, mediaBudget);
      if (!images) return errorReply ? "当前无法读取引用消息中的表情图片。" : undefined;
      quoted = { userId: source.user_id, images };
    }

    const segments: readonly InboundSegment[] = Array.isArray(context.message) ? context.message : [];
    const images = settings.imagesInMessage ? await imagesIn(segments, mediaBudget) : [];
    if (!images) return errorReply ? "当前无法读取该表情图片素材。" : undefined;
    const mentions = segments.flatMap((part) =>
      part.type === "at" && (typeof part.qq === "number" || typeof part.qq === "string") ? [part.qq] : []);
    const avatars = new Map<string, Promise<Blob | undefined>>();
    const prepared = await prepare({
      user_id: userId,
      isMaster: context.isMaster,
      mentions,
      images,
      hasMessageImage: segments.some((part) => part.type === "image"),
      quoted,
      avatar: (user) => {
        const cached = avatars.get(user);
        if (cached) return cached;
        const pending = fetchAvatar(user);
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
    if (!prepared || typeof prepared === "string") return errorReply ? prepared : undefined;

    if (prepared.key === "." || prepared.key === "..") return;
    const endpoint = new URL(server.base);
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, "")}/memes/${encodeURIComponent(prepared.key)}/`;
    const result = await fetch(endpoint, {
      method: "POST",
      body: prepared.body,
      redirect: "error",
      signal: AbortSignal.timeout(server.timeout),
    });
    const bytes = await readResult(result);
    if (bytes) {
      const message: Image = { type: "image", file: bytes };
      return prepared.quote ? { type: "quoted", message } : message;
    }
  } catch {
    // Backend and media errors can contain connection details. Keep the reply local.
  }
  return errorReply ? "表情生成失败，请稍后再试。" : undefined;
}
