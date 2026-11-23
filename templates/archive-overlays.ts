// Pinned original metadata, artwork and font substitutions are documented with the asset bundle.
import { randomInt } from "node:crypto";
import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { archiveOverlaySpecs, archivePerspectivePoses, numberedArchiveOverlays } from "./archive-overlay-specs.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { pasteMask } from "./masked-layout.ts";
import { screenProjection } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { drawFittedText, jpg, previewImage, registerFont, registerMemeTypeface, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { timedOverlayTimeline } from "./timed-overlays.ts";

type Rectangle = readonly [number, number, number, number];

interface OverlayLayout {
  readonly asset: string;
  readonly box: Rectangle;
  readonly avatar: Rectangle;
  readonly shape: "circle" | "stretch";
  readonly caption: string;
  readonly sizes: readonly [number, number];
  readonly fill?: string;
  readonly align?: "left" | "center";
  readonly vertical?: "bottom";
  readonly font?: "rounded" | "pixel";
  readonly jpeg?: boolean;
  readonly avatarAbove?: boolean;
}

function avatarName(input: MemeTemplateInput) {
  const userInfo: unknown = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
  if (input.texts[0] !== undefined) return input.texts[0];
  if (!userInfo || typeof userInfo !== "object") return "他";
  const user = userInfo as {name?: unknown; gender?: unknown};
  return typeof user.name === "string" && user.name ? user.name : user.gender === "male" ? "他" : "她";
}

async function captionFont(context: MemeTemplateContext, type: OverlayLayout["font"]) {
  const [regular, emoji, preferred] = await Promise.all([
    registerFont(context),
    registerMemeTypeface(context, "NotoColorEmoji.ttf", "LotusMemeNotoEmoji"),
    type === "pixel" ? registerMemeTypeface(context, "FZXS14.ttf", "LotusMemeFusionPixel") :
      type === "rounded" ? registerMemeTypeface(context, "ZCOOLKuaiLe-Regular.ttf", "LotusMemeKuaiLe") : undefined,
  ]);
  return [preferred, regular, emoji].filter(Boolean).join(", ");
}

function avatarLayer(avatar: Image, layout: OverlayLayout): Draw {
  const [x, y, width, height] = layout.avatar;
  return draw => {
    if (layout.shape === "stretch") {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(avatar, x, y, width, height);
      return;
    }
    draw.beginPath();
    draw.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI);
    draw.clip();
    drawAvatar(draw, avatar, { slot: layout.avatar, fit: "square" }, false);
  };
}

function opaqueForGif(rgba: Uint8Array) {
  // Pillow retains nonzero alpha as a visible palette color in these frames.
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] === 0 ? 0 : 255;
  return rgba;
}

async function renderOverlay(layout: OverlayLayout, input: MemeTemplateInput, context: MemeTemplateContext) {
  const { signal } = context;
  const [artwork, face, font] = await Promise.all([
    context.imageAsset(layout.asset).then(loadImage),
    readMemeImageSequence(input.images[0]!, signal),
    captionFont(context, layout.font),
  ]);
  const width = artwork.width, height = artwork.height;
  const text = layout.caption.replaceAll("❤️", "♥").replace("{name}", () => avatarName(input));
  const raster = rgbaFrameDimensions(width, height);
  let prepared: { width: number; height: number; artwork: Promise<Buffer> } | undefined;
  async function compose(avatar: Image, w: number, h: number) {
    const scaled = (paint: Draw) => renderRgba(w, h, draw => {
      draw.scale(raster.scale * w / raster.width, raster.scale * h / raster.height);
      paint(draw);
    }).then(frame => frame.rgba);
    signal.throwIfAborted();
    if (prepared?.width !== w || prepared.height !== h) {
      const artworkFrame = scaled(draw => {
        draw.drawImage(artwork, 0, 0);
        drawFittedText(draw, layout.box, text, font, ...layout.sizes, layout.align ?? "left", layout.fill ?? "black", {
          vertical: layout.vertical, wrap: false, paragraphMetrics: true, blockAlignment: "center",
        });
      });
      prepared = { width: w, height: h, artwork: artworkFrame };
    }
    const [art, photo] = await Promise.all([prepared.artwork, scaled(avatarLayer(avatar, layout))]);
    if (layout.avatarAbove) {
      const composite = Buffer.from(art);
      pasteMask(composite, photo);
      return composite;
    }
    const composite = new Uint8Array(photo.length);
    pasteMask(composite, photo);
    pasteMask(composite, art);
    return composite;
  }
  if (face.frames.length === 1) {
    const rgba = await compose(face.frames[0], raster.width, raster.height);
    if (layout.jpeg) {
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3]!;
        for (let c = i; c < i + 3; c++) rgba[c] = Math.round((rgba[c]! * alpha / 255) + 255 - alpha);
        rgba[i + 3] = 255;
      }
    }
    const pixels = new ImageData(new Uint8ClampedArray(rgba), raster.width, raster.height);
    const paint: Draw = draw => draw.putImageData(pixels, 0, 0);
    if (layout.jpeg) return jpg(width, height, paint, signal);
    const { png } = await renderExactPng(raster.width, raster.height, paint);
    signal.throwIfAborted();
    return png;
  }
  const delayMs = Math.floor(face.averageDelayMs / 10) * 10;
  return renderPythonGif({
    ...raster, signal, frames: face.frames.map(value => ({ value, delayMs })),
    renderFrame: async (image, w, h) => opaqueForGif(await compose(image, w, h)),
  });
}

