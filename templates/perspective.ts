import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Screen coordinates follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng, renderPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput, MemeTemplateShortcut } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { drawFittedText, jpg, previewImage, registerFont } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence } from "./transforms.ts";

type Point = readonly [x: number, y: number];

interface Caption {
  readonly text: string;
  readonly useDefault?: boolean;
  readonly box: readonly [left: number, top: number, right: number, bottom: number];
  readonly fontSize: readonly [minimum: number, maximum: number];
  readonly fill: string;
  readonly stroke?: readonly [color: string, ratio: number];
  readonly bold?: boolean;
  readonly wrap?: boolean;
}

interface ScreenTemplate {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly screen: readonly [width: number, height: number];
  readonly corners: ProjectiveQuad;
  readonly position: Point;
  readonly png?: boolean;
  readonly firstFrameOnly?: boolean;
  readonly square?: boolean;
  readonly circle?: boolean;
  readonly brightness?: number;
  readonly avatarAboveArt?: boolean;
  readonly rotation?: number;
  readonly caption?: Caption;
  readonly shortcuts?: readonly MemeTemplateShortcut[];
}

const screens: readonly ScreenTemplate[] = [
  { key: "dog_of_vtb", keywords: ["管人痴"], screen: [600, 450], corners: [[0, 0], [579, 0], [584, 430], [5, 440]], position: [97, 32] },
  { key: "prpr", keywords: ["舔", "舔屏", "prpr"], screen: [330, 330], corners: [[0, 19], [236, 0], [287, 264], [66, 351]], position: [56, 284] },
  { key: "smash", keywords: ["砸"], screen: [800, 500], corners: [[1, 237], [826, 1], [832, 508], [160, 732]], position: [-136, -81] },
  { key: "cover_face", keywords: ["捂脸"], screen: [450, 450], corners: [[15, 15], [448, 0], [445, 456], [0, 465]],
    position: [120, 150], firstFrameOnly: true, square: true },
  { key: "haruhi_raise", keywords: ["凉宫春日举"], tags: ["凉宫春日"], screen: [250, 180],
    corners: [[0, 51], [204, 0], [211, 147], [17, 217]], position: [429, 79], png: true },
  { key: "konata_watch", keywords: ["泉此方看"], tags: ["泉此方", "幸运星"], screen: [270, 200],
    corners: [[0, 1], [275, 0], [273, 202], [2, 216]], position: [50, 188], png: true },
  { key: "genshin_start", keywords: ["原神启动"], screen: [600, 330],
    corners: [[0, 116], [585, 0], [584, 319], [43, 385]], position: [412, 121],
    caption: { text: $t("templates.perspective.text_f114be37d4"), box: [100, 1471, 980, 1621], fontSize: [70, 100], fill: "white", stroke: ["black", 0.05] },
    shortcuts: [{ key: "(?P<text>\\S+启动[!！]?)", args: ["{text}"], humanized: $t("templates.perspective.text_aaea7aecc6") }] },
  { key: "play_game", keywords: ["玩游戏"], screen: [220, 160], corners: [[0, 5], [227, 0], [216, 150], [0, 165]],
    position: [161, 117], rotation: 9,
    caption: { text: $t("templates.perspective.text_966991231f"), useDefault: true, box: [20, 433, 506, 503], fontSize: [25, 40], fill: "black", stroke: ["white", 0.06] } },
  { key: "this_chicken", keywords: ["这是鸡", "🐔"], screen: [640, 640], corners: [[507, 0], [940, 351], [383, 625], [0, 256]],
    position: [201, 201], firstFrameOnly: true,
    caption: { text: $t("templates.perspective.text_2b015f51fb"), useDefault: true, box: [0, 900, 1440, 1080], fontSize: [40, 80], fill: "white", stroke: ["black", 1 / 15] } },
  { key: "incivilization", keywords: ["不文明"], screen: [150, 150], corners: [[0, 20], [154, 0], [164, 153], [22, 180]],
    position: [137, 151], firstFrameOnly: true, square: true, circle: true, brightness: 0.8, avatarAboveArt: true,
    caption: { text: $t("templates.perspective.text_afce589776"), useDefault: true, box: [57, 42, 528, 117], fontSize: [20, 50], fill: "black", bold: true, wrap: true } },
];

function rotatedExtent(width: number, height: number, radians: number): Point {
  const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
  const spanX = width * cosine + height * sine, spanY = width * sine + height * cosine;
  return [Math.ceil((width + spanX) / 2) - Math.floor((width - spanX) / 2),
    Math.ceil((height + spanY) / 2) - Math.floor((height - spanY) / 2)];
}

