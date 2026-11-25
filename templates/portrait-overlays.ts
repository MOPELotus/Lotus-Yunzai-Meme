import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { pasteMask, renderMaskedRaster } from "./masked-layout.ts";
import { portraitOverlayMetadata } from "./portrait-overlays-metadata.ts";
import { renderPythonGif } from "./python-gif.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

type Still = (image: Image, input: Parameters<MemeTemplate["render"]>[0], context: MemeTemplateContext) => Promise<Uint8Array>;
type Placement = readonly [x: number, y: number];
const fullTurn = 2 * Math.PI;
const randomInteger = (limit: number) => Math.floor(Math.random() * limit) + 1;

async function asset(context: MemeTemplateContext, key: string, filename = "0.png") {
  const image = await loadImage(await context.imageAsset(`python/meme_generator/memes/${key}/images/${filename}`));
  context.signal.throwIfAborted();
  return image;
}

function imageDraw(image: Image, x = 0, y = 0, width = image.width, height = image.height): Draw {
  return draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, x, y, width, height);
  };
}

function circle(image: Image, x: number, y: number, size: number, angle = 0): Draw {
  return draw => {
    draw.save();
    draw.translate(x + size / 2, y + size / 2);
    draw.rotate(angle);
    draw.beginPath();
    draw.arc(0, 0, size / 2, 0, fullTurn);
    draw.clip();
    drawAvatar(draw, image, { slot: [-size / 2, -size / 2, size, size], fit: "square" }, false);
    draw.restore();
  };
}

function scaledMaskedRaster(width: number, height: number, base: Draw, overlays: readonly Draw[], signal: AbortSignal) {
  const raster = rgbaFrameDimensions(width, height);
  const scaled = (paint: Draw): Draw => draw => {
    draw.scale(raster.scale, raster.scale);
    paint(draw);
  };
  return renderMaskedRaster(raster.width, raster.height, scaled(base), overlays.map(scaled), signal);
}

const limPositions: readonly Placement[] = [
  [143, 32], [155, 148], [334, 149], [275, 266], [486, 266],
  [258, 383], [439, 382], [343, 539], [577, 487], [296, 717],
  [535, 717], [64, 896], [340, 896], [578, 897], [210, 1038],
  [644, 1039], [64, 1192], [460, 1192], [698, 1192], [1036, 141],
  [1217, 141], [1243, 263], [1140, 378], [1321, 378], [929, 531],
  [1325, 531], [1592, 531], [1007, 687], [1390, 687], [1631, 686],
  [1036, 840], [1209, 839], [1447, 839], [1141, 1018], [1309, 1019],
  [1546, 1019], [1037, 1197], [1317, 1198], [1555, 1197],
];

async function rasterImage(width: number, height: number, draw: Draw) {
  return loadImage((await renderExactPng(width, height, draw)).png);
}

function rotatedExtent(width: number, height: number, angle: number) {
  const x = width * Math.abs(Math.cos(angle)) + height * Math.abs(Math.sin(angle));
  const y = width * Math.abs(Math.sin(angle)) + height * Math.abs(Math.cos(angle));
  return [Math.ceil((width + x) / 2) - Math.floor((width - x) / 2),
    Math.ceil((height + y) / 2) - Math.floor((height - y) / 2)] as const;
}

const stills: Readonly<Record<string, Still>> = {
  async crawl(image, input, context) {
    const requested = input.args.number ?? 0;
    if (typeof requested !== "number" || !Number.isInteger(requested) || requested < 0 || requested > 92) {
      throw new MemeTemplateFeedback($t("templates.portrait-overlays.text_48ee81b80f"));
    }
    const number = requested || randomInteger(92);
    const art = await asset(context, "crawl", `${String(number).padStart(2, "0")}.jpg`);
    return jpg(art.width, art.height, draw => {
      imageDraw(art)(draw);
      circle(image, 0, 400, 100)(draw);
    }, context.signal);
  },
  async clown(image, input, context) {
    const person = input.args.person === true;
    const [width, height, centerX, centerY] = person ? [434, 467, 174, 378] as const : [554, 442, 153, 341] as const;
    const art = await asset(context, "clown", person ? "person.png" : "circle.png");
    const avatar = await rasterImage(width, height, draw => {
      drawAvatar(draw, image, { slot: [0, 0, width, height] }, false);
    });
    const half = width / 2;
    const angle = 26 * Math.PI / 180;
    const [rotatedWidth, rotatedHeight] = rotatedExtent(half, height, angle);
    const top = centerY - Math.floor(rotatedHeight / 2);
    const left = centerX - Math.floor(rotatedWidth / 2);
    const drawHalf = (source: number, x: number, radians: number): Draw => draw => {
      draw.save();
      draw.translate(x + rotatedWidth / 2, top + rotatedHeight / 2);
      draw.rotate(radians);
      draw.imageSmoothingQuality = "high";
      draw.drawImage(avatar, source, 0, half, height, -half / 2, -height / 2, half, height);
      draw.restore();
    };
    return scaledMaskedRaster(art.width, art.height, draw => paper(draw, art.width, art.height), [
      drawHalf(0, left, -angle),
      drawHalf(half, art.width - left - rotatedWidth, angle),
      imageDraw(art),
    ], context.signal);
  },
  async my_wife(image, input, context) {
    const [art, font] = await Promise.all([asset(context, "my_wife", "point.png"), registerFont(context, true)]);
    const height = Math.max(1, Math.floor(image.height * 400 / image.width));
    const pronoun = typeof input.args.pronoun === "string" ? input.args.pronoun : $t("templates.portrait-overlays.text_b70bb4acc0");
    const name = typeof input.args.name === "string" ? input.args.name : $t("templates.portrait-overlays.text_120a3a2fc2");
    return jpg(650, height + 500, draw => {
      paper(draw, 650, height + 500);
      draw.drawImage(image, 125, 105, 400, height);
      drawFittedText(draw, [27, 12, 623, 91], $t("templates.portrait-overlays.text_b1291e903f", { "name": name }), font, 30, 70, "center", "#000", { paragraphMetrics: true });
      drawFittedText(draw, [27, height + 120, 620, height + 255], $t("templates.portrait-overlays.text_c845fe8bb7", { "name": name, "pronoun": pronoun, "value3": name }),
        font, 30, 70, "left", "#000", { paragraphMetrics: true, blockAlignment: "center" });
      drawFittedText(draw, [27, height + 295, 401, height + 430], $t("templates.portrait-overlays.text_f711756fc9", { "name": name }), font, 30, 70, "center", "#000", { paragraphMetrics: true });
      draw.drawImage(art, 421, height + 270, 200, Math.max(1, Math.floor(art.height * 200 / art.width)));
    }, context.signal);
  },
  async lim_x_0(image, _input, context) {
    const art = await asset(context, "lim_x_0");
    return jpg(art.width, art.height, draw => {
      imageDraw(art)(draw);
      circle(image, 948, 247, 51)(draw);
      for (const [x, y] of limPositions) circle(image, x, y, 72)(draw);
    }, context.signal);
  },
  async throw(image, _input, context) {
    const art = await asset(context, "throw");
    const angle = -randomInteger(360) * Math.PI / 180;
    return jpg(art.width, art.height, draw => {
      imageDraw(art)(draw);
      circle(image, 15, 178, 143, angle)(draw);
    }, context.signal);
  },
};

