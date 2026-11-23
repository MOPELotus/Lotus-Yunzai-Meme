import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { previewImage } from "./template-layout.ts";

type Point = readonly [number, number];

interface LocalCanvas {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly viewport: Point;
  readonly firstFrame: number;
  readonly frames: number;
  readonly delayMs: number;
  readonly directory: string;
  readonly positions: Point | readonly Point[];
  readonly avatarSize: Point;
  readonly circle?: "avatar" | "before-resize";
}

// A composition happens inside each original frame, even where its edges cut
// through the avatar. The GIF screen encloses them all without scaling or centering.
const localCanvases: readonly LocalCanvas[] = [
  {
    key: "lemon", keywords: ["柠檬"], viewport: [117, 119], firstFrame: 1, frames: 92, delayMs: 60,
    directory: "anyliew/emoji/lemon/images", positions: [18, 15], avatarSize: [90, 90], circle: "avatar",
  },
  {
    key: "estrous", keywords: ["发情"], viewport: [300, 291], firstFrame: 1, frames: 33, delayMs: 30,
    directory: "anyliew/emoji/estrous/images", avatarSize: [98, 66],
    positions: [
      [105, 229], [104, 230], [103, 232], [101, 232], [98, 233], [96, 233], [93, 233], [91, 235], [89, 235],
      [86, 235], [85, 235], [84, 234], [83, 235], [81, 232], [82, 233], [82, 231], [85, 231], [87, 230],
      [89, 229], [92, 228], [94, 227], [97, 227], [100, 226], [101, 226], [104, 225], [106, 225], [106, 225],
      [109, 226], [109, 227], [108, 228], [108, 229], [106, 230], [105, 227],
    ],
  },
  {
    key: "hanbaomaodie", keywords: ["汉堡耄耋"], viewport: [201, 199], firstFrame: 0, frames: 6, delayMs: 100,
    directory: "python/meme_generator/memes/hanbaomaodie/tudou", avatarSize: [102, 73], circle: "before-resize",
    positions: [[49, 49], [41, 47], [44, 52], [39, 49], [44, 46], [42, 49]],
  },
];

function circle(draw: CanvasRenderingContext2D, x: number, y: number, size: number) {
  draw.beginPath();
  draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  draw.clip();
}

async function prepareAvatar(avatar: Image, context: MemeTemplateContext) {
  const { png } = await renderExactPng(120, 120, draw => {
    circle(draw, 0, 0, 120);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(avatar, 0, 0, 120, 120);
  });
  context.signal.throwIfAborted();
  return loadImage(png);
}

function createLocalCanvasAnimation(spec: LocalCanvas): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== 1 || input.texts.length) throw new Error("这个表情需要一张图片。");
    const { signal } = context;
    const [width, height] = spec.viewport;
    assertMemeGifDimensions(width, height, spec.frames);
    const source = await readMemeFirstImage(input.images[0]!, signal);
    const artworkBelow = spec.circle === "before-resize";
    const avatar = artworkBelow ? await prepareAvatar(source, context) : source;
    const frames: { rgba: Buffer; delayMs: number }[] = [];
    for (let index = 0; index < spec.frames; index++) {
      signal.throwIfAborted();
      const frame = await loadImage(await context.imageAsset(`${spec.directory}/${index + spec.firstFrame}.png`));
      if (frame.width > width || frame.height > height) throw new Error("表情模板的局部图层超出画布。");
      const [x, y] = (typeof spec.positions[0] === "number" ? spec.positions : spec.positions[index]) as Point;
      const [avatarWidth, avatarHeight] = spec.avatarSize;
      const drawAvatar = (draw: CanvasRenderingContext2D) => {
        if (spec.circle === "avatar") circle(draw, x, y, avatarWidth);
        draw.imageSmoothingQuality = "high";
        draw.drawImage(avatar, x, y, avatarWidth, avatarHeight);
      };
      const drawArt = (draw: CanvasRenderingContext2D) => draw.drawImage(frame, 0, 0);
      const local = artworkBelow
        ? await renderMaskedRgba(frame.width, frame.height, drawArt, [drawAvatar], signal)
        : await renderMaskedRgba(frame.width, frame.height, () => {}, [drawAvatar, drawArt], signal);
      // Pillow only reserved the zero-alpha entry when quantizing the masked RGBA layers.
      for (let channel = 3; channel < local.length; channel += 4) {
        if (local[channel] !== 0) local[channel] = 255;
      }
      const rgba = Buffer.alloc(width * height * 4);
      for (let row = 0; row < frame.height; row++) {
        local.copy(rgba, row * width * 4, row * frame.width * 4, (row + 1) * frame.width * 4);
      }
      const previous = frames.at(-1);
      if (previous?.rgba.equals(rgba)) previous.delayMs += spec.delayMs;
      else frames.push({ rgba, delayMs: spec.delayMs });
    }
    return encodeMemeGif(width, height, frames, signal);
  }

  return {
    info: { key: spec.key, keywords: spec.keywords,
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const localCanvasAnimations: readonly MemeTemplate[] = [
  ...localCanvases.map(createLocalCanvasAnimation),
  createFixedAvatarAnimation({
    key: "lemonade", keywords: ["柠檬水"], frames: 147, delayMs: 40, circle: "after-resize",
    positions: [53, 54], sizes: [280, 280],
  }),
];
