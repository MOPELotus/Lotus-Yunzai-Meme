import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { drawFittedText, jpg, previewImage, registerFont, registerMemeTypeface, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

interface Slot {
  readonly image: number;
  readonly box: readonly [left: number, top: number, width: number, height: number];
  readonly fit?: "circle" | "square" | "cover";
  readonly rotation?: number;
  readonly gray?: boolean;
}

interface Scene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly slots: readonly Slot[];
  readonly jpeg?: "above" | "below";
  readonly caption?: true;
}

const scenes: readonly Scene[] = [
  { key: "all_the_days", keywords: ["一生一世"], jpeg: "above", slots: [
    { image: 1, box: [255, 255, 95, 95], fit: "circle" },
    { image: 0, box: [425, 210, 95, 95], fit: "circle" },
  ] },
  { key: "begged_me", keywords: ["求我"], slots: [{ image: 0, box: [125, 655, 1720, 1720], fit: "circle", rotation: -15 }] },
  { key: "chillet_deer", keywords: ["疾风鹿"], slots: [{ image: 0, box: [202, 289, 549, 463] }] },
  { key: "cleverer", keywords: ["比聪明"], caption: true, slots: [{ image: 0, box: [-60, 99, 680, 680], fit: "cover" }] },
  { key: "commemorate", keywords: ["奠", "寄"], slots: [{ image: 0, box: [129, 218, 815, 747], fit: "cover", gray: true }] },
  { key: "dinosaur_head", keywords: ["恐龙头"], slots: [{ image: 0, box: [215, 245, 620, 620] }] },
  { key: "dog_girl", keywords: ["狗妹"], jpeg: "below", slots: [{ image: 0, box: [312, 115, 180, 180], fit: "square" }] },
  { key: "double_happiness", keywords: ["双喜"], jpeg: "above", slots: [
    { image: 1, box: [1206, 138, 522, 522], fit: "circle" },
    { image: 0, box: [532, 332, 536, 536], fit: "circle" },
  ] },
  { key: "ending", keywords: ["下场"], jpeg: "below", slots: [
    { image: 1, box: [463, 700, 284, 284], fit: "circle" },
    { image: 0, box: [1516, 880, 530, 530], fit: "circle" },
  ] },
];

const empty: Draw = () => {};

function drawSlot(slot: Slot, image: Image): Draw {
  return draw => {
    const [left, top, width, height] = slot.box;
    let x = left, y = top;
    draw.imageSmoothingQuality = "high";
    if (slot.rotation) {
      const radians = -slot.rotation * Math.PI / 180;
      const c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
      const offset = (size: number, expanded: number) =>
        (Math.ceil((size + expanded) / 2) - Math.floor((size - expanded) / 2)) / 2;
      draw.translate(left + offset(width, width * c + height * s), top + offset(height, width * s + height * c));
      draw.rotate(radians);
      x = -width / 2;
      y = -height / 2;
    }
    if (slot.fit === "circle" || slot.fit === "square") {
      if (slot.fit === "circle") {
        draw.beginPath();
        draw.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        draw.clip();
      }
      const side = Math.min(image.width, image.height);
      draw.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2),
        side, side, x, y, width, height);
    } else if (slot.fit === "cover") {
      const factor = Math.max(width / image.width, height / image.height);
      const scaledWidth = Math.max(width, Math.trunc(image.width * factor));
      const scaledHeight = Math.max(height, Math.trunc(image.height * factor));
      const offset = slot.gray ? Math.trunc : Math.floor;
      draw.beginPath();
      draw.rect(x, y, width, height);
      draw.clip();
      draw.drawImage(image, x + offset((width - scaledWidth) / 2), y + offset((height - scaledHeight) / 2),
        scaledWidth, scaledHeight);
    } else draw.drawImage(image, x, y, width, height);
  };
}

async function grayscaleSlot(slot: Slot, image: Image, signal: AbortSignal): Promise<Draw> {
  const [x, y, width, height] = slot.box;
  const draw = drawSlot({ ...slot, box: [0, 0, width, height] }, image);
  const { png } = await renderExactPng(width, height, canvas => {
    draw(canvas);
    const pixels = canvas.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const luminance = Math.round(pixels.data[index]! * 0.299 + pixels.data[index + 1]! * 0.587 + pixels.data[index + 2]! * 0.114);
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = luminance;
      pixels.data[index + 3] = 255;
    }
    canvas.putImageData(pixels, 0, 0);
  });
  signal.throwIfAborted();
  const opaque = await loadImage(png);
  return canvas => canvas.drawImage(opaque, x, y);
}

