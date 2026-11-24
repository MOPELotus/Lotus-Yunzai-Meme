import { builtinResourceDirectory } from "../../lib/builtin-resources.ts";
// SPDX-License-Identifier: GPL-3.0-only
// Adapts the composition in yeyang52/yenai-plugin model/memes.js (zan, crawl, ganyu)
// and apps/thumbUp.js. See the original history for the authors and their changes.
// https://github.com/MOPELotus/yenai-plugin/blob/fe42a6fabcf13fe610f6d6d15e9e087940d15d27/model/memes.js
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fetchAvatar, imageMime, maxAvatarBytes } from "./generate-reply.ts";

type Outcome = "success" | "failure";

interface Options {
  /** Path to the operator's original yenai resources/memes directory. */
  readonly directory: string;
  readonly signal?: AbortSignal;
  readonly random?: () => number;
  readonly rasterScale?: 1 | 4;
}

// Original files verified against the selected yenai revision; repository artwork is the default fallback.
const digests = {
  ganyu: {
    "0.png": "6c2ba3b5b8091b20d6092fd442a2264ca7ac95d48358dc99c4d3209f43269b36",
  },
  bixin: {
    "0.png": "f657ef6a9da5d0ce9c158d7005e5852f7229d1f8e5ec4b6f5a5181b84cef2e80",
    "1.png": "6a8ec09cb82b758aa428e21a417b723c369ae0b7eeeab5d53bcb3193f264b101",
    "52.jpg": "b7c2b715be2c0824ac8e055e47e08e4acc6b44f799952d42dc6997079ee00188",
  },
  crawl: {
    "1.jpg": "e52a11d32e8c5f93a475004807c9c0d197b56202f93e8ba45de41f48718f362d",
    "2.jpg": "c3a1971981f09ef178e90c35266850efc3f76201c8b893dae3f33c7d98ecb833",
    "3.jpg": "0136ada6d5dfc757d2228a826aed4093c97334e91103809a10fd82ae9d7da59a",
    "4.jpg": "6c0656fafba997cf37274cebb75db9045b6393cb74e6fb1eeeb08c85353cbc20",
    "5.jpg": "129707bc86df4d5c9d54ba30cab72756307a272727cc4cdb32d96e759c7b96c8",
    "6.jpg": "71f545f9d2f27d6c2bf1539ad8a0a671a33977bf0b094d9e3f1e270a74fac2fa",
    "7.jpg": "bd103a4bc982fc872aab808bddfe42eaa5e564b0d6d84b4c3a33b50f0aea5433",
    "8.jpg": "271d4bdb55db44fdd8d8632d000b4947ebce3db9a739c4b295c56f60bdf3fd65",
    "9.jpg": "623279fb1f5078042bd1e5de2e5aaf3a6cd1128e726fd690d659524df4b3909c",
    "10.jpg": "9dbb17a970d9e8a6b8cad178dd0e8d75fa82dd5101e9f5ca8a7ab92202d69159",
    "11.jpg": "245a5cb8003146a7d3df697633bf5d81983d6c5946934e51a700fd0c088422c7",
    "12.jpg": "3340704c8f0f51f1b1410fbd44e94251ed68ecebed6a85b263c449bb969a9ad8",
    "13.jpg": "22bd115732435ec7001697a638a41c46895751b0b6380907ae899d89ece336cd",
    "14.jpg": "c95b87ca069bb200b02a3697d1819c39c370c2ddd60b94ab976eefdb071c7f7c",
    "15.jpg": "d0b63588053ff69eff0cca3db8695d1d34f17233d3f5522482011c03b7f9e571",
  },
} as const;

type Family = keyof typeof digests;

interface Template {
  readonly family: Family;
  readonly art: Buffer;
}

