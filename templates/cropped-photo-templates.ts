import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Frame assets and geometry from MemeCrafters/meme-generator v0.1.14 (619fa105).
import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderPngWithoutFooter as renderPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, paper, previewImage, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

type Size = readonly [number, number];
type Compose = (photo: Image, art: Image, signal: AbortSignal) => Promise<Buffer>;

async function layer(context: MemeTemplateContext, key: string, name = "0.png") {
  return loadImage(await context.imageAsset(`python/meme_generator/memes/${key}/images/${name}`));
}

function photoAt(photo: Image, x: number, y: number, width: number, height: number): Draw {
  return draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, x, y, width, height);
  };
}

function imageAt(image: Image, x = 0, y = 0): Draw {
  return photoAt(image, x, y, image.width, image.height);
}

async function stillImage([width, height]: Size, draw: Draw) {
  return loadImage((await renderExactPng(width, height, draw)).png);
}

function fitted(photo: Image, x: number, y: number, width: number, height: number, inside = false): Draw {
  const ratio = (inside ? Math.min : Math.max)(width / photo.width, height / photo.height);
  const scaledWidth = Math.max(1, Math.trunc(photo.width * ratio));
  const scaledHeight = Math.max(1, Math.trunc(photo.height * ratio));
  return draw => {
    draw.save();
    draw.beginPath();
    draw.rect(x, y, width, height);
    draw.clip();
    photoAt(photo, x + Math.trunc((width - scaledWidth) / 2),
      y + Math.trunc((height - scaledHeight) / 2), scaledWidth, scaledHeight)(draw);
    draw.restore();
  };
}

function squarePhoto(photo: Image, x: number, y: number, size: number): Draw {
  const side = Math.min(photo.width, photo.height);
  return draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, Math.trunc((photo.width - side) / 2), Math.trunc((photo.height - side) / 2), side, side, x, y, size, size);
  };
}

async function circlePhoto(photo: Image, x: number, y: number, size: number) {
  const side = Math.min(photo.width, photo.height);
  const circled = await stillImage([side, side], draw => {
    draw.beginPath();
    draw.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
    draw.clip();
    squarePhoto(photo, 0, 0, side)(draw);
  });
  return photoAt(circled, x, y, size, size);
}

async function rotateExpanded(photo: Image, angle: number) {
  const radians = -angle * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const width = Math.ceil((photo.width + photo.width * cos + photo.height * sin) / 2) -
    Math.floor((photo.width - photo.width * cos - photo.height * sin) / 2);
  const height = Math.ceil((photo.height + photo.width * sin + photo.height * cos) / 2) -
    Math.floor((photo.height - photo.width * sin - photo.height * cos) / 2);
  return stillImage([width, height], draw => {
    draw.translate(width / 2, height / 2);
    draw.rotate(radians);
    imageAt(photo, -photo.width / 2, -photo.height / 2)(draw);
  });
}

interface CropSpec {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly imageRange?: readonly [number, number];
}
interface OverlaySpec extends CropSpec {
  readonly output: "jpg" | "png" | "jpg-gif" | "png-gif";
  readonly file?: string;
  readonly compose: Compose;
}

function fromArtwork({ width, height }: Image, base: Draw, overlay: Draw, signal: AbortSignal) {
  return renderMaskedRgba(width, height, base, [overlay], signal);
}

function gifOpaquePixels(rgba: Uint8Array) {
  // The source GIF writer reserves transparency only for zero-alpha pixels.
  for (let channel = 3; channel < rgba.length; channel += 4) {
    if (rgba[channel] !== 0) rgba[channel] = 255;
  }
  return rgba;
}

