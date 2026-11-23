import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { anyliewAvatarCaptionScenes } from "./anyliew-avatar-caption-scenes.ts";
import { anyLiewCaptionFonts, paintAnyLiewCaption, type AnyLiewCaptionStyle, type CaptionBox } from "./anyliew-dialogue.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, previewImage, rgbaFrameDimensions, rotateExpanded, type Draw } from "./template-layout.ts";

interface Placement {
  readonly image: number;
  readonly box: readonly [left: number, top: number, width: number, height: number];
  readonly circle?: true | "stretch-first";
  readonly angle?: number;
  readonly brightness?: number;
}

interface SceneCaption extends AnyLiewCaptionStyle {
  readonly text: (input: MemeTemplateInput) => string;
  readonly box: CaptionBox;
  readonly rotation?: { readonly x: number; readonly y: number; readonly degrees: number };
}

export interface AnyLiewAvatarScene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly count: number;
  readonly layers: readonly Placement[];
  readonly above?: true;
  readonly jpegFrame?: true;
  readonly jpegOutput?: true;
  readonly animatedInput?: true;
  readonly tags?: readonly string[];
  readonly captions?: readonly SceneCaption[];
  readonly defaultTexts?: readonly string[];
  readonly argsType?: unknown;
}

const genshin = ["米哈游", "原神"] as const;

const scenes: readonly AnyLiewAvatarScene[] = [
  { key: "mixue_jasmine_milk_green", keywords: ["茉莉奶绿"], count: 2, layers: [
    { image: 1, box: [218, 458, 100, 85] },
    { image: 0, box: [452, 395, 100, 85] },
  ] },
  { key: "mixue_stick_beaten_fresh_orange", keywords: ["棒打鲜橙"], count: 2, layers: [
    { image: 1, box: [272, 569, 160, 135] },
    { image: 0, box: [580, 432, 160, 135] },
  ] },
  { key: "kfc_thursday", keywords: ["星期四", "疯狂星期四"], count: 1, above: true, animatedInput: true, jpegOutput: true, layers: [
    { image: 0, box: [775, 390, 450, 450], circle: true },
  ] },
  { key: "kfc", keywords: ["kfc", "KFC", "肯德基"], count: 1, above: true, animatedInput: true, layers: [
    { image: 0, box: [65, 65, 500, 500], circle: true, angle: 15 },
  ] },
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
  { key: "ice_tea_head", keywords: ["冰红茶"], count: 1, animatedInput: true, above: true, layers: [
    { image: 0, box: [320, 35, 500, 500], circle: true },
  ] },
  { key: "mahiro_fuck", keywords: ["真寻中指", "中指", "🖕🏻"], count: 1, animatedInput: true, above: true, layers: [
    { image: 0, box: [430, 40, 180, 180], circle: true },
  ] },
  { key: "mi_monkey", keywords: ["米猴", "🐒", "🐵"], count: 1, animatedInput: true, above: true, layers: [
    { image: 0, box: [500, 100, 180, 180], circle: true },
  ] },
  { key: "mihoyo_funina_death_penalty", keywords: ["死刑"], count: 1, animatedInput: true, above: true, tags: genshin, layers: [
    { image: 0, box: [950, 380, 280, 280], circle: true },
  ] },
  { key: "mihoyo_funina_finger", keywords: ["芙芙指", "芙宁娜指", "芙芙酱指"], count: 1, animatedInput: true, above: true, tags: genshin, layers: [
    { image: 0, box: [1400, 650, 500, 500], circle: true },
  ] },
  { key: "mihoyo_genshin_impact_op", keywords: ["OP", "op", "Op", "oP"], count: 1, animatedInput: true, above: true, tags: genshin, layers: [
    { image: 0, box: [500, 100, 180, 180], circle: true },
  ] },
  { key: "mihoyo_genshin_impact_players", keywords: ["原批", "原神玩家"], count: 1, animatedInput: true, above: true, tags: genshin, layers: [
    { image: 0, box: [385, 120, 220, 220], circle: true },
  ] },
  { key: "miss_in_my_sleep", keywords: ["睡梦中想念"], count: 1, animatedInput: true, above: true, layers: [
    { image: 0, box: [125, 45, 250, 250], circle: true },
  ] },
  { key: "ikun_durian_head", keywords: ["榴莲坤头"], count: 1, animatedInput: true, layers: [
    { image: 0, box: [62, 93, 180, 180] },
  ] },
  { key: "mihoyo_funina_square_head", keywords: ["芙芙方形头像", "芙宁娜方形头像"], count: 1, animatedInput: true, tags: genshin, layers: [
    { image: 0, box: [60, 48, 1010, 1010] },
  ] },
  { key: "naruro_s_ninja", keywords: ["S忍", "s忍"], count: 1, animatedInput: true, layers: [
    { image: 0, box: [1, 1, 1000, 1000] },
  ] },
  { key: "pig_surrounded", keywords: ["被猪包围"], count: 1, animatedInput: true, layers: [
    { image: 0, box: [242, 458, 596, 596] },
  ] },
];

