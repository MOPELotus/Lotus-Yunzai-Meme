import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";
import { assertMemeGifDimensions, encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { drawFittedText, jpg, previewImage, registerFont, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

function artwork(context: MemeTemplateContext, key: string) {
  return context.imageAsset(`anyliew/emoji/${key}/images/0.png`).then(loadImage);
}

function drawAt(image: Image, left = 0, top = 0, width = image.width, height = image.height): Draw {
  return canvas => {
    canvas.imageSmoothingQuality = "high";
    canvas.drawImage(image, left, top, width, height);
  };
}

async function roundPortrait(photo: Image, left: number, top: number, diameter: number): Promise<Draw> {
  const side = Math.min(photo.width, photo.height);
  const portrait = await renderExactPng(side, side, draw => {
    draw.beginPath();
    draw.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
    draw.clip();
    drawAt(photo, -Math.floor((photo.width - side) / 2), -Math.floor((photo.height - side) / 2))(draw);
  });
  return drawAt(await loadImage(portrait.png), left, top, diameter, diameter);
}

function sceneTemplate(key: string, keywords: readonly string[], imageCount: number, maxTexts: number,
  compose: MemeTemplate["render"], tags?: readonly string[]): MemeTemplate {
  return {
    info: { key, keywords, tags, params_type: {
      min_images: imageCount, max_images: imageCount, min_texts: 0, max_texts: maxTexts, default_texts: [], args_type: null,
    } },
    async render(input, context) {
      if (input.images.length !== imageCount || input.texts.length > maxTexts) throw new MemeTemplateFeedback($t("templates.legacy-photo-scenes.text_c3c4c3a422"));
      return compose(input, context);
    },
    async preview(context) {
      const sample = await previewImage(context.signal);
      return compose({ images: Array.from({ length: imageCount }, () => sample), texts: [], args: {} }, context);
    },
  };
}

function fbiName({ texts, args }: MemeTemplateInput) {
  if (texts[0] !== undefined) return texts[0];
  const first: unknown = Array.isArray(args.user_infos) ? args.user_infos[0] : undefined;
  if (!first || typeof first !== "object") return $t("templates.legacy-photo-scenes.text_2ab425e0c6");
  if ("name" in first && typeof first.name === "string" && first.name) return first.name;
  return "gender" in first && first.gender === "male" ? $t("templates.legacy-photo-scenes.text_8b7b91e000") : $t("templates.legacy-photo-scenes.text_2ab425e0c6");
}

async function photoOrGif(input: MemeTemplateInput, context: MemeTemplateContext, art: Image,
  portrait: (photo: Image) => Draw | Promise<Draw>, label?: Draw) {
  const { signal } = context;
  const { width, height } = art;
  const source = await readMemeImageSequence(input.images[0]!, signal);
  const base: Draw = draw => {
    drawAt(art)(draw);
    label?.(draw);
  };
  if (source.frames.length === 1) {
    const image = await loadImage(await renderMaskedRaster(width, height, base, [await portrait(source.frames[0])], signal,
      { whiteBackground: true }));
    return jpg(width, height, drawAt(image), signal);
  }

  const { width: rawWidth, height: rawHeight } = rgbaFrameDimensions(width, height);
  const delayMs = Math.floor(source.averageDelayMs / 10) * 10;
  async function renderFrame(photo: Image, frameWidth: number, frameHeight: number) {
    const atScale = (render: Draw): Draw => canvas => {
      canvas.scale(frameWidth / width, frameHeight / height);
      render(canvas);
    };
    const pixels = await renderMaskedRgba(frameWidth, frameHeight, atScale(base), [atScale(await portrait(photo))], signal);
    for (let channel = 3; channel < pixels.length; channel += 4) {
      if (pixels[channel] !== 0) pixels[channel] = 255;
    }
    return pixels;
  }

  let fitsMemoryBudget = true;
  try {
    assertMemeGifDimensions(rawWidth, rawHeight, source.frames.length);
  } catch (error) {
    if (!(error instanceof MemeGifDimensionLimitError)) throw error;
    fitsMemoryBudget = false;
  }
  if (!fitsMemoryBudget) {
    // The original wealth card is 2508×3263. A few frames can still be sent
    // at that size by using the shared disk-backed GIF encoder.
    async function* frames() {
      for (const photo of source.frames) yield { rgba: await renderFrame(photo, rawWidth, rawHeight), delayMs };
    }
    try {
      return await encodeMemeGifStream(rawWidth, rawHeight, source.frames.length, frames(), signal);
    } catch (error) {
      if (!(error instanceof MemeGifDimensionLimitError || error instanceof MemeGifByteLimitError)) throw error;
    }
  }
  return renderPythonGif({
    width: rawWidth, height: rawHeight, signal,
    frames: source.frames.map(value => ({ value, delayMs })), renderFrame,
  });
}

const fbi = sceneTemplate("fbi_photo", ["fbi", "FBI"], 1, 1, async (input, context) => {
  const [art, font] = await Promise.all([artwork(context, "fbi_photo"), registerFont(context)]);
  return photoOrGif(input, context, art, photo => drawAt(photo, 985, 400, 220, 220),
    draw => drawFittedText(draw, [800, 690, 1200, 790], `Name : ${fbiName(input)}`, font, 20, 70,
      "center", "#000", { vertical: "bottom", paragraphMetrics: true }));
});

const wealth = sceneTemplate("gong_xi_fa_cai", ["恭喜发财"], 1, 1, async (input, context) =>
  photoOrGif(input, context, await artwork(context, "gong_xi_fa_cai"), photo => roundPortrait(photo, 1035, 700, 800)));

const elysia = sceneTemplate("mihoyo_elysia_come", ["爱莉希雅降临"], 2, 0, async ({ images }, context) => {
  const { signal } = context;
  const [art, left, right] = await Promise.all([
    artwork(context, "mihoyo_elysia_come"),
    readMemeFirstImage(images[0]!, signal).then(photo => roundPortrait(photo, 92, 310, 130)),
    readMemeFirstImage(images[1]!, signal).then(photo => roundPortrait(photo, 410, 380, 190)),
  ]);
  const { width, height } = art;
  const rightBehind = await loadImage(await renderMaskedRaster(width, height, () => {}, [right, drawAt(art)], signal));
  const composed = await loadImage(await renderMaskedRaster(width, height, () => {}, [left, drawAt(rightBehind)], signal,
    { whiteBackground: true }));
  return jpg(width, height, drawAt(composed), signal);
}, ["米哈游"]);

const cinderella = createFixedAvatarAnimation({
  key: "cinderella_eat", keywords: ["灰姑娘吃"], frames: 6, delayMs: 40, positions: [170, 436], sizes: [211, 164],
});
const giftPositions = [
  0, 244, 197, 159, 129, 105, 87, 74, 67, 61, 57, 53, 51, 49, 48, 46, 48, 51, 56, 62, 66, 67, 67, 67, 65, 65,
  61, 60, 60, 60, 67, 92, 141, 201, 245, 0, 0, 0, 0, 0, 0,
];
const gift = createFixedAvatarAnimation({
  key: "christmas_gift", keywords: ["圣诞礼物"], frames: giftPositions.length, delayMs: 30,
  positions: giftPositions.map(y => [0, y]), sizes: [300, 215], crop: true, avatarStart: 1, avatarFrames: 35,
});

export const legacyPhotoScenes = [fbi, wealth, elysia, cinderella, gift];