function croppedTemplate({ key, keywords, tags, imageRange = [1, 1] }: CropSpec, render: MemeTemplate["render"]): MemeTemplate {
  const [min_images, max_images] = imageRange;
  return {
    info: { key, keywords, tags, params_type: { min_images, max_images, min_texts: 0, max_texts: 0, default_texts: [], args_type: null } },
    async render(input, context) {
      if (input.images.length < min_images || input.images.length > max_images || input.texts.length) {
        throw new Error(min_images === max_images ? $t("templates.cropped-photo-templates.text_455cc162ff") : $t("templates.cropped-photo-templates.text_078675c312", { "min_images": min_images, "max_images": max_images }));
      }
      return render(input, context);
    },
    async preview(context) {
      const photo = await previewImage(context.signal);
      return render({ images: Array.from({ length: min_images }, () => photo), texts: [], args: {} }, context);
    },
  };
}

function overlayTemplate(spec: OverlaySpec) {
  return croppedTemplate(spec, async ({ images }, context) => {
    const { signal } = context;
    const [art, frames] = await Promise.all([
      layer(context, spec.key, spec.file),
      spec.output.endsWith("-gif") ? readMemeImageSequence(images[0]!, signal) :
        readMemeFirstImage(images[0]!, signal).then(photo => ({ frames: [photo], averageDelayMs: 0 })),
    ]);
    const { width, height } = art;
    const { width: outputWidth, height: outputHeight, scale } = rgbaFrameDimensions(width, height);
    if (frames.frames.length > 1) {
      return renderPythonGif({
        width: outputWidth, height: outputHeight, signal,
        frames: frames.frames.map(value => ({ value, delayMs: Math.floor(frames.averageDelayMs / 10) * 10 })),
        async renderFrame(photo, frameWidth, frameHeight) {
          const raster = new ImageData(new Uint8ClampedArray(await spec.compose(photo, art, signal)), width, height);
          if (width === frameWidth && height === frameHeight) return gifOpaquePixels(new Uint8Array(raster.data));
          const cached = await stillImage([width, height], draw => draw.putImageData(raster, 0, 0));
          return gifOpaquePixels((await renderRgba(frameWidth, frameHeight, photoAt(cached, 0, 0, frameWidth, frameHeight))).rgba);
        },
      });
    }
    const raster = new ImageData(new Uint8ClampedArray(await spec.compose(frames.frames[0]!, art, signal)), width, height);
    if (spec.output.startsWith("png") && scale === 1) return (await renderExactPng(width, height, draw => draw.putImageData(raster, 0, 0))).png;
    const composed = await stillImage([width, height], draw => draw.putImageData(raster, 0, 0));
    if (spec.output.startsWith("png")) return (await renderPng(width, height, imageAt(composed))).png;
    return jpg(width, height, draw => {
      paper(draw, width, height);
      imageAt(composed)(draw);
    }, signal);
  });
}