function projectedAvatar(definition: ScreenTemplate) {
  const { screen: [width, height], corners, position: [x, y] } = definition;
  const matrix = screenProjection(width, height, corners);
  const xs = corners.map(([left]) => left), ys = corners.map(([, top]) => top);
  const projectedWidth = Math.max(...xs) - Math.min(...xs);
  const projectedHeight = Math.max(...ys) - Math.min(...ys);
  const radians = -(definition.rotation ?? 0) * Math.PI / 180;
  const [rotatedWidth, rotatedHeight] = rotatedExtent(projectedWidth, projectedHeight, radians);
  return (draw: CanvasRenderingContext2D, image: Image) => {
    draw.save();
    draw.translate(x, y);
    if (radians) {
      draw.translate(rotatedWidth / 2, rotatedHeight / 2);
      draw.rotate(radians);
      draw.translate(-projectedWidth / 2, -projectedHeight / 2);
    }
    // The old warp clips its output at the original zero-based bounds, even when xMin/yMin are nonzero.
    draw.beginPath();
    draw.rect(0, 0, projectedWidth, projectedHeight);
    draw.clip();
    draw.setTransform(draw.getTransform().multiply(matrix));
    draw.beginPath();
    if (definition.circle) draw.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    else draw.rect(0, 0, width, height);
    draw.clip();
    draw.imageSmoothingQuality = "high";
    if (definition.brightness !== undefined) draw.filter = `brightness(${definition.brightness})`;
    if (definition.square) {
      const square = Math.min(image.width, image.height);
      draw.drawImage(image, Math.floor((image.width - square) / 2), Math.floor((image.height - square) / 2), square, square,
        0, 0, width, height);
    } else {
      const ratio = Math.max(width / image.width, height / image.height);
      const scaledWidth = Math.max(width, Math.trunc(image.width * ratio));
      const scaledHeight = Math.max(height, Math.trunc(image.height * ratio));
      draw.drawImage(image, Math.trunc((width - scaledWidth) / 2), Math.trunc((height - scaledHeight) / 2), scaledWidth, scaledHeight);
    }
    draw.restore();
  };
}

async function captionArtwork(art: Image, caption: Caption, text: string, context: MemeTemplateContext) {
  const font = await registerFont(context, caption.bold);
  const { width, height } = art;
  const { fontSize, fill, stroke, wrap = false } = caption;
  const { png } = await renderExactPng(width, height, (draw) => {
    draw.drawImage(art, 0, 0);
    drawFittedText(draw, caption.box, text, font, ...fontSize, "center", fill, { wrap, stroke });
  });
  context.signal.throwIfAborted();
  return loadImage(png);
}

function screenTemplate(definition: ScreenTemplate): MemeTemplate {
  const { key, keywords, tags, firstFrameOnly, png, caption, shortcuts, avatarAboveArt } = definition;
  const drawAvatar = projectedAvatar(definition);
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== 1 || input.texts.length > (caption ? 1 : 0)) throw new Error($t("templates.perspective.text_44af2dbe33"));
    const { signal } = context;
    const [background, source] = await Promise.all([
      context.imageAsset(`${key}/0.png`).then(loadImage),
      firstFrameOnly
        ? readMemeFirstImage(input.images[0]!, signal).then(image => ({ frames: [image] as const, averageDelayMs: 0 }))
        : readTransformSource(input, signal),
    ]);
    const captionText = input.texts[0] ?? (caption?.useDefault ? caption.text : "");
    const art = caption && captionText ? await captionArtwork(background, caption, captionText, context) : background;
    if (source.frames.length === 1) {
      const { width, height } = art;
      const background = (canvas: CanvasRenderingContext2D) => canvas.drawImage(art, 0, 0);
      const avatar = (canvas: CanvasRenderingContext2D) => drawAvatar(canvas, source.frames[0]);
      const masked = await renderMaskedRaster(width, height, avatarAboveArt ? background : avatar,
        [avatarAboveArt ? avatar : background], signal, { whiteBackground: !png });
      const image = await loadImage(masked);
      if (!png) return jpg(width, height, canvas => canvas.drawImage(image, 0, 0), signal);
      return (await renderPng(width, height, canvas => canvas.drawImage(image, 0, 0))).png;
    }
    return renderTransformSequence(source, art.width, art.height, (canvas, image) => {
      drawAvatar(canvas, image);
      canvas.drawImage(art, 0, 0);
    }, signal);
  }
  return {
    info: { key, keywords, tags, shortcuts, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: caption ? 1 : 0, default_texts: caption ? [caption.text] : [],
    } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: caption ? [caption.text] : [], args: {} }, context);
    },
  };
}

export const perspectiveMemeTemplates = screens.map(screenTemplate);
