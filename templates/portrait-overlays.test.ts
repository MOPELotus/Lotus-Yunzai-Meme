import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadImage } from "skia-canvas";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { createLocalMemeBackend } from "../backend-lifecycle.ts";
import { initializeLocalCatalog } from "../catalog-update.ts";
import { createModule } from "../lotus.ts";
import { MemeTemplateFeedback } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { encodeMemeGif } from "./gif.ts";
import { previewImage, rgbaFrameDimensions } from "./template-layout.ts";
import { portraitOverlayTemplates } from "./portrait-overlays.ts";

const signal = new AbortController().signal;
const context = { signal, ...createBundledMemeResources(signal) };

function template(key: string) {
  return portraitOverlayTemplates.find(item => item.info.key === key)!;
}

async function sample(key: string, args: Record<string, unknown> = {}) {
  const image = await previewImage(signal);
  return Buffer.from(await template(key).render({ images: [image], texts: [], args }, context));
}

describe("fixed portrait overlays", () => {
  test("retains both clown layouts and their command option", async () => {
    const metadata = template("clown").info.params_type.args_type;
    expect(metadata).toMatchObject({ parser_options: [{ names: ["--person", "爷"] }] });
    for (const [person, width, height] of [[false, 746, 672], [true, 750, 750]] as const) {
      const image = await loadImage(await sample("clown", { person }));
      const expected = rgbaFrameDimensions(width, height);
      expect([image.width, image.height]).toEqual([expected.width, expected.height]);
    }
  }, 30_000);

  test("verifies all 92 pinned original crawl backgrounds and draws first and last", async () => {
    const prefix = "python/meme_generator/memes/crawl/images";
    for (let index = 1; index <= 92; index++) {
      const filename = String(index).padStart(2, "0");
      const bytes = await context.imageAsset(`${prefix}/${filename}.jpg`);
      expect(bytes.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
    }
    for (const number of [1, 92]) {
      const output = await sample("crawl", { number });
      expect(output.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
    }
    const failure = await sample("crawl", { number: 93 }).catch(error => error);
    expect(failure).toBeInstanceOf(MemeTemplateFeedback);
    expect(failure.message).toBe("图片编号错误，请选择 1~92");
  }, 30_000);

  test("keeps both frames and the Pillow centisecond delay for animated inputs", async () => {
    const width = 197;
    const height = 151;
    const frames = [40, 90].map((delayMs, index) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let pixel = 0; pixel < rgba.length; pixel += 4) {
        rgba[pixel + index] = 255;
        rgba[pixel + 3] = 255;
      }
      return { rgba, delayMs };
    });
    const image = new File([new Uint8Array(encodeMemeGif(width, height, frames, signal))], "avatar.gif");
    for (const key of ["out", "plana_eat", "seal"]) {
      const result = await template(key).render({ images: [image], texts: [], args: {} }, context);
      const output = await readMemeImageSequence(new File([new Uint8Array(result)], "result.gif"), signal);
      expect(output.frames).toHaveLength(2);
      expect(output.averageDelayMs).toBe(60);
    }
  }, 30_000);

  test("previews all overlay styles with their locally bundled fonts and art", async () => {
    for (const overlay of portraitOverlayTemplates) {
      const bytes = await overlay.preview!(context);
      expect((await loadImage(Buffer.from(bytes))).width).toBeGreaterThan(100);
    }
  }, 30_000);
});

test("recognizes the original aliases and options through an isolated private chat", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-portrait-overlays-"));
  const config = join(root, "config");
  const oldConfig = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const oldDatabase = Bun.env.LOTUS_MEME_DB;
  const backend = createLocalMemeBackend(signal, portraitOverlayTemplates);
  const handler = createModule({ signal });
  try {
    await mkdir(config);
    Bun.env.LOTUS_MEME_CONFIG_DIR = config;
    Bun.env.LOTUS_MEME_DB = join(root, "catalog.sqlite");
    await backend.ensure();
    await initializeLocalCatalog(signal);
    const avatar = await previewImage(signal);
    const segment = { type: "image", file: "base64://" + Buffer.from(await avatar.arrayBuffer()).toString("base64") };
    for (const [command, marker] of [
      ["#小丑 爷", "89504e47"],
      ["#这是我老婆 -p 小王 -n 朋友", "ffd8ff"],
      ["#等价无穷小", "ffd8ff"],
      ["#out", "ffd8ff"],
      ["#扔", "ffd8ff"],
      ["#爬 --number 92", "ffd8ff"],
      ["#普拉娜舔", "89504e47"],
      ["#源石封印", "89504e47"],
    ] as const) {
      const reply = await handler.fallback(command, {
        message_type: "private", user_id: 1234, isMaster: true, isBotMaster: () => true,
        message: [{ type: "text", text: command }, segment],
      });
      if (!reply || typeof reply !== "object" || !("type" in reply) || reply.type !== "image" || typeof reply.file === "string") {
        throw new Error(`未出图 ${command} ${String(reply)}`);
      }
      expect(Buffer.from(reply.file).toString("hex", 0, marker.length / 2)).toBe(marker);
    }
  } finally {
    await handler.dispose();
    backend.dispose();
    if (oldConfig === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = oldConfig;
    if (oldDatabase === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = oldDatabase;
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
