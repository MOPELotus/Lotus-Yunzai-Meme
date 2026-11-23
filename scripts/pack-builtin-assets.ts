import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { isExcludedMemeTemplate } from "../template-policy.ts";

const manifestHash = "68a03183b74fffdb82abe1f49f5a9bf1b0e009ff09944646dfcd35f79b7f5d71";
const rustSource = "https://raw.githubusercontent.com/MemeCrafters/meme-generator-rs/9c0607407675a2a92d4d24b5fbbeaf0cc119db67/resources/";
const fonts = new Set([
  "NotoColorEmoji.ttf", "NotoSansSC-Bold.ttf", "NotoSansSC-Regular.ttf",
  "GlowSansSC-Normal-Heavy.otf", "NotoSerifSC-Regular.otf",
]);
const bundled = fileURLToPath(new URL("../resources/builtin/", import.meta.url));

interface Origin {
  readonly digest: string;
  readonly source: string;
  readonly originalPath: string;
  readonly license?: "OFL-1.1";
  readonly distribution?: string;
}

interface Inventory {
  readonly manifestSHA256: string;
  readonly assets: readonly { path: string; sha256: string; verifiedLocal?: string }[];
}

interface OpenFont extends Omit<Origin, "digest"> {
  readonly path: string;
  readonly sha256: string;
  readonly verifiedLocal: string;
}

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validPath(path: string) {
  return path.split("/").every(part => part && part !== "." && part !== ".." && !/[\\:\p{Cc}\p{Cf}]/u.test(part));
}

function templateKey(logicalPath: string) {
  const path = logicalPath.split("/");
  if (path[0] === "fonts") return;
  if (path[1] === "anyliew" && path[2] === "emoji") return path[3];
  if (path[1] === "python" && path[2] === "meme_generator" && path[3] === "memes") return path[4];
  return path[1];
}

async function origins(manifestPath: string) {
  const bytes = await readFile(manifestPath);
  if (hash(bytes) !== manifestHash) throw new Error("Meme Rust 资源索引与固定版本不符。");
  const raw = JSON.parse(bytes.toString("utf8")) as Record<"fonts" | "images", readonly { file: string; hash: string }[]>;
  const selected = new Map<string, Origin>();
  function add(path: string, origin: Origin) {
    if (!validPath(path) || !validPath(origin.originalPath) || !/^[a-f0-9]{64}$/u.test(origin.digest)) {
      throw new Error(`无效的 Meme 资源索引行 ${path}`);
    }
    const key = templateKey(path);
    if (key && isExcludedMemeTemplate(key)) return;
    if (selected.has(path)) throw new Error(`Meme 资源重复登记 ${path}`);
    selected.set(path, origin);
  }
  for (const type of ["images", "fonts"] as const) {
    for (const { file, hash: digest } of raw[type]) {
      const path = `${type}/${file}`;
      add(path, { digest, source: rustSource, originalPath: path,
        ...(type === "fonts" && fonts.has(file) && { license: "OFL-1.1" }) });
    }
  }
  for (const [path, { digest, path: originalPath, sources }] of extraMemeAssets) {
    if (!sources[0]) throw new Error(`Meme 资源缺少固定源 ${path}`);
    add(path, { digest, source: sources[0], originalPath });
  }
  return selected;
}

function signature(path: string, data: Buffer) {
  const marker = data.subarray(0, 4).toString("hex");
  if (/\.png$/iu.test(path)) return data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (/\.jpe?g$/iu.test(path)) return marker.startsWith("ffd8ff");
  if (/\.webp$/iu.test(path)) return marker === "52494646" && data.subarray(8, 12).toString("ascii") === "WEBP";
  if (/\.gif$/iu.test(path)) return /^GIF8[79]a$/u.test(data.subarray(0, 6).toString("ascii"));
  if (/\.(?:ttf|otf|ttc)$/iu.test(path)) return ["00010000", "4f54544f", "74746366", "74727565"].includes(marker);
  return false;
}

function digestPath(directory: string, digest: string) {
  return join(directory, digest.slice(0, 2), digest.slice(2));
}