const transparent: Draw = () => {};

function drawPlacement({ box, angle, circle, brightness }: Placement, image: Image): Draw {
  return draw => {
    const [left, top, width, height] = box;
    draw.translate(left, top);
    if (angle) rotateExpanded(draw, width, height, angle);
    if (brightness !== undefined) draw.filter = `brightness(${brightness}%)`;
    draw.imageSmoothingQuality = "high";
    if (circle) {
      draw.beginPath();
      draw.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      draw.clip();
      if (circle === true) {
        const side = Math.min(image.width, image.height);
        draw.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2),
          side, side, 0, 0, width, height);
        return;
      }
    }
    draw.drawImage(image, 0, 0, width, height);
  };
}

function pixels(rgba: Uint8Array, width: number, height: number): Draw {
  const image = new ImageData(new Uint8ClampedArray(rgba), width, height);
  return draw => draw.putImageData(image, 0, 0);
}

function template(scene: AnyLiewAvatarScene): MemeTemplate {
  const minTexts = scene.defaultTexts?.length ?? 0;
  const maxTexts = scene.captions ? 1 : 0;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== scene.count || input.texts.length < minTexts || input.texts.length > maxTexts) {
      throw new Error("表情的图片或文字数量不符。");
    }
    const { signal } = context;
    const [art, captions] = await Promise.all([
      context.imageAsset(`anyliew/emoji/${scene.key}/images/0.${scene.jpegFrame ? "jpg" : "png"}`).then(loadImage),
      Promise.all((scene.captions ?? []).map(async caption => {
        const family = await anyLiewCaptionFonts(context, caption.font);
        const text = caption.text(input);
        const paint: Draw = draw => {
          const { rotation, box } = caption;
          if (rotation) {
            draw.translate(rotation.x, rotation.y);
            rotateExpanded(draw, box[2] - box[0], box[3] - box[1], rotation.degrees);
          }
          paintAnyLiewCaption(draw, box, text, family, caption);
        };
        return { paint, rotated: caption.rotation !== undefined };
      })),
    ]);
    const { width, height } = rgbaFrameDimensions(art.width, art.height);
    async function raster(images: readonly Image[], w: number, h: number, whiteBackground = false) {
      const scale = (paint: Draw): Draw => draw => {
        draw.scale(w / art.width, h / art.height);
        paint(draw);
      };
      const artwork = scale(draw => {
        draw.drawImage(art, 0, 0);
        for (const { paint, rotated } of captions) if (!rotated) paint(draw);
      });
      const rotatedCaptions = captions.filter(caption => caption.rotated).map(({ paint }) => scale(paint));
      const background = rotatedCaptions.length
        ? pixels(await renderMaskedRgba(w, h, artwork, rotatedCaptions, signal), w, h)
        : artwork;
      const placements = scene.layers.map(layer => scale(drawPlacement(layer, images[layer.image]!)));
      if (scene.above) return renderMaskedRgba(w, h, background, placements, signal, { whiteBackground });
      let foreground = background;
      let result!: Uint8Array;
      for (const [index, draw] of placements.entries()) {
        result = await renderMaskedRgba(w, h, transparent, [draw, foreground], signal,
          { whiteBackground: whiteBackground && index === placements.length - 1 });
        foreground = pixels(result, w, h);
      }
      return result;
    }
    if (!scene.animatedInput) {
      const images = await Promise.all(input.images.map(image => readMemeFirstImage(image, signal)));
      return jpg(art.width, art.height, pixels(await raster(images, width, height, true), width, height), signal);
    }
    const sequence = await readMemeImageSequence(input.images[0]!, signal);
    if (sequence.frames.length === 1) {
      const draw = pixels(await raster(sequence.frames, width, height, scene.jpegOutput), width, height);
      return scene.jpegOutput ? jpg(art.width, art.height, draw, signal) : (await renderExactPng(width, height, draw)).png;
    }
    return renderPythonGif({
      width, height, signal,
      frames: sequence.frames.map(value => ({ value, delayMs: Math.floor(sequence.averageDelayMs / 10) * 10 })),
      renderFrame: (image, w, h) => raster([image], w, h),
    });
  }
  return {
    info: { key: scene.key, keywords: scene.keywords, tags: scene.tags,
      params_type: { min_images: scene.count, max_images: scene.count, min_texts: minTexts, max_texts: maxTexts,
        default_texts: scene.defaultTexts, args_type: scene.argsType ?? null } },
    render,
    async preview(context) {
      const input = await previewImage(context.signal);
      return render({ images: Array.from({ length: scene.count }, () => input), texts: scene.defaultTexts ?? [], args: {} }, context);
    },
  };
}

export const anyliewStaticAvatarTemplates = [...scenes, ...anyliewAvatarCaptionScenes].map(template);
