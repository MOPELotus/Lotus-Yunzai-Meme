import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original pose tables and timing from MemeCrafters/meme-generator v0.1.14.
import { renderRgba } from "../../../packages/skia/index.ts";
import { loadImage } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { previewImage } from "./template-layout.ts";

type Pose = readonly [left: number, top: number, width: number, height: number];

interface OverlayAnimation {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly delayMs: number;
  readonly poses: readonly Pose[];
  readonly sequence?: readonly number[];
}

const range = (start: number, end: number) => Array.from({ length: end - start }, (_, index) => start + index);

const specs: readonly OverlayAnimation[] = [
  { key: "eat", keywords: ["吃"], delayMs: 50, poses: Array<Pose>(3).fill([2, 38, 34, 34]) },
  {
    key: "hammer", keywords: ["锤"], delayMs: 70, poses: [
      [62, 143, 158, 113], [52, 177, 173, 105], [42, 192, 192, 92], [46, 182, 184, 100],
      [54, 169, 174, 110], [69, 128, 144, 135], [65, 130, 152, 124],
    ],
  },
  {
    key: "hug_leg", keywords: ["抱大腿"], delayMs: 60, poses: [
      [50, 73, 68, 92], [58, 60, 62, 95], [65, 10, 67, 118],
      [61, 20, 77, 97], [55, 44, 65, 106], [66, 85, 60, 98],
    ],
  },
  {
    key: "knock", keywords: ["敲"], tags: ["鲨鲨", "Gawr Gura", "噶呜·古拉"], delayMs: 40, poses: [
      [60, 308, 210, 195], [60, 308, 210, 198], [45, 330, 250, 172], [58, 320, 218, 180],
      [60, 310, 215, 193], [40, 320, 250, 285], [48, 308, 226, 192], [51, 301, 223, 200],
    ],
  },
  {
    key: "play", keywords: ["顶", "玩"], tags: ["猫猫虫", "咖波"], delayMs: 60, poses: [
      [180, 60, 100, 100], [184, 75, 100, 100], [183, 98, 100, 100], [179, 118, 110, 100],
      [156, 194, 150, 48], [178, 136, 122, 69], [175, 66, 122, 85], [170, 42, 130, 96],
      [175, 34, 118, 95], [179, 35, 110, 93], [180, 54, 102, 93], [183, 58, 97, 92],
      [174, 35, 120, 94], [179, 35, 109, 93], [181, 54, 101, 92], [182, 59, 98, 92],
      [183, 71, 90, 96], [180, 131, 92, 101],
    ],
    sequence: [...range(0, 12), ...range(0, 12), ...range(0, 8), ...range(12, 38)],
  },
  {
    key: "pound", keywords: ["捣"], delayMs: 50, poses: [
      [135, 240, 138, 47], [135, 240, 138, 47], [150, 190, 105, 95], [150, 190, 105, 95],
      [148, 188, 106, 98], [146, 196, 110, 88], [145, 223, 112, 61], [145, 223, 112, 61],
    ],
  },
  {
    key: "thump", keywords: ["捶"], delayMs: 40, poses: [
      [65, 128, 77, 72], [67, 128, 73, 72], [54, 139, 94, 61], [57, 135, 86, 65],
    ],
  },
];

const singleImage = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };

function artworkPath(key: string, index: number) {
  return key === "play" ? `python/meme_generator/memes/play/images/${index}.png` : `${key}/${index}.png`;
}

// Pillow's below=True copies the avatar, then applies the foreground alpha as
// a mask to all four straight channels. GIF only keeps fully transparent pixels.
function blendArtwork(art: Buffer, avatar: Buffer) {
  for (let index = 0; index < art.length; index += 4) {
    const opacity = art[index + 3]!;
    if (opacity === 255) continue;
    const bottomWeight = 255 - opacity;
    for (let channel = index; channel < index + 3; channel++) {
      art[channel] = Math.round((art[channel]! * opacity + avatar[channel]! * bottomWeight) / 255);
    }
    art[index + 3] = Math.round((opacity * opacity + avatar[index + 3]! * bottomWeight) / 255) ? 255 : 0;
  }
  return art;
}

function template({ key, keywords, tags, poses, sequence = range(0, poses.length), delayMs }: OverlayAnimation): MemeTemplate {
  const readArt = (index: number, context: MemeTemplateContext) => context.imageAsset(artworkPath(key, index)).then(loadImage);
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length) throw new Error($t("templates.python-overlay-animation.text_455cc162ff"));
    const { signal } = context;
    const [avatar, first] = await Promise.all([readMemeFirstImage(images[0]!, signal), readArt(0, context)]);
    const { width, height } = first;
    assertMemeGifDimensions(width, height, sequence.length);
    const crop = Math.min(avatar.width, avatar.height);
    const cropLeft = Math.floor((avatar.width - crop) / 2), cropTop = Math.floor((avatar.height - crop) / 2);
    const assets = new Map<number, Buffer>();
    const output: { rgba: Buffer; delayMs: number }[] = [];
    for (const index of sequence) {
      signal.throwIfAborted();
      let frame = assets.get(index);
      if (!frame) {
        const art = index === 0 ? first : await readArt(index, context);
        if (art.width !== width || art.height !== height) throw new Error($t("templates.python-overlay-animation.text_bc92350be8", { "key": key }));
        const { rgba } = await renderRgba(width, height, draw => draw.drawImage(art, 0, 0));
        const pose = poses[index];
        if (pose) {
          const [left, top, avatarWidth, avatarHeight] = pose;
          const avatarLayer = await renderRgba(width, height, draw => {
            draw.imageSmoothingQuality = "high";
            draw.drawImage(avatar, cropLeft, cropTop, crop, crop, left, top, avatarWidth, avatarHeight);
          });
          frame = blendArtwork(rgba, avatarLayer.rgba);
        } else {
          // Playback-only frames use the unmodified legacy art.
          frame = rgba;
          for (let alpha = 3; alpha < frame.length; alpha += 4) frame[alpha] = frame[alpha] ? 255 : 0;
        }
        assets.set(index, frame);
      }
      const previous = output.at(-1);
      if (previous?.rgba.equals(frame)) previous.delayMs += delayMs;
      else output.push({ rgba: frame, delayMs });
    }
    return encodeMemeGif(width, height, output, signal);
  }
  return {
    info: { key, tags, keywords, params_type: singleImage }, render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const pythonOverlayMemeTemplates = specs.map(template);