async function readTemplate(outcome: Outcome, { directory, signal, random = Math.random }: Options): Promise<Template | undefined> {
  if (!directory || signal?.aborted) return;
  const family: Family = outcome === "failure" ? "crawl" : random() < 0.5 ? "ganyu" : "bixin";
  const requested = join(directory, family);
  const folder = await readdir(requested).then(() => requested, () => join(builtinResourceDirectory("social/likes"), family));
  const files = new Set((await readdir(folder, { withFileTypes: true })).filter((file) => file.isFile()).map((file) => file.name));
  const candidates = Object.entries(digests[family]).filter(([name]) => files.has(name));
  const candidate = candidates[Math.floor(random() * candidates.length)];
  if (!candidate || signal?.aborted) return;
  const [name, digest] = candidate;
  const file = await open(join(folder, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    const { size } = stat;
    if (!stat.isFile() || !size || size > 1024 * 1024) return;
    const bytes = Buffer.alloc(size + 1);
    const { bytesRead } = await file.read(bytes);
    if (bytesRead !== size || signal?.aborted) return;
    const art = bytes.subarray(0, bytesRead);
    if (createHash("sha256").update(art).digest("hex") === digest) return { family, art };
  } finally {
    await file.close();
  }
}

async function compose(avatar: Uint8Array, { family, art }: Template, renderScale: 1 | 4,
  signal?: AbortSignal): Promise<Uint8Array | undefined> {
  if (signal?.aborted || avatar.byteLength > maxAvatarBytes || !imageMime(avatar)) return;
  const { Canvas, loadImage } = await import("skia-canvas");
  const [face, frame] = await Promise.all([loadImage(Buffer.from(avatar)), loadImage(art)]);
  if (signal?.aborted || !face.width || !face.height || face.width > 4096 || face.height > 4096) return;
  const width = family === "ganyu" ? 700 : frame.width;
  const height = family === "ganyu" ? 598 : frame.height;
  const canvas = new Canvas(width * renderScale, height * renderScale);
  const ctx = canvas.getContext("2d");
  ctx.scale(renderScale, renderScale);
  // The Jimp renderer encoded a JPEG with black beneath transparent pixels.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const crop = Math.min(face.width, face.height);
  const cropX = (face.width - crop) / 2;
  const cropY = (face.height - crop) / 2;
  function coverAvatar(x: number, y: number, size: number) {
    ctx.drawImage(face, cropX, cropY, crop, crop, x, y, size, size);
  }

  if (family === "ganyu") {
    coverAvatar(425, 327, 235);
    ctx.drawImage(frame, 0, 0);
  } else {
    ctx.drawImage(frame, 0, 0);
    const [x, y] = family === "bixin" ? [30, 300] : [0, 400];
    ctx.beginPath();
    ctx.arc(x + 50, y + 50, 50, 0, 2 * Math.PI);
    ctx.clip();
    coverAvatar(x, y, 100);
  }
  const jpeg = await canvas.toBuffer("jpeg", { quality: 1 });
  if (!signal?.aborted) return jpeg;
}

/** Compose a supplied avatar over the original operator-local artwork. */
export async function renderProfileLikeImage(avatar: Uint8Array, outcome: Outcome,
  options: Options): Promise<Uint8Array | undefined> {
  try {
    const template = await readTemplate(outcome, options);
    if (template) return await compose(avatar, template, options.rasterScale ?? 4, options.signal);
  } catch {
    // Missing artwork or failed decode leaves the surrounding command's text reply intact.
  }
}

/** Use the same fixed QQ avatar transport as the ordinary meme commands. */
export function createProfileLikeImageRenderer(directory: string, rasterScale: 1 | 4 = 4) {
  return async (userId: number, outcome: Outcome, signal?: AbortSignal): Promise<Uint8Array | undefined> => {
    try {
      const template = await readTemplate(outcome, { directory, signal });
      if (!template || signal?.aborted) return;
      const avatar = await fetchAvatar(String(userId), { size: 100, signal });
      if (avatar && !signal?.aborted) return await compose(new Uint8Array(await avatar.arrayBuffer()), template, rasterScale, signal);
    } catch {
      // The surrounding command can still return its text reply.
    }
  };
}
