// Original coordinates and static JPEG output from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type Image } from "skia-canvas";
import { tudouWelcomePath } from "../backend-tudou-portrait-animation-assets.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { jpg, previewImage, type Draw } from "./template-layout.ts";

type Inset = readonly [left: number, top: number, width: number, height: number];

interface PhotoTemplate {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  /** Omit to fill the original picture dimensions. */
  readonly slots?: readonly Inset[];
  readonly replaceArt?: boolean;
  readonly assetPath?: string;
}

const specs: readonly PhotoTemplate[] = [
  { key: "anti_kidnap", keywords: ["防诱拐"], slots: [[30, 78, 450, 450]] },
  { key: "decent_kiss", keywords: ["像样的亲亲"], slots: [[0, 91, 589, 340]] },
  { key: "divorce", keywords: ["离婚协议", "离婚申请"] },
  { key: "hold_tight", keywords: ["抱紧"], slots: [[113, 205, 159, 171]] },
  { key: "no_response", keywords: ["无响应"], slots: [[0, 581, 1050, 783]] },
  { key: "you_dont_get", keywords: ["你不懂啦"], tags: ["猫猫虫", "咖波"], slots: [[217, 181, 142, 139]] },
  { key: "daynight", keywords: ["白天黑夜", "白天晚上"], slots: [[349, 0, 333, 360], [349, 361, 333, 360]], replaceArt: true },
  // Tudou's 2022 welcome registration puts the first GIF image over the photo and saves a static JPEG.
  { key: "huanying", keywords: ["欢迎", "欢迎新人"], slots: [[77, 164, 150, 122]], assetPath: tudouWelcomePath },
];

export function coverImage(image: Image, [left, top, width, height]: Inset, replaceArt: boolean): Draw {
  const ratio = Math.max(width / image.width, height / image.height);
  const imageWidth = Math.max(width, Math.trunc(ratio * image.width));
  const imageHeight = Math.max(height, Math.trunc(ratio * image.height));
  const x = left + Math.trunc((width - imageWidth) / 2);
  const y = top + Math.trunc((height - imageHeight) / 2);
  return draw => {
    draw.save();
    draw.beginPath();
    draw.rect(left, top, width, height);
    draw.clip();
    if (replaceArt) draw.clearRect(left, top, width, height);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, x, y, imageWidth, imageHeight);
    draw.restore();
  };
}

function photoTemplate({ key, keywords, tags, slots, replaceArt = false, assetPath = `${key}/0.png` }: PhotoTemplate): MemeTemplate {
  const count = slots?.length ?? 1;
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== count || texts.length) throw new Error(`该表情需要 ${count} 张图片。`);
    const { signal } = context;
    const [art, ...photos] = await Promise.all([
      context.imageAsset(assetPath).then(loadImage),
      ...images.map(image => readMemeFirstImage(image, signal)),
    ]);
    const { width, height } = art;
    const drawArt: Draw = draw => draw.drawImage(art, 0, 0);
    const insets = slots ?? [[0, 0, width, height]];
    const drawPhotos: Draw = draw => {
      for (const [index, slot] of insets.entries()) coverImage(photos[index]!, slot, replaceArt)(draw);
    };
    if (replaceArt) return jpg(width, height, draw => {
      drawArt(draw);
      drawPhotos(draw);
      draw.globalCompositeOperation = "destination-over";
      draw.fillStyle = "white";
      draw.fillRect(0, 0, width, height);
    }, signal);

    const masked = await renderMaskedRaster(width, height, drawPhotos, [drawArt], signal, { whiteBackground: true });
    const composite = await loadImage(masked);
    return jpg(width, height, draw => draw.drawImage(composite, 0, 0), signal);
  }
  return {
    info: { key, keywords, tags, params_type: {
      min_images: count, max_images: count, min_texts: 0, max_texts: 0, default_texts: [], args_type: null,
    } },
    render,
    async preview(context) {
      const preview = await previewImage(context.signal);
      return render({ images: Array<File>(count).fill(preview), texts: [], args: {} }, context);
    },
  };
}

export const photoInsetMemeTemplates = specs.map(photoTemplate);