const overlays: readonly OverlaySpec[] = [
  { key: "china_flag", keywords: ["国旗"], output: "jpg",
    compose: (photo, art, signal) => fromArtwork(art, fitted(photo, 0, 0, art.width, art.height), imageAt(art), signal) },
  { key: "perfect", keywords: ["完美"], output: "jpg",
    compose: (photo, art, signal) => fromArtwork(art, imageAt(art), fitted(photo, 313, 64, 310, 460, true), signal) },
  { key: "raise_image", keywords: ["举"], file: "raise_image.png", output: "jpg-gif",
    async compose(photo, art, signal) {
      const inner = await loadImage(await renderMaskedRaster(599, 386, draw => paper(draw, 599, 386),
        [fitted(photo, 0, 0, 599, 386)], signal));
      return fromArtwork(art, imageAt(inner, 134, 91), imageAt(art), signal);
    },
  },
  { key: "jerry_stare", keywords: ["杰瑞盯"], tags: ["杰瑞", "猫和老鼠"], output: "png-gif",
    async compose(photo, art, signal) {
      return fromArtwork(art, await circlePhoto(photo, 184, 268, 150), imageAt(art), signal);
    },
  },
  { key: "karyl_point", keywords: ["凯露指"], tags: ["凯露", "公主连结"], output: "png",
    async compose(photo, art, signal) {
      const rotated = await rotateExpanded(photo, 7.5);
      return fromArtwork(art, imageAt(art), photoAt(rotated, 87, 790, 225, 225), signal);
    },
  },
  { key: "maimai_awaken", keywords: ["旅行伙伴觉醒"], tags: ["舞萌"], output: "jpg-gif",
    async compose(photo, art, signal) {
      const square = await stillImage([250, 250], squarePhoto(photo, 0, 0, 250));
      const rotated = await rotateExpanded(square, -25);
      return renderMaskedRgba(art.width, art.height, () => {}, [imageAt(rotated, 134, 134), imageAt(art)], signal);
    },
  },
  { key: "what_I_want_to_do", keywords: ["我想上的"], output: "jpg-gif",
    async compose(photo, art, signal) {
      return fromArtwork(art, imageAt(art), await circlePhoto(photo, 350, 590, 270), signal);
    },
  },
  { key: "erised_mirror", keywords: ["意若思镜"], tags: ["哈利·波特"], output: "png-gif",
    async compose(photo, art, signal) {
      const { rgba } = await renderRgba(360, 207, fitted(photo, 0, 0, 360, 207));
      // The source moves its blue tint's hue and saturation onto each original pixel's lightness.
      for (let i = 0; i < rgba.length; i += 4) {
        const red = rgba[i]!, green = rgba[i + 1]!, blue = rgba[i + 2]!;
        const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        const low = Math.floor(luminance * 57 / 260), middle = Math.floor(luminance * 78 / 260);
        const high = Math.floor(luminance * 125 / 260);
        const lightness = Math.round((Math.max(red, green, blue) + Math.min(red, green, blue)) / 2);
        const spread = high - low;
        const chroma = high + low === 0 ? 0 : Math.min(lightness, 255 - lightness) * spread / (high + low);
        const hue = spread ? Math.round(30 * (4 + (low - middle) / spread)) / 30 : 4;
        rgba[i] = Math.trunc(0.7 * Math.round(lightness - chroma));
        rgba[i + 1] = Math.trunc(0.7 * Math.round(lightness - chroma + 2 * chroma * (4 - hue)));
        rgba[i + 2] = Math.trunc(0.7 * Math.round(lightness + chroma));
        rgba[i + 3] = 255;
      }
      const source = new ImageData(new Uint8ClampedArray(rgba), 360, 207);
      const tint = await stillImage([360, 207], draw => draw.putImageData(source, 0, 0));
      const projection = screenProjection(360, 207, [[0, 0], [360, 0], [367, 207], [7, 207]]);
      return fromArtwork(art, draw => {
        draw.translate(55, 578);
        draw.transform(projection);
        imageAt(tint)(draw);
      }, imageAt(art), signal);
    },
  },
];

const marriage = croppedTemplate({ key: "marriage", keywords: ["结婚申请", "结婚登记"] },
  async ({ images }, context) => {
    const { signal } = context;
    const [photo, left, right] = await Promise.all([
      readMemeFirstImage(images[0]!, signal), layer(context, "marriage"), layer(context, "marriage", "1.png"),
    ]);
    const sourceWidth = Math.max(1, Math.trunc(photo.width * 1080 / photo.height));
    const croppedWidth = Math.min(1500, sourceWidth);
    const croppedHeight = Math.max(1, Math.trunc(1080 * Math.min(800, sourceWidth) / 800));
    const width = Math.trunc(croppedWidth * 1080 / croppedHeight);
    const artwork = await loadImage(await renderMaskedRaster(width, 1080, draw => {
      draw.scale(width / croppedWidth, 1080 / croppedHeight);
      photoAt(photo, Math.trunc((croppedWidth - sourceWidth) / 2), Math.trunc((croppedHeight - 1080) / 2), sourceWidth, 1080)(draw);
    }, [imageAt(left), imageAt(right, width - right.width, 0)], signal, { whiteBackground: true }));
    return jpg(width, 1080, imageAt(artwork), signal);
  },
);

