import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Geometry from MemeCrafters/meme-generator at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import { ImageData, type Image } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, rgbaFrameDimensions } from "./template-layout.ts";
import { timedOverlayTimeline } from "./timed-overlays.ts";

function roundHalfEven(value: number) {
  const floor = Math.floor(value);
  return value - floor === 0.5 && floor % 2 === 0 ? floor : Math.round(value);
}

function projectRotation(width: number, height: number, time: number) {
  const angle = time * Math.PI / 15;
  const distance = Math.hypot(width, height) / (2 * Math.tan(Math.PI / 8));
  const sin = Math.sin(angle), cos = Math.cos(angle);
  function project(x: number, y: number) {
    const offset = x - width / 2;
    const factor = distance / (distance + sin * offset);
    return [width / 2 + cos * offset * factor, height / 2 + (y - height / 2) * factor] as const;
  }
  const projected = [project(0, 0), project(width, 0), project(width, height), project(0, height)] as const;
  const horizontal = projected.map(([x]) => x);
  const vertical = projected.map(([, y]) => y);
  const left = Math.min(...horizontal), top = Math.min(...vertical);
  const translated = ([x, y]: readonly [number, number]): readonly [number, number] => [x - left, y - top];
  const corners: ProjectiveQuad = [translated(projected[0]), translated(projected[1]), translated(projected[2]), translated(projected[3])];
  return {
    width: Math.trunc(Math.max(...horizontal) - left),
    height: Math.trunc(Math.max(...vertical) - top),
    corners,
  };
}

const spin: MemeTemplate = {
  info: { key: "rotate_3d", keywords: ["三维旋转"], params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 } },
  async render({ images }, { signal }) {
    const source = await readMemeImageSequence(images[0]!, signal);
    const first = source.frames[0];
    const width = Math.max(1, roundHalfEven(first.width * 1.2));
    const height = Math.max(1, roundHalfEven(first.height * 1.5));
    const raster = rgbaFrameDimensions(width, height);
    return renderPythonGif({
      ...raster, signal,
      frames: timedOverlayTimeline(source, 30, 70, "extend-loop"),
      async renderFrame({ image, overlay }, outputWidth, outputHeight) {
        const projection = projectRotation(image.width, image.height, overlay);
        const { rgba } = await renderRgba(outputWidth, outputHeight, draw => {
          if (!projection.width || !projection.height) return;
          draw.scale(raster.scale * outputWidth / raster.width, raster.scale * outputHeight / raster.height);
          draw.translate(roundHalfEven((width - projection.width) / 2), roundHalfEven((height - projection.height) / 2));
          draw.beginPath();
          draw.rect(0, 0, projection.width, projection.height);
          draw.clip();
          draw.setTransform(draw.getTransform().multiply(screenProjection(image.width, image.height, projection.corners)));
          draw.imageSmoothingQuality = "high";
          draw.drawImage(image, 0, 0);
        });
        // Pillow pastes the projected frame using its own alpha mask, then encodes any surviving alpha as a palette color.
        for (let index = 0; index < rgba.length; index += 4) {
          const alpha = rgba[index + 3]!;
          if (alpha === 255) continue;
          for (let channel = 0; channel < 3; channel++) {
            rgba[index + channel] = Math.round(rgba[index + channel]! * alpha / 255);
          }
          rgba[index + 3] = Math.round(alpha ** 2 / 255) ? 255 : 0;
        }
        return rgba;
      },
    });
  },
  async preview(context) {
    return spin.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

const cameraZ = 3.5;
const sphereRadius = 1.2;
const sphereSide = 300;
const circleFrames = 60;
const cacheLimit = 3;

/** Each ray has two possible texture samples. A Y rotation only changes longitude. */
function sphereCoordinates(width: number, height: number) {
  const rays = new Float32Array(width * height * 4).fill(NaN);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (2 * x + 1 - width) / height;
      const v = (2 * y + 1 - height) / height;
      const rayLength = Math.hypot(u, v, 2);
      const cameraDotRay = -2 * cameraZ / rayLength;
      const discriminant = cameraDotRay ** 2 - cameraZ ** 2 + sphereRadius ** 2;
      if (discriminant < 0) continue;
      const root = Math.sqrt(discriminant);
      const index = (y * width + x) * 4;
      for (const offset of [0, 2]) {
        const distance = (-cameraDotRay + (offset === 0 ? -root : root)) / rayLength;
        rays[index + offset] = 0.5 + Math.atan2(cameraZ - 2 * distance, u * distance) / (2 * Math.PI);
        rays[index + offset + 1] = 0.5 + Math.asin(Math.max(-1, Math.min(1, v * distance / sphereRadius))) / Math.PI;
      }
    }
  }
  return rays;
}