function sceneTemplate(scene: Scene): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== scene.slots.length || input.texts.length > Number(!!scene.caption)) {
      throw new Error("表情的图片或文字数量不符。");
    }
    const { signal } = context;
    const [frame, font] = await Promise.all([
      context.imageAsset(`anyliew/emoji/${scene.key}/images/0.png`).then(loadImage),
      scene.caption && Promise.all([registerMemeTypeface(context, "FZSEJW.ttf", "LotusMemeChild"), registerFont(context)]),
    ]);
    const users = input.args.user_infos;
    const user = Array.isArray(users) ? users[0] as { readonly name?: unknown; readonly gender?: unknown } | undefined : undefined;
    const name = input.texts[0] ?? ((typeof user?.name === "string" && user.name) || (user ? user.gender === "male" ? "他" : "她" : "这家伙"));
    const base: Draw = draw => {
      draw.drawImage(frame, 0, 0);
      if (font) drawFittedText(draw, [40, 845, 1056, 992], `你还能有${name}聪明？`, font.join(", "), 20, 100, "center");
    };
    const { width, height } = rgbaFrameDimensions(frame.width, frame.height);

    async function raster(images: readonly Image[], rasterWidth: number, rasterHeight: number) {
      const scaleDraw = (paint: Draw): Draw => draw => {
        draw.scale(rasterWidth / frame.width, rasterHeight / frame.height);
        paint(draw);
      };
      const avatars = await Promise.all(scene.slots.map(slot => {
        const image = images[slot.image]!;
        return slot.gray ? grayscaleSlot(slot, image, signal) : drawSlot(slot, image);
      }));
      const backdrop = scaleDraw(base);
      const slots = avatars.map(scaleDraw);
      if (scene.jpeg === "above") {
        return renderMaskedRgba(rasterWidth, rasterHeight, backdrop, slots, signal, { whiteBackground: true });
      }
      if (scene.key === "ending") {
        const first = await renderMaskedRgba(rasterWidth, rasterHeight, empty, [slots[0]!, backdrop], signal);
        return renderMaskedRgba(rasterWidth, rasterHeight, empty, [slots[1]!, draw => {
          draw.putImageData(new ImageData(new Uint8ClampedArray(first), rasterWidth, rasterHeight), 0, 0);
        }], signal, { whiteBackground: true });
      }
      // The old 狗妹 paste replaces its transparent avatar pixels before applying the frame mask.
      if (scene.jpeg) {
        return renderMaskedRgba(rasterWidth, rasterHeight, slots[0]!, [backdrop], signal, { whiteBackground: true });
      }
      return renderMaskedRgba(rasterWidth, rasterHeight, empty, [slots[0]!, backdrop], signal);
    }

    function paintPixels(rgba: Uint8Array): Draw {
      return draw => draw.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    }
    if (scene.jpeg) {
      const images = await Promise.all(input.images.map(image => readMemeFirstImage(image, signal)));
      const rgba = await raster(images, width, height);
      return jpg(frame.width, frame.height, paintPixels(rgba), signal);
    }
    const sequence = await readMemeImageSequence(input.images[0]!, signal);
    if (sequence.frames.length === 1) {
      const rgba = await raster([sequence.frames[0]], width, height);
      return (await renderExactPng(width, height, paintPixels(rgba))).png;
    }
    const delayMs = Math.floor(sequence.averageDelayMs / 10) * 10;
    return renderPythonGif({
      width, height, signal,
      frames: sequence.frames.map(value => ({ value, delayMs })),
      renderFrame: (image, w, h) => raster([image], w, h),
    });
  }
  return {
    info: {
      key: scene.key, keywords: scene.keywords,
      params_type: { min_images: scene.slots.length, max_images: scene.slots.length, min_texts: 0,
        max_texts: Number(!!scene.caption), default_texts: [], args_type: null },
    },
    render,
    async preview(context) {
      const image = await previewImage(context.signal);
      return render({ images: scene.slots.map(() => image), texts: [], args: {} }, context);
    },
  };
}

export const anyliewAvatarSceneTemplates = scenes.map(sceneTemplate);
