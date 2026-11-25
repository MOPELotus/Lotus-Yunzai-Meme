import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { fileURLToPath } from "node:url";
import { readVerifiedFile } from "./backend-asset-io.ts";
import { excludedMemeTemplateMessage, isExcludedMemeTemplate } from "./template-policy.ts";

const bundledDirectory = new URL("./resources/builtin/", import.meta.url);
const digestPattern = /^[a-f0-9]{64}$/u;

function resourceParts(path: string) {
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\\:\x00-\x1f]/u.test(part))) {
    throw new Error($t("backend-builtin-assets.text_56c66fccc3"));
  }
  return parts;
}

function imageTemplate(parts: readonly string[]) {
  const [source, group, folder, template] = parts;
  if (source === "anyliew" && group === "emoji") return folder;
  if (source === "python" && group === "meme_generator" && folder === "memes") return template;
  return source;
}

async function bundledManifest(directory: URL) {
  const value: unknown = await Bun.file(new URL("manifest.json", directory)).json();
  if (typeof value !== "object" || value === null || !("format" in value) || value.format !== 1 ||
      !("files" in value) || typeof value.files !== "object" || value.files === null || Array.isArray(value.files)) {
    throw new Error($t("backend-builtin-assets.text_ba8486dbf1"));
  }
  const files = new Map<string, string>();
  for (const [path, digest] of Object.entries(value.files)) {
    const [kind, ...parts] = resourceParts(path);
    if ((kind !== "images" && kind !== "fonts") || !parts.length || typeof digest !== "string" ||
        !digestPattern.test(digest)) throw new Error($t("backend-builtin-assets.text_cc02a7daef"));
    if (kind !== "images" || !isExcludedMemeTemplate(imageTemplate(parts))) files.set(path, digest);
  }
  return files;
}

export function createBundledMemeResources(lifetime: AbortSignal, directory = bundledDirectory) {
  let manifest: Promise<Map<string, string>> | undefined;
  const pending = new Map<string, Promise<Buffer | undefined>>();

  async function asset(kind: "images" | "fonts", path: string) {
    lifetime.throwIfAborted();
    const parts = resourceParts(path);
    if (kind === "images" && isExcludedMemeTemplate(imageTemplate(parts))) throw new Error(excludedMemeTemplateMessage);
    manifest ??= bundledManifest(directory).catch(error => {
      manifest = undefined;
      throw error;
    });
    const name = `${kind}/${path}`;
    const digest = (await manifest).get(name);
    if (!digest) throw new Error($t("backend-builtin-assets.text_372d18c0e4", { "name": name }));
    lifetime.throwIfAborted();
    let request = pending.get(digest);
    if (!request) {
      const file = fileURLToPath(new URL(`${digest.slice(0, 2)}/${digest.slice(2)}`, directory));
      request = readVerifiedFile(file, digest).finally(() => pending.delete(digest));
      pending.set(digest, request);
    }
    const bytes = await request;
    lifetime.throwIfAborted();
    if (!bytes) throw new Error($t("backend-builtin-assets.text_a4d385351e", { "name": name }));
    return bytes;
  }

  return {
    imageAsset: (path: string) => asset("images", path),
    fontAsset: (path: string) => asset("fonts", path),
  };
}