function fractional(value: number) {
  return value - Math.floor(value);
}

interface Texture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

function sphereFrame(rays: Float32Array, rotation: number, texture: Texture) {
  const { width, height, rgba } = texture;
  const result = new Uint8ClampedArray(rays.length);
  for (let index = 0; index < rays.length; index += 4) {
    const near = fractional(rays[index]! + rotation);
    const far = fractional(rays[index + 2]! + rotation);
    const outside = near >= 0.25 && near <= 0.75;
    if (!outside && !(far >= 0.25 && far <= 0.75)) continue;
    const u = outside ? near : far;
    const v = rays[index + (outside ? 1 : 3)]!;
    const x = Math.max(0, Math.min(width - 1, u * width - 0.5));
    const y = Math.max(0, Math.min(height - 1, v * height - 0.5));
    const left = Math.floor(x), top = Math.floor(y);
    const right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1);
    const mixX = x - left, mixY = y - top;
    const topLeft = (top * width + left) * 4, topRight = (top * width + right) * 4;
    const bottomLeft = (bottom * width + left) * 4, bottomRight = (bottom * width + right) * 4;
    const a = (1 - mixX) * (1 - mixY) * rgba[topLeft + 3]!;
    const b = mixX * (1 - mixY) * rgba[topRight + 3]!;
    const c = (1 - mixX) * mixY * rgba[bottomLeft + 3]!;
    const d = mixX * mixY * rgba[bottomRight + 3]!;
    const alpha = a + b + c + d;
    if (alpha < 0.5) continue;
    const brightness = outside ? 1 : 0.7;
    for (let channel = 0; channel < 3; channel++) {
      result[index + channel] = brightness * (a * rgba[topLeft + channel]! + b * rgba[topRight + channel]! +
        c * rgba[bottomLeft + channel]! + d * rgba[bottomRight + channel]!) / alpha;
    }
    result[index + 3] = 255;
  }
  return result;
}

const sphere: MemeTemplate = {
  info: { key: "sphere_rotate", keywords: ["球面旋转"], params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 } },
  async render({ images }, { signal }) {
    const source = await readMemeImageSequence(images[0]!, signal);
    const textures = new Map<Image, Texture>();
    const raster = rgbaFrameDimensions(sphereSide, sphereSide);
    let rayWidth = raster.width, rayHeight = raster.height;
    let rays = sphereCoordinates(rayWidth, rayHeight);
    return renderPythonGif({
      ...raster, signal,
      frames: timedOverlayTimeline(source, circleFrames, 40, "no-extend"),
      async renderFrame({ image, overlay }, width, height) {
        let texture = textures.get(image);
        if (!texture) {
          // The original samples a mipmapped texture. Bound oversized input to a texture that the 300 px sphere can resolve.
          const ratio = Math.min(1, 768 / Math.max(image.width, image.height));
          const texWidth = Math.max(1, Math.round(image.width * ratio));
          const texHeight = Math.max(1, Math.round(image.height * ratio));
          const { rgba } = await renderRgba(texWidth, texHeight, draw => {
            draw.imageSmoothingQuality = "high";
            draw.drawImage(image, 0, 0, texWidth, texHeight);
          });
          texture = { width: texWidth, height: texHeight, rgba };
          if (textures.size >= cacheLimit) textures.delete(textures.keys().next().value!);
          textures.set(image, texture);
        }
        if (rayWidth !== width || rayHeight !== height) {
          rayWidth = width;
          rayHeight = height;
          rays = sphereCoordinates(width, height);
        }
        const pixels = new ImageData(sphereFrame(rays, overlay / circleFrames, texture), width, height);
        return (await renderRgba(width, height, draw => draw.putImageData(pixels, 0, 0))).rgba;
      },
    });
  },
  async preview(context) {
    return sphere.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const spatialRotationTemplates = [spin, sphere] as const;