interface AnimationLayout {
  readonly dimensions: readonly [width: number, height: number];
  readonly stillJpeg?: boolean;
  readonly base: (frame: Image) => Draw;
  readonly art: (frame: Image) => Draw;
}

async function animationLayout(key: string, first: Image, context: MemeTemplateContext): Promise<AnimationLayout> {
  const art = await asset(context, key, key === "out" ? "out.png" : "0.png");
  if (key === "plana_eat") {
    // The old foreground was pasted back using its own alpha as a Pillow mask.
    // The circular avatar is the base and is intentionally behind the artwork.
    return { dimensions: [art.width, art.height], base: image => circle(image, 212, 535, 488), art: () => imageDraw(art) };
  }
  if (key === "out") {
    return {
      dimensions: [first.width, first.height], stillJpeg: true, base: image => imageDraw(image),
      art: image => {
        const width = Math.max(1, Math.floor(image.width / 2));
        const height = Math.max(1, Math.floor(art.height * width / art.width));
        return imageDraw(art, Math.min(image.width - width - 10, Math.floor(image.width * 0.4)),
          Math.min(image.height - height - 10, Math.floor(image.height * 0.7)), width, height);
      },
    };
  }
  return {
    dimensions: [first.width, first.height], base: image => imageDraw(image), art: () => draw => {
      drawAvatar(draw, art, { slot: [0, 0, first.width, first.height], fit: "contain" }, false);
    },
  };
}

async function renderAnimation(key: string, file: File, context: MemeTemplateContext) {
  const { frames, averageDelayMs } = await readMemeImageSequence(file, context.signal);
  const { dimensions: [width, height], base, art, stillJpeg } = await animationLayout(key, frames[0], context);
  if (frames.length === 1) {
    const image = frames[0];
    if (!stillJpeg) return scaledMaskedRaster(width, height, base(image), [art(image)], context.signal);
    const merged = await loadImage(await renderMaskedRaster(width, height, base(image), [art(image)], context.signal));
    return jpg(width, height, draw => {
      paper(draw, width, height);
      imageDraw(merged)(draw);
    }, context.signal);
  }
  const raster = rgbaFrameDimensions(width, height);
  return renderPythonGif({
    width: raster.width, height: raster.height, signal: context.signal,
    frames: frames.map(value => ({ value, delayMs: Math.max(10, Math.floor(averageDelayMs / 10) * 10) })),
    async renderFrame(image, outputWidth, outputHeight) {
      const scaled = (paint: Draw) => renderRgba(outputWidth, outputHeight, draw => {
        draw.scale(outputWidth / width, outputHeight / height);
        paint(draw);
      });
      const { rgba } = await scaled(base(image));
      context.signal.throwIfAborted();
      pasteMask(rgba, (await scaled(art(image))).rgba);
      return rgba;
    },
  });
}

export const portraitOverlayTemplates: readonly MemeTemplate[] = portraitOverlayMetadata.map(info => {
  const still = stills[info.key];
  const render: MemeTemplate["render"] = async (input, context) => {
    const file = input.images[0]!;
    return still
      ? still(await readMemeFirstImage(file, context.signal), input, context)
      : renderAnimation(info.key, file, context);
  };
  return {
    info,
    render,
    async preview(context) {
      const image = await previewImage(context.signal);
      return render({ images: [image], texts: [], args: {} }, context);
    },
  };
});
