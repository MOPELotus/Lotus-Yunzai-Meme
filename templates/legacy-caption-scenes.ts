import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { Canvas, loadImage, type Image } from "skia-canvas";
import { renderPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { legacyCaptionShortcuts } from "../legacy-caption-shortcuts.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { coverImage } from "./photo-insets.ts";
import { drawFittedText, jpg, paper, registerFont, registerMemeTypeface, type Draw } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

type Size = readonly [number, number];
type Box = readonly [number, number, number, number];
type Placement = readonly [left: number, top: number, width: number, height: number];

interface CaptionScene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly defaultText: string;
  readonly asset?: string;
  readonly output: "jpg" | "jpg-or-gif" | "png-or-gif";
  readonly render: (art: Image, first: Image, text: string, font: string) => {
    readonly size: Size;
    readonly paint: (draw: Parameters<Draw>[0], photo: Image) => void;
  };
  readonly specializedFont?: "bold" | "cartoon";
  readonly defaultForGender?: (gender: unknown) => string;
  readonly tags?: readonly string[];
}

const assetPrefix = "python/meme_generator/memes";
const safeCaption = $t("templates.legacy-caption-scenes.text_84bab84f64");
const causedCaption = $t("templates.legacy-caption-scenes.text_822828a7c9");

function caption(draw: Parameters<Draw>[0], box: Box, text: string, font: string, min: number, max: number,
  options: { readonly center?: boolean; readonly wrap?: boolean; readonly outline?: boolean } = {}) {
  drawFittedText(draw, box, text, font, min, max, options.center ? "center" : "left", options.outline ? "white" : "black", {
    wrap: options.wrap ?? false, paragraphMetrics: true, blockAlignment: "center",
    stroke: options.outline ? ["black", 0.06] : undefined,
  });
}

function overlayScene(art: Image, image: Placement, text: string, font: string, box: Box, minimum: number, maximum: number,
  options: { readonly width?: number; readonly above?: boolean; readonly wrap?: boolean; readonly center?: boolean; readonly outline?: boolean } = {}) {
  const width = options.width ?? art.width;
  const height = Math.floor(art.height * width / art.width);
  return {
    size: [width, height] as const,
    paint(draw: Parameters<Draw>[0], photo: Image) {
      if (!options.above) coverImage(photo, image, false)(draw);
      draw.drawImage(art, 0, 0, width, height);
      if (options.above) coverImage(photo, image, false)(draw);
      caption(draw, box, text, font, minimum, maximum, options);
    },
  };
}

