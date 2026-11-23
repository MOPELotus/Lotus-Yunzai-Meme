import { loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";
import { encodeMemeGif } from "./gif.ts";
import { screenProjection } from "./projective-transform.ts";
import { previewImage, type Draw } from "./template-layout.ts";
import { fixedPoseSpecs, type FixedPoseSpec, type Pose } from "./legacy-fixed-pose-specs.ts";

const opaqueWhite: Draw = draw => {
  draw.fillStyle = "#fff";
  draw.fillRect(0, 0, draw.canvas.width, draw.canvas.height);
};

function avatarDraw(image: Image, { x, y, width, height, angle, centered }: Pose, cover: boolean): Draw {
  return draw => {
    draw.imageSmoothingQuality = "high";
    const turn = -(angle ?? 0) * Math.PI / 180;
    const c = Math.abs(Math.cos(turn)), s = Math.abs(Math.sin(turn));
    const expandedWidth = Math.ceil((width + width * c + height * s) / 2) -
      Math.floor((width - width * c - height * s) / 2);
    const expandedHeight = Math.ceil((height + width * s + height * c) / 2) -
      Math.floor((height - width * s - height * c) / 2);
    const left = centered ? x - Math.floor(expandedWidth / 2) : x;
    const top = centered ? y - Math.floor(expandedHeight / 2) : y;
    if (angle) {
      if (!centered) {
        draw.beginPath();
        draw.rect(left, top, width, height);
        draw.clip();
      }
      draw.translate(left + (centered ? expandedWidth : width) / 2, top + (centered ? expandedHeight : height) / 2);
      draw.rotate(turn);
      draw.translate(-width / 2, -height / 2);
    } else draw.translate(left, top);
    if (!cover) {
      draw.drawImage(image, 0, 0, width, height);
      return;
    }
    const scale = Math.max(width / image.width, height / image.height);
    const w = Math.max(width, Math.trunc(image.width * scale)), h = Math.max(height, Math.trunc(image.height * scale));
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.drawImage(image, Math.trunc((width - w) / 2), Math.trunc((height - h) / 2), w, h);
  };
}

async function prepareAvatar(image: Image, mode: FixedPoseSpec["prepare"], signal: AbortSignal) {
  if (!mode) return image;
  let width: number, height: number, draw: Draw;
  if (mode === "book") {
    const { png: cover } = await renderExactPng(70, 100, avatarDraw(image, { image: 0, x: 0, y: 0, width: 70, height: 100 }, true));
    const prepared = await loadImage(cover);
    width = 100; height = 105;
    draw = ctx => {
      ctx.transform(screenProjection(prepared.width, prepared.height, [[0, 6], [77, -5], [100, 100], [32, 100]]));
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(prepared, 0, 0);
    };
  } else {
    const side = Math.min(image.width, image.height);
    width = height = mode === "basketball" ? 77 : side;
    draw = ctx => {
      ctx.imageSmoothingQuality = "high";
      if (mode === "circle") {
        ctx.beginPath();
        ctx.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2), side, side,
        0, 0, width, height);
    };
  }
  signal.throwIfAborted();
  const { png } = await renderExactPng(width, height, draw);
  signal.throwIfAborted();
  return loadImage(png);
}

function paste(dst: Uint8Array, src: Uint8Array) {
  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3]!;
    if (!alpha) continue;
    if (alpha === 255) {
      for (let j = 0; j < 4; j++) dst[i + j] = src[i + j]!;
    } else {
      for (let j = 0; j < 4; j++) dst[i + j] = Math.round((src[i + j]! * alpha + dst[i + j]! * (255 - alpha)) / 255);
    }
  }
}

function template(spec: FixedPoseSpec): MemeTemplate {
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== spec.inputs || texts.length) throw new Error("表情的图片或文字数量不符。");
    const { signal } = context;
    const [prepared, first] = await Promise.all([
      Promise.all(images.map(async file => prepareAvatar(await readMemeFirstImage(file, signal), spec.prepare, signal))),
      readArt(0),
    ]);
    const { width, height } = first;
    async function readArt(index: number) {
      return loadImage(await context.imageAsset(`${spec.directory}/${spec.frames[index]!.source}.png`));
    }

    async function* renderFrames() {
      let previous: { rgba: Uint8Array; delayMs: number } | undefined;
      for (const [i, frame] of spec.frames.entries()) {
        signal.throwIfAborted();
        const artwork = i === 0 ? first : await readArt(i);
        if (artwork.width !== width || artwork.height !== height) throw new Error("表情原帧尺寸不一致。");
        const { rgba: art } = await renderRgba(width, height, draw => draw.drawImage(artwork, 0, 0));
        let rgba: Uint8Array = art;
        if (spec.layer === "paper") {
          rgba = (await renderRgba(width, height, opaqueWhite)).rgba;
        }
        for (const pose of frame.poses) {
          const { rgba: avatar } = await renderRgba(width, height, avatarDraw(prepared[pose.image]!, pose, !!spec.cover));
          if (spec.layer === "under" || spec.layer === "under-mask") {
            const combined = spec.layer === "under" ? avatar : new Uint8Array(avatar.length);
            if (spec.layer === "under-mask") paste(combined, avatar);
            paste(combined, rgba);
            rgba = combined;
          } else paste(rgba, avatar);
        }
        if (spec.layer === "paper") paste(rgba, art);
        for (let channel = 3; channel < rgba.length; channel += 4) if (rgba[channel]) rgba[channel] = 255;
        if (previous && Buffer.from(previous.rgba.buffer, previous.rgba.byteOffset, previous.rgba.byteLength)
          .equals(rgba)) previous.delayMs += spec.delayMs;
        else {
          if (previous) yield previous;
          previous = { rgba, delayMs: spec.delayMs };
        }
      }
      if (previous) yield previous;
    }

    const frames = [];
    for await (const frame of renderFrames()) frames.push(frame);
    return encodeMemeGif(width, height, frames, signal);
  }
  return {
    info: {
      key: spec.key, keywords: spec.keywords, tags: spec.tags,
      params_type: { min_images: spec.inputs, max_images: spec.inputs, min_texts: 0, max_texts: 0,
        default_texts: [], args_type: null },
    },
    render,
    async preview(context) {
      const portrait = await previewImage(context.signal);
      return render({ images: Array<File>(spec.inputs).fill(portrait), texts: [], args: {} }, context);
    },
  };
}

export const legacyFixedPoseTemplates: readonly MemeTemplate[] = [
  createFixedAvatarAnimation({
    key: "ace_taffy_goggles", keywords: ["护目镜"], frames: 34, delayMs: 60, positions: [14, 30],
    sizes: [191, 191], cycleSquareAvatar: true, circle: "after-resize",
  }),
  ...fixedPoseSpecs.map(template),
];