const archiveInput = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1 } as const;
async function previewInput(context: MemeTemplateContext): Promise<MemeTemplateInput> {
  return { images: [await previewImage(context.signal)], texts: [], args: {} };
}

function fixedTemplate(layout: OverlayLayout & {readonly key: string; readonly keywords: readonly string[]}): MemeTemplate {
  return {
    info: { key: layout.key, keywords: layout.keywords, params_type: archiveInput },
    render: (input, context) => renderOverlay(layout, input, context),
    async preview(context) {
      return renderOverlay(layout, await previewInput(context), context);
    },
  };
}

const numberHelp = "图片编号，0 为随机；1~25 对应：" +
  numberedArchiveOverlays.map(([name], index) => (index + 1) + "=" + name).join("、");
const numbered: MemeTemplate = {
  info: {
    key: "fleshlight_random", keywords: ["随机杯子"], params_type: {
      ...archiveInput,
      args_type: {
        args_model: { properties: { number: { type: "integer", default: 0, description: numberHelp } } },
        parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: numberHelp }],
      },
    },
  },
  render(input, context) {
    const number = input.args.number ?? 0;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > numberedArchiveOverlays.length) {
      throw new MemeTemplateFeedback("图片编号错误，请选择 1~25（0 为随机）");
    }
    const choice = number || randomInt(1, numberedArchiveOverlays.length + 1);
    const [, box, fill, avatar] = numberedArchiveOverlays[choice - 1]!;
    return renderOverlay({
      asset: "fleshlight_random/archive/" + choice + ".png", box, fill, avatar, shape: "circle",
      caption: "{name}の❤️最爱", sizes: [5, 100], font: "rounded", jpeg: true, avatarAbove: choice === 6,
    }, input, context);
  },
  async preview(context) {
    const input = await previewInput(context);
    return numbered.render({ ...input, args: { number: 1 } }, context);
  },
};

const timed: MemeTemplate = {
  info: { key: "fleshlight", keywords: ["飞机杯"], params_type: { ...archiveInput, max_texts: 0 } },
  async render(input, context) {
    const { signal } = context;
    const count = archivePerspectivePoses.length;
    const [source, ...art] = await Promise.all([
      readMemeImageSequence(input.images[0]!, signal),
      ...Array.from({ length: count }, (_, index) => context.imageAsset("fleshlight/archive/" + index + ".png").then(loadImage)),
    ]);
    const width = art[0]!.width, height = art[0]!.height;
    const raster = rgbaFrameDimensions(width, height);
    return renderPythonGif({
      ...raster, signal, frames: timedOverlayTimeline(source, count, 100, "extend-first"),
      async renderFrame({ image, overlay }, w, h) {
        const [points, [x, y]] = archivePerspectivePoses[overlay]!;
        const scaled = (paint: Draw) => renderRgba(w, h, draw => {
          draw.scale(raster.scale * w / raster.width, raster.scale * h / raster.height);
          paint(draw);
        }).then(frame => frame.rgba);
        const [avatar, frame] = await Promise.all([scaled(draw => {
          draw.translate(x, y);
          draw.beginPath();
          draw.rect(0, 0, Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])));
          draw.clip();
          draw.setTransform(draw.getTransform().multiply(screenProjection(210, 170, points)));
          drawAvatar(draw, image, { slot: [0, 0, 210, 170] }, false);
        }), scaled(draw => draw.drawImage(art[overlay]!, 0, 0))]);
        pasteMask(avatar, frame);
        return opaqueForGif(avatar);
      },
    });
  },
  async preview(context) {
    return timed.render(await previewInput(context), context);
  },
};

export const archiveOverlayTemplates = [...archiveOverlaySpecs.map(fixedTemplate), numbered, timed];
