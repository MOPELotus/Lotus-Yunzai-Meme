import { createHash } from "node:crypto";
import { MemeTemplateFeedback } from "./builtin-template.ts";
import { configDirectory, readConfig } from "./catalog-policy.ts";

export const memeTranslationFile = "translation.yaml";
export const baiduTranslationAppId = "baidu_trans_appid";
export const baiduTranslationSecret = "baidu_trans_apikey";
const service = "https://fanyi-api.baidu.com/api/trans/vip/translate";
const maxTranslationBytes = 32 * 1024;

export function validTranslationSetting(value: unknown, secret: boolean) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (!text || (secret ? /^[\x21-\x7e]{1,256}$/u.test(text) : /^\d{1,32}$/u.test(text))) return text;
}

async function translationResult(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxTranslationBytes) {
    void response.body?.cancel().catch(() => {});
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";
  try {
    for (;;) {
      signal.throwIfAborted();
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxTranslationBytes) return;
      json += decoder.decode(item.value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const payload = JSON.parse(json + decoder.decode()) as { error_code?: unknown; trans_result?: unknown } | null;
  if (payload?.error_code !== undefined || !Array.isArray(payload?.trans_result)) return;
  const text: unknown = payload.trans_result[0]?.dst;
  if (typeof text === "string" && text.trim() && text.length <= 8192) return text;
}

/** The original template uses Baidu's General Text Translation API for its optional Japanese caption. */
export async function translateMemeToJapanese(text: string, caller: AbortSignal) {
  caller.throwIfAborted();
  let settings: Record<string, unknown>;
  try { settings = readConfig(configDirectory(), memeTranslationFile); }
  catch { throw new MemeTemplateFeedback("无法读取百度翻译配置，请联系机器人主人。也可直接提供第二段文案。"); }
  const appid = validTranslationSetting(settings[baiduTranslationAppId], false);
  const secret = validTranslationSetting(settings[baiduTranslationSecret], true);
  if (!appid || !secret) {
    throw new MemeTemplateFeedback('"baidu_trans_appid" 或 "baidu_trans_apikey" 未设置，请检查表情合成的百度翻译配置，或直接提供第二段文案。');
  }

  const salt = String(Date.now());
  const sign = createHash("md5").update(appid + text + salt + secret, "utf8").digest("hex");
  const endpoint = new URL(service);
  endpoint.search = new URLSearchParams({ q: text, from: "auto", to: "jp", appid, salt, sign }).toString();
  const signal = AbortSignal.any([caller, AbortSignal.timeout(5000)]);
  try {
    const response = await fetch(endpoint, { method: "GET", redirect: "error", signal });
    const translation = await translationResult(response, signal);
    signal.throwIfAborted();
    if (translation !== undefined) return translation;
  } catch { caller.throwIfAborted(); }
  throw new MemeTemplateFeedback("百度翻译暂不可用，请稍后再试或直接提供第二段文案。");
}
