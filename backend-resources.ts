import { join } from "node:path";
import { downloadVerifiedFile, readVerifiedFile, writeBackendFile } from "./backend-asset-io.ts";
import { extraMemeAssets } from "./backend-extra-assets.ts";
import { excludedMemeTemplateMessage, isExcludedMemeTemplate } from "./template-policy.ts";

const resourceVersion = "0.2.3";
const resourceSources = [
  `https://raw.githubusercontent.com/MemeCrafters/meme-generator-rs/v${resourceVersion}/resources/`,
  `https://cdn.jsdelivr.net/gh/MemeCrafters/meme-generator-rs@v${resourceVersion}/resources/`,
];
const manifestDigest = "68a03183b74fffdb82abe1f49f5a9bf1b0e009ff09944646dfcd35f79b7f5d71";

interface Resource {
  readonly file: string;
  readonly hash: string;
}

interface Manifest {
  readonly fonts: readonly Resource[];
  readonly images: readonly Resource[];
}

export function createMemeResources(directory: string, lifetime: AbortSignal) {
  let manifest: Promise<Map<string, string>> | undefined;
  const pending = new Map<string, Promise<Buffer>>();

  async function ensureFile(
    path: string, digest: string, remotePath = path, sources: readonly string[] = resourceSources,
  ) {
    const fullPath = join(directory, path);
    const cached = await readVerifiedFile(fullPath, digest);
    if (cached) return cached;
    let cause: unknown;
    const encoded = remotePath.split("/").map(encodeURIComponent).join("/");
    for (const source of sources) {
      lifetime.throwIfAborted();
      try {
        const bytes = await downloadVerifiedFile(new URL(encoded, source).href, digest, lifetime);
        await writeBackendFile(fullPath, bytes, lifetime);
        return bytes;
      } catch (error) {
        cause = error;
      }
    }
    throw new Error(`无法获取表情资源 ${path}`, { cause });
  }

  function loadManifest() {
    manifest ??= ensureFile("resources.json", manifestDigest).then((bytes) => {
      const { images, fonts } = JSON.parse(bytes.toString("utf8")) as Manifest;
      return new Map([
        ...images.map(({ file, hash }) => [`images/${file}`, hash] as const),
        ...fonts.map(({ file, hash }) => [`fonts/${file}`, hash] as const),
      ]);
    }).catch((error) => {
      manifest = undefined;
      throw error;
    });
    return manifest;
  }

  async function prepare(type: "fonts" | "images", path: string) {
    const parts = path.split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || /[\\:\x00-\x1f]/u.test(part))) {
      throw new Error("无效的表情资源路径");
    }
    const [source, packageName, folder, template] = parts;
    const extraSource = source === "anyliew" || source === "python";
    const key = source === "anyliew" && packageName === "emoji" ? folder :
      source === "python" && packageName === "meme_generator" && folder === "memes" ? template : source;
    if (type === "images" && isExcludedMemeTemplate(key)) throw new Error(excludedMemeTemplateMessage);
    lifetime.throwIfAborted();
    const filename = `${type}/${path}`;
    const extra = extraMemeAssets.get(filename);
    if (type === "images" && extraSource && !extra) {
      throw new Error(`表情资源清单缺少 ${filename}`);
    }
    let task = pending.get(filename);
    if (!task) {
      const load = extra ? ensureFile(filename, extra.digest, extra.path, extra.sources) : loadManifest().then((files) => {
        const digest = files.get(filename);
        if (!digest) throw new Error(`表情资源清单缺少 ${filename}`);
        return ensureFile(filename, digest);
      });
      task = load.finally(() => pending.delete(filename));
      pending.set(filename, task);
    }
    return task;
  }

  return {
    imageAsset: (path: string) => prepare("images", path),
    fontAsset: (path: string) => prepare("fonts", path),
  };
}
