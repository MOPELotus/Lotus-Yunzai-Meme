import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeFirstImage, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { previewImage, type Draw } from "./template-layout.ts";

type Size = readonly [width: number, height: number];
interface Frame {
  readonly overlay: number;
  readonly image: Image;
  readonly delayMs: number;
}
interface Layers {
  readonly base: Draw;
  readonly masks?: readonly Draw[];
}
interface Animation {
  readonly key: string;
  readonly keyword: string;
  readonly frames: number;
  readonly delayMs: number;
  readonly size: (art: Image, input: Image) => Size;
  readonly layers: (frame: Frame, art: Image, size: Size) => Layers;
  readonly tags?: readonly string[];
  readonly inputTiming?: "first" | "extend-first";
}

function drawImage(image: Image, x = 0, y = 0, width = image.width, height = image.height): Draw {
  return draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, x, y, width, height);
  };
}

function cover(image: Image, width: number, height: number): Draw {
  const ratio = Math.max(width / image.width, height / image.height);
  const w = Math.trunc(image.width * ratio), h = Math.trunc(image.height * ratio);
  return draw => {
    draw.save();
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    drawImage(image, Math.trunc((width - w) / 2), Math.trunc((height - h) / 2), w, h)(draw);
    draw.restore();
  };
}

function square(image: Image, x: number, y: number, width: number, height = width, circle = false, rotation = 0): Draw {
  const source = Math.min(image.width, image.height);
  return draw => {
    draw.save();
    draw.translate(x + width / 2, y + height / 2);
    if (rotation) draw.rotate(-rotation * Math.PI / 180);
    if (circle) {
      draw.beginPath();
      draw.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      draw.clip();
    }
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, -Math.trunc((source - image.width) / 2), -Math.trunc((source - image.height) / 2),
      source, source, -width / 2, -height / 2, width, height);
    draw.restore();
  };
}

function artSize(art: Image): Size { return [art.width, art.height]; }

function roundPixel(value: number) {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor + (floor % 2) : Math.round(value);
}

const genshinCharacters = ["yae_miko", "hutao", "nilou", "klee", "keqing", "zhongli"] as const;
const genshinHelp = $t("templates.large-source-animations.text_b7b332b122");
const genshinShortcuts = [
  ["八重神子吃", 1], ["神子吃", 1], ["八重吃", 1], ["胡桃吃", 2], ["妮露吃", 3], ["可莉吃", 4], ["刻晴吃", 5], ["钟离吃", 6],
] as const;
const foodPositions = [[106, 245], [115, 224], [116, 205], [115, 198], [120, 217]] as const;
const twistPositions = [
  [0, 45, 144], [0, 45, 144], [0, 45, 144], [2, 45, 141], [4, 45, 141], [8, 40, 141], [12, 38, 142],
  [30, 32, 148], [75, 25, 158], [115, 0, 160], [130, 0, 160], [125, 0, 155], [120, 0, 150], [115, 0, 148],
  [110, 5, 146], [85, 14, 146], [70, 19, 146], [45, 28, 144], [37, 38, 141], [10, 42, 144],
] as const;

function printerPaper(image: Image): Draw {
  const ratio = Math.min(304 / image.width, 174 / image.height);
  const width = Math.trunc(image.width * ratio), height = Math.trunc(image.height * ratio);
  const x = 146 + Math.trunc((304 - width) / 2), y = 164 + 174 - height;
  return draw => {
    draw.fillStyle = "white";
    draw.fillRect(146, 164, 304, 174);
    draw.clearRect(x, y, width, height);
    drawImage(image, x, y, width, height)(draw);
  };
}