const scenes: readonly CaptionScene[] = [
  {
    key: "teach", keywords: ["讲课", "敲黑板"], defaultText: $t("templates.legacy-caption-scenes.text_b02d3dbfd1"), tags: ["井之上泷奈", "莉可丽丝"], output: "jpg-or-gif",
    render(art, _first, text, font) {
      const height = Math.floor(art.height * 960 / art.width);
      return overlayScene(art, [313, 60, 550, 395], text, font, [10, height - 80, 950, height - 5], 12, 50,
        { width: 960, outline: true });
    },
  },
  {
    key: "time_to_go", keywords: ["该走了"], defaultText: $t("templates.legacy-caption-scenes.text_43b51d22b4"), output: "jpg",
    render: (art, _first, text, font) => overlayScene(art, [230, 82, 105, 105], text, font, [20, 232, 330, 312], 20, 40),
  },
  {
    key: "safe_sense", keywords: ["安全感"], defaultText: safeCaption, output: "jpg",
    defaultForGender: gender => safeCaption.replace("{ta}", gender === "male" ? $t("templates.legacy-caption-scenes.text_8b7b91e000") : gender === "female" ? $t("templates.legacy-caption-scenes.text_2ab425e0c6") : $t("templates.legacy-caption-scenes.text_7e9260e925")),
    render: (art, _first, text, font) => overlayScene(art, [215, 135, 215, 343], text, font, [30, 0, 400, 130], 12, 50,
      { above: true, wrap: true, center: true }),
  },
  {
    key: "look_this_icon", keywords: ["看图标"], defaultText: $t("templates.legacy-caption-scenes.text_05f173fdc0"), asset: "nmsl.png",
    specializedFont: "bold", output: "jpg-or-gif",
    render: (art, _first, text, font) => overlayScene(art, [599, 403, 515, 515], text, font, [0, 933, 1170, 1143], 50, 100,
      { center: true }),
  },
  {
    key: "caused_by_this", keywords: ["这个引起的"], defaultText: causedCaption, output: "png-or-gif",
    render(art, _first, text, font) {
      const measure = new Canvas(1, 1).getContext("2d");
      measure.font = `55px ${font}`;
      const left = $t("templates.legacy-caption-scenes.text_c84459f072"), right = $t("templates.legacy-caption-scenes.text_6f185f6b17");
      const leftWidth = Math.ceil(measure.measureText(left).width);
      const rightWidth = Math.ceil(measure.measureText(right).width);
      return {
        size: [art.width, art.height],
        paint(draw, photo) {
          paper(draw, art.width, art.height);
          coverImage(photo, [122, 9, 550, 360], false)(draw);
          draw.drawImage(art, 0, 0);
          caption(draw, [10, 840, leftWidth + 12, 934], left, font, 55, 55);
          caption(draw, [art.width - rightWidth - 12, 840, art.width - 10, 934], right, font, 55, 55);
          caption(draw, [leftWidth + 20, 760, art.width - rightWidth - 20, 1000], text, font, 10, 60, { wrap: true });
        },
      };
    },
  },
  {
    key: "thermometer_gun", keywords: ["体温枪"], defaultText: $t("templates.legacy-caption-scenes.text_e24154596e"), specializedFont: "cartoon", output: "png-or-gif",
    render(art, first, text, font) {
      const { width, height } = first;
      const side = Math.min(width, height);
      return {
        size: [width, height],
        paint(draw, photo) {
          draw.drawImage(photo, 0, 0);
          draw.save();
          draw.translate(width - side, height - side);
          draw.scale(side / art.width, side / art.height);
          draw.drawImage(art, 0, 0);
          caption(draw, [555, 240, 755, 365], text, font, 15, 60, { center: true, wrap: true });
          draw.restore();
        },
      };
    },
  },
];

function sceneFont(context: MemeTemplateContext, font: CaptionScene["specializedFont"]) {
  if (font === "cartoon") return registerMemeTypeface(context, "FZKATJW.ttf", "LotusMemeKuaiLe");
  return registerFont(context, font === "bold");
}

function captionScene(scene: CaptionScene): MemeTemplate {
  const template: MemeTemplate = {
    info: {
      key: scene.key, keywords: scene.keywords, tags: scene.tags, shortcuts: scene.key === "caused_by_this" ? legacyCaptionShortcuts(scene.key) : undefined,
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [scene.defaultText], args_type: null },
    },
    async render(input, context) {
      const { signal } = context;
      const [art, font] = await Promise.all([
        context.imageAsset(`${assetPrefix}/${scene.key}/images/${scene.asset ?? "0.png"}`).then(loadImage),
        sceneFont(context, scene.specializedFont),
      ]);
      const user = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] as { gender?: unknown } | undefined : undefined;
      const supplied = input.texts[0];
      const text = supplied === undefined || supplied === scene.defaultText
        ? scene.defaultForGender?.(user?.gender) ?? scene.defaultText : supplied;
      if (scene.output === "jpg") {
        const first = await readMemeFirstImage(input.images[0]!, signal);
        const { size, paint } = scene.render(art, first, text, font);
        return jpg(...size, draw => paint(draw, first), signal);
      }
      const sequence = await readTransformSource(input, signal);
      const first = sequence.frames[0];
      const { size, paint } = scene.render(art, first, text, font);
      if (scene.output === "png-or-gif" && sequence.frames.length === 1) {
        signal.throwIfAborted();
        const { png } = await renderPng(...size, draw => paint(draw, first));
        signal.throwIfAborted();
        return png;
      }
      return renderTransformSequence(sequence, ...size, paint, signal);
    },
    async preview(context) {
      return template.render(await transformPreviewInput(context), context);
    },
  };
  return template;
}

export const legacyCaptionSceneTemplates = scenes.map(captionScene);
