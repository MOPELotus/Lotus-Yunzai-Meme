import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import type { CanvasRenderingContext2D, Image } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence } from "./animated-input.ts";
import { pasteMask } from "./masked-layout.ts";
import { renderPythonCanvasGif, renderPythonGif } from "./python-gif.ts";
import { previewImage, rgbaFrameDimensions } from "./template-layout.ts";

const radians = (degrees: number) => degrees * Math.PI / 180;

function roundEven(value: number) {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor + (floor & 1) : Math.round(value);
}

// AnyLiew spiral enlarges the transparent canvas before sizing the sprite.
function spiral(image: Image, frame: number, draw: CanvasRenderingContext2D) {
  const canvasSize = 600, center = canvasSize / 2;
  const paddingWidth = Math.floor(image.width * 1.3), paddingHeight = Math.floor(image.height * 1.3);
  draw.fillStyle = "white";
  draw.fillRect(0, 0, canvasSize, canvasSize);
  draw.imageSmoothingQuality = "high";

  for (let layer = 6; layer >= 0; layer--) {
    const radius = 210 * ((0.70 ** layer) ** 1.4);
    const width = Math.max(5, canvasSize * 0.22 * (1 - layer * 0.14) ** (layer >= 1 && layer <= 3 ? 3.2 : 2.6));
    const spriteWidth = Math.floor(width);
    const spriteHeight = Math.max(1, Math.floor(width * image.height / image.width));
    const paddingX = Math.floor((paddingWidth - image.width) / 2) * spriteWidth / paddingWidth;
    const paddingY = Math.floor((paddingHeight - image.height) / 2) * spriteHeight / paddingHeight;
    const avatarWidth = image.width * spriteWidth / paddingWidth;
    const avatarHeight = image.height * spriteHeight / paddingHeight;
    for (let copy = 0; copy < 12; copy++) {
      const angle = radians(copy * 30 + frame * 7.2 * (layer % 2 === 0 ? 1 : -1));
      const x = Math.trunc(center + radius * Math.cos(angle) - spriteWidth / 2);
      const y = Math.trunc(center + radius * Math.sin(angle) - spriteHeight / 2);
      draw.save();
      draw.beginPath();
      draw.rect(x, y, spriteWidth, spriteHeight);
      draw.clip();
      draw.translate(x + spriteWidth / 2, y + spriteHeight / 2);
      draw.rotate(angle);
      draw.drawImage(image, paddingX - spriteWidth / 2, paddingY - spriteHeight / 2, avatarWidth, avatarHeight);
      draw.restore();
    }
  }
}

function windmill(image: Image, frame: number, draw: CanvasRenderingContext2D) {
  draw.translate(250, 250);
  draw.rotate(radians(-frame * 18));
  draw.translate(-300, -300);
  draw.fillStyle = "white";
  draw.fillRect(0, 0, 600, 600);
  draw.imageSmoothingQuality = "high";
  const scale = Math.max(300 / image.width, 300 / image.height);
  const width = Math.trunc(image.width * scale), height = Math.trunc(image.height * scale);
  const corners = [[0, 0], [0, 300], [300, 300], [300, 0]] as const;
  for (const [turn, [x, y]] of corners.entries()) {
    draw.save();
    draw.translate(x + 150, y + 150);
    draw.rotate(-turn * Math.PI / 2);
    draw.beginPath();
    draw.rect(-150, -150, 300, 300);
    draw.clip();
    draw.drawImage(image, Math.trunc((300 - width) / 2) - 150, Math.trunc((300 - height) / 2) - 150, width, height);
    draw.restore();
  }
}

function circleSprite(image: Image, size: number) {
  const side = Math.min(image.width, image.height);
  return renderRgba(size, size, draw => {
    draw.beginPath();
    draw.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    draw.clip();
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2),
      side, side, 0, 0, size, size);
  });
}

function fillSwirl(width: number, height: number, frame: number, sprite: Uint8Array, size: number) {
  const rgba = Buffer.alloc(width * height * 4);
  const sizeScale = width / 300;
  for (let copy = 0; copy < 24; copy++) {
    const angle = radians(frame * 9 + copy * 15);
    const x = Math.round(roundEven(100 + 75 * Math.cos(angle)) * sizeScale);
    const y = Math.round(roundEven(100 + 75 * Math.sin(angle)) * sizeScale);
    for (let row = 0; row < size; row++) {
      const start = ((y + row) * width + x) * 4;
      pasteMask(rgba.subarray(start, start + size * 4), sprite.subarray(row * size * 4, (row + 1) * size * 4));
    }
  }
  // The original Pillow GIF reserves palette transparency for zero alpha.
  for (let channel = 3; channel < rgba.length; channel += 4) {
    if (rgba[channel] !== 0) rgba[channel] = 255;
  }
  return rgba;
}

const scenes = [
  { key: "spiral", keywords: ["螺旋转", "漩涡"], edge: 600, cadence: 70, poses: 50, draw: spiral },
  { key: "swirl_turn", keywords: ["回旋转", "旋风转"], edge: 300, cadence: 20, poses: 40, draw: undefined },
  { key: "windmill_turn", keywords: ["风车转"], edge: 500, cadence: 50, poses: 5, draw: windmill },
] as const;

function template(scene: typeof scenes[number]): MemeTemplate {
  async function render({ images, texts }: Parameters<MemeTemplate["render"]>[0], { signal }: Parameters<MemeTemplate["render"]>[1]) {
    if (images.length !== 1 || texts.length) throw new Error($t("templates.rotating-avatars.text_455cc162ff"));
    const source = await readMemeImageSequence(images[0]!, signal);
    const frames = alignMemeLoop(source, scene.poses, scene.cadence).map(value => ({ value, delayMs: scene.cadence }));
    const { width, height, scale } = rgbaFrameDimensions(scene.edge, scene.edge);
    const paint = scene.draw;
    if (paint) {
      return renderPythonCanvasGif({ width, height, scale, frames, signal,
        drawFrame: ({ image, overlay }, draw) => paint(image, overlay, draw) });
    }

    const sprites = new WeakMap<Image, Map<number, ReturnType<typeof circleSprite>>>();
    return renderPythonGif({ width, height, frames, signal,
      async renderFrame({ image, overlay }, w, h) {
        const size = Math.max(1, Math.round(w / 3));
        let sizes = sprites.get(image);
        if (!sizes) {
          sizes = new Map();
          sprites.set(image, sizes);
        }
        let raster = sizes.get(size);
        if (!raster) {
          raster = circleSprite(image, size);
          sizes.set(size, raster);
        }
        return fillSwirl(w, h, overlay, (await raster).rgba, size);
      },
    });
  }
  return {
    info: { key: scene.key, keywords: scene.keywords,
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const rotatingAvatarTemplates = scenes.map(template);