// Frame order and placement from the pinned Python generators. The bundled
// Rust asset families use the same original PNGs with padded frame filenames.
const animations: readonly Animation[] = [
  {
    key: "genshin_eat", keyword: "原神吃", frames: 16, delayMs: 80, size: artSize,
    tags: ["原神", "米哈游", "八重神子", "胡桃", "妮露", "可莉", "刻晴", "钟离"],
    layers({ overlay, image }, art) {
      const position = foodPositions[overlay - 4];
      return {
        base: drawImage(art),
        ...(position && { masks: [square(image, position[0], position[1], 44, overlay === 8 ? 33 : 44, true)] }),
      };
    },
  },
  {
    key: "confuse", keyword: "迷惑", frames: 100, delayMs: 20,
    size(_art, input) {
      const width = Math.min(input.width, 500);
      return [width, Math.max(1, Math.trunc(input.height * width / input.width))];
    },
    layers({ image }, art, [width, height]) {
      return {
        base(draw) {
          draw.fillStyle = "white";
          draw.fillRect(0, 0, width, height);
        },
        masks: [drawImage(image, 0, 0, width, height), cover(art, width, height)],
      };
    },
  },
  {
    key: "printing", keyword: "打印", frames: 115, delayMs: 50, size: artSize, inputTiming: "first",
    layers({ overlay, image }, art) {
      return overlay < 50 ? { base: drawImage(art) } : { base: printerPaper(image), masks: [drawImage(art)] };
    },
  },
  {
    key: "clauvio_twist", keyword: "鼠鼠搓", frames: 40, delayMs: 50, size: artSize,
    layers({ overlay, image }, art) {
      const [rotation, x, y] = twistPositions[overlay % twistPositions.length]!;
      return { base: drawImage(art), masks: [square(image, x, y, 100, 100, true, rotation)] };
    },
  },
  {
    key: "run_away", keyword: "快逃", frames: 42, delayMs: 30, tags: ["初音未来"],
    size(art, input) {
      if (input.width > input.height) {
        const height = roundPixel(art.height * 1.2);
        return [roundPixel(height * input.width / input.height), height];
      }
      const width = roundPixel(art.width * 1.2);
      return [width, roundPixel(width * input.height / input.width)];
    },
    layers({ image }, art, [width, height]) {
      return { base: cover(image, width, height), masks: [drawImage(art, width - art.width, height - art.height)] };
    },
  },
  {
    key: "telescope", keyword: "望远镜", frames: 69, delayMs: 100, size: artSize, inputTiming: "extend-first",
    layers({ overlay: frame, image }, art) {
      let avatar;
      if (4 <= frame && frame < 18) avatar = square(image, -167 + (frame - 4) * 4, -361 + (frame - 4) * 7, 600);
      if (23 <= frame && frame < 38) avatar = square(image, -90 + (frame - 23) * 5, -245 + (frame - 23) * 5, 600);
      if (43 <= frame && frame < 46) avatar = square(image, -15, -210, 600);
      if (46 <= frame && frame < 57) avatar = square(image, 8, -21, 230);
      return avatar ? { base: avatar, masks: [drawImage(art)] } : { base: drawImage(art) };
    },
  },
];

function timeline(spec: Animation, input: MemeImageSequence): Frame[] {
  const { frames, delayMs } = spec;
  if (spec.inputTiming !== "extend-first") {
    return alignMemeLoop(input, frames, delayMs).map(frame => ({ ...frame, delayMs }));
  }

  const duration = input.frames.length * input.averageDelayMs;
  const interval = delayMs / 1000;
  // The original computed this ceiling in seconds before writing GIF timing.
  const extra = input.frames.length * (input.averageDelayMs / 1000) - frames * interval;
  const prefix = extra >= interval ? Math.ceil(extra / interval) : 0;
  // The frozen first artwork frame entirely covers the input during the hold.
  const result: Frame[] = [];
  let remaining = prefix * delayMs;
  const maxHold = Math.floor(655_350 / delayMs) * delayMs;
  while (remaining > 0) {
    const span = Math.min(remaining, maxHold);
    result.push({ image: input.frames[0], overlay: 0, delayMs: span });
    remaining -= span;
  }
  for (let overlay = 0; overlay < frames; overlay++) {
    const index = duration ? Math.floor(((prefix + overlay) * delayMs % duration) / input.averageDelayMs) : 0;
    result.push({ image: input.frames[index]!, overlay, delayMs });
  }
  return result;
}