const captain = croppedTemplate({ key: "captain", keywords: ["舰长"], tags: ["休伯利安号", "舰长", "崩坏3", "米哈游"], imageRange: [2, 5] },
  async ({ images }, context) => {
    const { signal } = context;
    const [photos, frames] = await Promise.all([
      Promise.all(images.map(image => readMemeFirstImage(image, signal))),
      Promise.all([0, 1, 2].map(index => layer(context, "captain", `${index}.png`))),
    ]);
    if (photos.length === 2) photos.push(photos[1]!);
    const portraits = await Promise.all(photos.map(async photo => {
      const { rgba } = await renderRgba(250, 250, squarePhoto(photo, 0, 0, 250));
      // The source copies RGBA to an RGB artwork without an alpha mask.
      for (let channel = 3; channel < rgba.length; channel += 4) rgba[channel] = 255;
      const opaque = new ImageData(new Uint8ClampedArray(rgba), 250, 250);
      return stillImage([250, 250], draw => draw.putImageData(opaque, 0, 0));
    }));
    return jpg(640, 440 * portraits.length, draw => {
      paper(draw, 640, 440 * photos.length);
      for (const [index, photo] of portraits.entries()) {
        const artwork = frames[Math.max(0, index - photos.length + 3)]!;
        const y = index * 440;
        imageAt(artwork, 0, y)(draw);
        imageAt(photo, 350, y + 85)(draw);
      }
    }, signal);
  },
);

function roundEven(numerator: number, denominator = 1) {
  const value = numerator / denominator;
  const integer = Math.floor(value);
  return value - integer === 0.5 ? integer + integer % 2 : Math.round(value);
}

function appLoop(source: MemeImageSequence, overlayCount: number) {
  // The original aligns by cumulative seconds rather than taking a millisecond modulo.
  const step = 0.03;
  const sourceFrameDelay = source.averageDelayMs / 1000;
  const sourceDuration = sourceFrameDelay * source.frames.length;
  let frames = overlayCount;
  if (sourceDuration - frames * step >= step) {
    while (frames + overlayCount <= 100) {
      frames += overlayCount;
      const nextDuration = frames * step;
      const cycles = roundEven(nextDuration / sourceFrameDelay / source.frames.length);
      if (Math.abs(cycles * sourceFrameDelay * source.frames.length - nextDuration) <= step) break;
    }
  }
  let artworkFrame = 0, origin = 0;
  return Array.from({ length: frames }, (_, i) => {
    if (source.frames.length > 1) {
      while (i * step - origin >= (artworkFrame + 1) * sourceFrameDelay) {
        artworkFrame++;
        if (artworkFrame === source.frames.length) { artworkFrame = 0; origin += sourceDuration; }
      }
    }
    return { value: [source.frames[artworkFrame]!, i % overlayCount] as const, delayMs: 30 };
  });
}

const saiminApp = croppedTemplate({ key: "saimin_app", keywords: ["催眠app"] },
  async ({ images }: MemeTemplateInput, context) => {
    const { signal } = context;
    const [input, overlays] = await Promise.all([
      readMemeImageSequence(images[0]!, signal),
      Promise.all(Array.from({ length: 25 }, (_, index) => layer(context, "saimin_app", `${index}.png`))),
    ]);
    const appWidth = overlays[0]!.width, appHeight = overlays[0]!.height;
    const photo = input.frames[0];
    const landscape = photo.width > photo.height;
    const width = landscape ? roundEven(appHeight * photo.width, photo.height) : appWidth;
    const height = landscape ? appHeight : roundEven(appWidth * photo.height, photo.width);
    const { width: outputWidth, height: outputHeight } = rgbaFrameDimensions(width, height);
    return renderPythonGif({
      width: outputWidth, height: outputHeight, signal,
      frames: appLoop(input, overlays.length),
      async renderFrame([image, overlay], frameWidth, frameHeight) {
        const atScale = (render: Draw): Draw => draw => {
          draw.scale(frameWidth / width, frameHeight / height);
          render(draw);
        };
        return gifOpaquePixels(await renderMaskedRgba(frameWidth, frameHeight, atScale(fitted(image, 0, 0, width, height)),
          [atScale(imageAt(overlays[overlay]!, 0, height - appHeight))], signal));
      },
    });
  },
);

export const croppedPhotoTemplates = [...overlays.map(overlayTemplate), marriage, captain, saiminApp];
