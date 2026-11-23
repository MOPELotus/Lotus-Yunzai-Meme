import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, previewImage, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

interface Placement {
  readonly image: number;
  readonly box: readonly [left: number, top: number, width: number, height: number];
  readonly circle?: true;
  readonly angle?: number;
}

interface Scene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly count: number;
  readonly layers: readonly Placement[];
  readonly above?: true;
  readonly jpegFrame?: true;
  readonly animatedInput?: true;
}

const scenes: readonly Scene[] = [
  { key: "shipborne_laser_weapons", keywords: ["舰载激光武器"], count: 1, animatedInput: true, layers: [
    { image: 0, box: [118, 212, 167, 167] },
    { image: 0, box: [572, 918, 73, 73] },
  ] },
  { key: "steal_two", keywords: ["双偷"], count: 3, layers: [
    { image: 0, box: [253, 78, 131, 131], circle: true },
    { image: 1, box: [11, 304, 140, 140], circle: true },
    { image: 2, box: [532, 387, 125, 125], circle: true },
  ] },
  { key: "swimsuit_group_photo", keywords: ["泳衣合影", "比基尼合影"], count: 2, above: true, layers: [
    { image: 1, box: [1695, 151, 480, 480], circle: true },
    { image: 0, box: [695, 161, 480, 480], circle: true },
  ] },
  { key: "throwing_poop", keywords: ["扔史"], count: 1, animatedInput: true, layers: [
    { image: 0, box: [347, 201, 125, 125] },
    { image: 0, box: [310, 553, 125, 125], angle: -10 },
    { image: 0, box: [297, 1003, 108, 108], angle: 20 },
  ] },
  { key: "together_two", keywords: ["在一起"], count: 2, above: true, jpegFrame: true, layers: [
    { image: 1, box: [280, 90, 200, 200], circle: true },
    { image: 0, box: [680, 20, 200, 200], circle: true },
  ] },
  { key: "torture_yourself", keywords: ["折磨自己"], count: 2, layers: [
    { image: 1, box: [722, 752, 175, 175] },
    { image: 0, box: [63, 278, 380, 410] },
  ] },
];

const transparent: Draw = () => {};

function drawPlacement({ box, angle, circle }: Placement, image: Image): Draw {
  return draw => {
    const [left, top, width, height] = box;
    draw.translate(left, top);
    if (angle) {
      const radians = -angle * Math.PI / 180;
      const cosine = Math.abs(Math.cos(radians));
      const sine = Math.abs(Math.sin(radians));
      // The original rotates the already resized avatar and expands both rounded edges.
      const center = (side: number, extent: number) => (Math.ceil((side + extent) / 2) - Math.floor((side - extent) / 2)) / 2;
      draw.translate(center(width, width * cosine + height * sine), center(height, width * sine + height * cosine));
      draw.rotate(radians);
      draw.translate(-width / 2, -height / 2);
    }
    draw.imageSmoothingQuality = "high";
    if (circle) {
      draw.beginPath();
      draw.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      draw.clip();
      const side = Math.min(image.width, image.height);
      draw.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2),
        side, side, 0, 0, width, height);
    } else draw.drawImage(image, 0, 0, width, height);
  };
}

function pixels(rgba: Uint8Array, width: number, height: number): Draw {
  const image = new ImageData(new Uint8ClampedArray(rgba), width, height);
  return draw => draw.putImageData(image, 0, 0);
}

function template(scene: Scene): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== scene.count || input.texts.length) throw new Error("表情的图片或文字数量不符。");
    const { signal } = context;
    const art = await context.imageAsset(`anyliew/emoji/${scene.key}/images/0.${scene.jpegFrame ? "jpg" : "png"}`).then(loadImage);
    const { width, height } = rgbaFrameDimensions(art.width, art.height);
    async function raster(images: readonly Image[], w: number, h: number) {
      const scale = (paint: Draw): Draw => draw => {
        draw.scale(w / art.width, h / art.height);
        paint(draw);
      };
      const background = scale(draw => draw.drawImage(art, 0, 0));
      const placements = scene.layers.map(layer => scale(drawPlacement(layer, images[layer.image]!)));
      if (scene.above) return renderMaskedRgba(w, h, background, placements, signal, { whiteBackground: true });
      let foreground = background;
      let result!: Uint8Array;
      for (const [index, draw] of placements.entries()) {
        result = await renderMaskedRgba(w, h, transparent, [draw, foreground], signal,
          { whiteBackground: !scene.animatedInput && index === placements.length - 1 });
        foreground = pixels(result, w, h);
      }
      return result;
    }
    if (!scene.animatedInput) {
      const images = await Promise.all(input.images.map(image => readMemeFirstImage(image, signal)));
      return jpg(art.width, art.height, pixels(await raster(images, width, height), width, height), signal);
    }
    const sequence = await readMemeImageSequence(input.images[0]!, signal);
    if (sequence.frames.length === 1) {
      return (await renderExactPng(width, height, pixels(await raster(sequence.frames, width, height), width, height))).png;
    }
    return renderPythonGif({
      width, height, signal,
      frames: sequence.frames.map(value => ({ value, delayMs: Math.floor(sequence.averageDelayMs / 10) * 10 })),
      renderFrame: (image, w, h) => raster([image], w, h),
    });
  }
  return {
    info: { key: scene.key, keywords: scene.keywords,
      params_type: { min_images: scene.count, max_images: scene.count, min_texts: 0, max_texts: 0, args_type: null } },
    render,
    async preview(context) {
      const input = await previewImage(context.signal);
      return render({ images: Array.from({ length: scene.count }, () => input), texts: [], args: {} }, context);
    },
  };
}

export const anyliewStaticAvatarTemplates = scenes.map(template);