function charaSubdirectory(args: MemeTemplateInput["args"]): string | undefined {
  const character = args.character === undefined ? 0 : Number(args.character);
  if (character === 0) return genshinCharacters[Math.floor(Math.random() * genshinCharacters.length)];
  if (!Number.isInteger(character) || character < 1 || character > genshinCharacters.length) {
    throw new MemeTemplateFeedback($t("templates.large-source-animations.text_af9e9fb42e"));
  }
  return genshinCharacters[character - 1];
}

function createAnimation(spec: Animation): MemeTemplate {
  const { key } = spec;
  const genshin = key === "genshin_eat";
  const info = {
    key, keywords: [spec.keyword], tags: spec.tags,
    ...(genshin && { shortcuts: genshinShortcuts.map(([alias, id]) => ({ key: alias, args: ["--character", String(id)] })) }),
    params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [],
      args_type: genshin ? {
        args_model: { properties: { character: { type: "integer", default: 0, description: genshinHelp } } },
        parser_options: [{ names: ["-c", "--character", $t("templates.large-source-animations.text_c47b54e84e")], args: [{ name: "character", value: "int" }], help_text: genshinHelp }],
      } : null,
    },
  };
  async function render(input: MemeTemplateInput, ctx: MemeTemplateContext) {
    const { signal } = ctx;
    const folder = genshin ? `${key}/${charaSubdirectory(input.args)}` : key;
    const padding = key === "printing" ? 3 : 2;
    const asset = (index: number) => ctx.imageAsset(`${folder}/${String(index).padStart(padding, "0")}.png`).then(loadImage);
    const [source, first] = await Promise.all([
      spec.inputTiming === "first" ? readMemeFirstImage(input.images[0]!, signal)
        .then((image): MemeImageSequence => ({ frames: [image], averageDelayMs: 0 })) : readMemeImageSequence(input.images[0]!, signal),
      asset(0),
    ]);
    const original = spec.size(first, source.frames[0]);
    const frames = timeline(spec, source);
    let [width, height] = original;
    for (;;) {
      signal.throwIfAborted();
      try {
        return await encodeMemeGifStream(width, height, frames.length, renderFrames(width, height), signal);
      } catch (error) {
        if (!(error instanceof MemeGifByteLimitError || error instanceof MemeGifDimensionLimitError) || width + height === 2) throw error;
      }
      width = Math.max(1, Math.floor(width * 0.9));
      height = Math.max(1, Math.floor(height * 0.9));
    }

    async function* renderFrames(width: number, height: number) {
      let previous: { rgba: Buffer; delayMs: number } | undefined;
      const scale = (draw: Draw) => (canvas: CanvasRenderingContext2D) => {
        canvas.scale(width / original[0], height / original[1]);
        draw(canvas);
      };
      for (const frame of frames) {
        signal.throwIfAborted();
        const art = frame.overlay === 0 ? first : await asset(frame.overlay);
        const { base, masks } = spec.layers(frame, art, original);
        const rgba = masks ? await renderMaskedRgba(width, height, scale(base), masks.map(scale), signal)
          : (await renderRgba(width, height, scale(base))).rgba;
        if (previous && previous.delayMs + frame.delayMs <= 655_350 && rgba.equals(previous.rgba)) {
          previous.delayMs += frame.delayMs;
        } else {
          if (previous) yield previous;
          previous = { rgba, delayMs: frame.delayMs };
        }
      }
      if (previous) yield previous;
    }
  }
  return {
    info, render,
    async preview(context) {
      const image = await previewImage(context.signal);
      return render({ images: [image], texts: [], args: genshin ? { character: 1 } : {} }, context);
    },
  };
}

export const largeSourceAnimations = animations.map(createAnimation);