async function findAsset(logicalPath: string, origin: Origin, directories: readonly string[], output: string, verifiedLocal?: string) {
  for (const filename of new Set([digestPath(output, origin.digest), ...(verifiedLocal ? [verifiedLocal] : []),
    ...directories.flatMap(directory => [join(directory, logicalPath), join(directory, origin.originalPath)])])) {
    try {
      const file = Bun.file(filename);
      if (!await file.exists() || file.size > 64 * 1024 * 1024) continue;
      const bytes = Buffer.from(await file.arrayBuffer());
      if (hash(bytes) === origin.digest && signature(logicalPath, bytes)) return { filename, size: bytes.byteLength };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function atomicFile(path: string, bytes: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const [, , mode, manifestPath, inventoryPath, destination, ...input] = Bun.argv;
if ((mode !== "--report" && mode !== "--write") || !manifestPath || !inventoryPath || !destination) {
  throw new Error("用法 bun scripts/pack-builtin-assets.ts --report|--write Rust资源根/resources.json 实际使用索引.json 输出目录|. [--open-fonts 已授权字体.json] [素材根目录 ...]");
}
const output = destination === "." ? bundled : resolve(destination);
let openFonts: readonly OpenFont[] = [];
if (input[0] === "--open-fonts") {
  const [, path] = input.splice(0, 2);
  if (!path) throw new Error("未指定已授权字体文件。");
  const document = JSON.parse(await readFile(path, "utf8")) as { fonts: readonly OpenFont[] };
  if (!Array.isArray(document.fonts)) throw new Error("已授权字体来源索引格式无效。");
  openFonts = document.fonts;
}
const directories = [dirname(resolve(manifestPath)), ...input.map(path => resolve(path))];
const known = await origins(manifestPath);
const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as Inventory;
if (inventory.manifestSHA256 !== manifestHash || !Array.isArray(inventory.assets)) throw new Error("素材使用索引与固定版本不符。");
const selected = new Map<string, Origin>();
const auditedPaths = new Map<string, string | undefined>();
const withheldFonts: string[] = [];
const seen = new Set<string>();
for (const { path, sha256, verifiedLocal } of inventory.assets) {
  const origin = known.get(path);
  if (!origin || origin.digest !== sha256 || seen.has(path)) throw new Error(`实际使用索引包含未知、重复或禁用素材 ${path}`);
  seen.add(path);
  if (path.startsWith("fonts/") && !fonts.has(path.slice("fonts/".length))) {
    withheldFonts.push(path);
    continue;
  }
  selected.set(path, origin);
  auditedPaths.set(path, verifiedLocal);
}
for (const { path, sha256: digest, verifiedLocal, source, originalPath, license, distribution } of openFonts) {
  if (!/^fonts\/[A-Za-z\d_.-]+\.(?:ttf|otf)$/u.test(path) || seen.has(path) ||
      !/^[a-f0-9]{64}$/u.test(digest) || !validPath(originalPath) || license !== "OFL-1.1" ||
      !/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[a-f0-9]{40}\/$/u.test(source) ||
      (distribution !== undefined && !/^https:\/\/[^\s]+$/u.test(distribution))) {
    throw new Error(`已授权字体来源索引行无效 ${path}`);
  }
  seen.add(path);
  selected.set(path, { digest, source, originalPath, license, ...(distribution && { distribution }) });
  auditedPaths.set(path, verifiedLocal);
}
for (const path of extraMemeAssets.keys()) {
  if (known.has(path) && !selected.has(path)) throw new Error(`实际使用索引遗漏额外素材 ${path}`);
}
const found = new Map<string, { filename: string; size: number }>();
const missing: Record<string, Origin> = {};
const entries = [...selected].sort(([a], [b]) => a < b ? -1 : Number(a > b));
for (const [path, origin] of entries) {
  if (found.has(origin.digest)) continue;
  const file = await findAsset(path, origin, directories, output, auditedPaths.get(path));
  if (file) found.set(origin.digest, file);
  else missing[path] = origin;
}
for (const [path, origin] of Object.entries(missing)) if (found.has(origin.digest)) delete missing[path];
const stats = {
  logicalPaths: selected.size,
  digests: new Set([...selected.values()].map(row => row.digest)).size,
  available: found.size,
  bytes: [...found.values()].reduce((sum, file) => sum + file.size, 0),
  withheldFonts,
  missing,
};
console.log(JSON.stringify(stats, null, 2));
if (mode === "--write") {
  if (Object.keys(missing).length) throw new Error("仍缺已登记的 Meme 素材，未写入索引。");
  for (const [digest, { filename }] of found) {
    const destination = digestPath(output, digest);
    if (filename === destination) continue;
    const bytes = await readFile(filename);
    if (hash(bytes) !== digest) throw new Error(`Meme 打包素材在验证后变化：${digest}`);
    await atomicFile(destination, bytes);
  }
  await atomicFile(join(output, "sources.json"), `${JSON.stringify({ format: 1, files: Object.fromEntries(entries) }, null, 2)}\n`);
  const files = Object.fromEntries(entries.map(([path, { digest }]) => [path, digest]));
  await atomicFile(join(output, "manifest.json"), `${JSON.stringify({ format: 1, files }, null, 2)}\n`);
}
