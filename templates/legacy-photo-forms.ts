import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Layouts and original artwork from MemeCrafters/meme-generator at 619fa105 (MIT).
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderPngWithoutFooter as renderPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { legacyCaptionShortcuts } from "../legacy-caption-shortcuts.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { layoutMemeText } from "./bbcode-text.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { screenProjection } from "./projective-transform.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont, registerMemeTypeface, type Draw } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence } from "./transforms.ts";

type Context = CanvasRenderingContext2D;
const artwork = (context: MemeTemplateContext, key: string, file = "0.png") => context.imageAsset(key + "/" + file).then(loadImage);
const params = (max_images = 1, default_texts: string[] = []) => ({
  min_images: 1, max_images, min_texts: 0, max_texts: 1, default_texts, args_type: null,
});
const bodyText = { wrap: false, paragraphMetrics: true } as const;

function userName(args: Record<string, unknown>, last = false) {
  const users: unknown = args.user_infos;
  const user: unknown = Array.isArray(users) ? users.at(last ? -1 : 0) : undefined;
  const name = user && typeof user === "object" && "name" in user ? user.name : undefined;
  return typeof name === "string" ? name : "";
}

function requiredName(input: MemeTemplateInput) {
  if (!input.texts.length && (!Array.isArray(input.args.user_infos) || !input.args.user_infos.length)) {
    throw new MemeTemplateFeedback($t("templates.legacy-photo-forms.text_f49def079b"));
  }
  return input.texts[0] ?? userName(input.args);
}

function square(draw: Context, image: Image, x: number, y: number, size: number, circle = false) {
  const side = Math.min(image.width, image.height);
  draw.save();
  if (circle) {
    draw.beginPath();
    draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    draw.clip();
  }
  draw.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2), side, side, x, y, size, size);
  draw.restore();
}

function fitted(draw: Context, image: Image, x: number, y: number, width: number, height: number,
  { inside = false, alignLeft = false, alignTop = false }: { inside?: boolean; alignLeft?: boolean; alignTop?: boolean } = {}) {
  const choose = inside ? Math.min : Math.max;
  const ratio = choose(width / image.width, height / image.height);
  const w = Math.max(1, Math.floor(image.width * ratio)), h = Math.max(1, Math.floor(image.height * ratio));
  draw.save();
  draw.beginPath();
  draw.rect(x, y, width, height);
  draw.clip();
  draw.drawImage(image, x + (alignLeft ? 0 : Math.trunc((width - w) / 2)),
    y + (alignTop ? 0 : Math.trunc((height - h) / 2)), w, h);
  draw.restore();
}

function rotation(width: number, height: number, degrees: number, expand = true) {
  const angle = -degrees * Math.PI / 180;
  const x = Math.abs(Math.cos(angle)), y = Math.abs(Math.sin(angle));
  const box = (original: number, extent: number) => Math.ceil((original + extent) / 2) - Math.floor((original - extent) / 2);
  const rightAngle = Math.abs(degrees) % 180 === 90;
  const [w, h] = !expand ? [width, height] : rightAngle ? [height, width] :
    [box(width, width * x + height * y), box(height, width * y + height * x)];
  return { w, h, draw(canvas: Context, left: number, top: number, paint: Draw) {
    canvas.save();
    canvas.translate(left + w / 2, top + h / 2);
    canvas.rotate(angle);
    canvas.translate(-width / 2, -height / 2);
    canvas.beginPath();
    canvas.rect(0, 0, width, height);
    canvas.clip();
    paint(canvas);
    canvas.restore();
  } };
}

const typeset = (text: string, size: number, family: string, color = "#000", stroke?: string, cjk = family) =>
  layoutMemeText([{ alignment: "left", spans: [{ text, size, color, stroke }] }], undefined, { regular: family, cjk });

const coupon: MemeTemplate = {
  info: { key: "coupon", keywords: ["兑换券"], params_type: params() },
  async render({ images, texts, args }, context) {
    const [art, avatar, font] = await Promise.all([
      artwork(context, "coupon"), readMemeFirstImage(images[0]!, context.signal), registerFont(context),
    ]);
    const text = (texts[0] ?? userName(args) + $t("templates.legacy-photo-forms.text_aec31b2f85")) + $t("templates.legacy-photo-forms.text_67f1165c88");
    return jpg(art.width, art.height, draw => {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(art, 0, 0);
      rotation(60, 60, 22).draw(draw, 164, 85, canvas => square(canvas, avatar, 0, 0, 60, true));
      rotation(250, 100, 22).draw(draw, 94, 108, canvas => {
        drawFittedText(canvas, [0, 0, 250, 100], text, font, 15, 30, "center", "#000", bodyText);
      });
    }, context.signal);
  },
};

const interview: MemeTemplate = {
  info: { key: "interview", keywords: ["采访"], params_type: params(2, [$t("templates.legacy-photo-forms.text_8eb4d3d551")]) },
  async render({ images, texts }, context) {
    const [host, guest, microphone, font] = await Promise.all([
      images.length === 2 ? readMemeFirstImage(images[0]!, context.signal) : artwork(context, "interview", "huaji.png"),
      readMemeFirstImage(images.at(-1)!, context.signal),
      artwork(context, "interview", "microphone.png"),
      registerFont(context),
    ]);
    return jpg(600, 310, draw => {
      paper(draw, 600, 310);
      draw.drawImage(microphone, 330, 103);
      square(draw, host, 419, 40, 124);
      square(draw, guest, 57, 40, 124);
      drawFittedText(draw, [20, 200, 580, 310], texts[0] ?? $t("templates.legacy-photo-forms.text_8eb4d3d551"), font, 20, 50, "center", "#000", bodyText);
    }, context.signal);
  },
};

const makeFriend: MemeTemplate = {
  info: { key: "make_friend", keywords: ["交个朋友"], params_type: params() },
  async render(input, context) {
    const name = requiredName(input);
    const [art, avatar, family] = await Promise.all([
      artwork(context, "make_friend"), readMemeFirstImage(input.images[0]!, context.signal), registerFont(context),
    ]);
    const height = Math.max(1, Math.floor(1000 * avatar.height / avatar.width));
    const scaled = Math.max(1, Math.floor(250 * avatar.height / avatar.width));
    const label = typeset(name, 20, family, "#fff");
    if (label.width > 230) throw new MemeTemplateFeedback($t("templates.legacy-photo-forms.text_002fc2fab2"));
    return jpg(1000, height, draw => {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(avatar, 0, 0, 1000, height);
      rotation(250, scaled, 9).draw(draw, 743, height - 155, canvas => canvas.drawImage(avatar, 0, 0, 250, scaled));
      rotation(55, 55, 9).draw(draw, 836, height - 278, canvas => square(canvas, avatar, 0, 0, 55));
      draw.drawImage(art, 0, height - 1000);
      if (label.width && label.height) rotation(label.width, label.height, 9).draw(draw, 710, height - 308, canvas => label.draw(canvas, 0, 0));
    }, context.signal);
  },
};

const sitStill: MemeTemplate = {
  info: { key: "sit_still", keywords: ["坐得住", "坐的住"], params_type: params() },
  async render({ images, texts, args }, context) {
    const name = texts[0] ?? userName(args);
    const [art, avatar, font] = await Promise.all([
      artwork(context, "sit_still"), readMemeFirstImage(images[0]!, context.signal), name ? registerFont(context) : "",
    ]);
    return jpg(art.width, art.height, draw => {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(art, 0, 0);
      if (name) drawFittedText(draw, [100, 170, 600, 330], name, font, 30, 75, "center", "#000", { ...bodyText, vertical: "bottom" });
      rotation(150, 150, -10).draw(draw, 268, 344, canvas => square(canvas, avatar, 0, 0, 150, true));
    }, context.signal);
  },
};

const whyHaveHands: MemeTemplate = {
  info: { key: "why_have_hands", keywords: ["为什么要有手"], params_type: params() },
  async render(input, context) {
    const name = requiredName(input);
    const [art, avatar, font] = await Promise.all([
      artwork(context, "why_have_hands"), readMemeFirstImage(input.images[0]!, context.signal), registerFont(context, true),
    ]);
    return jpg(art.width, art.height, draw => {
      paper(draw, art.width, art.height);
      rotation(250, 250, 15, false).draw(draw, 1001, 668, canvas => fitted(canvas, avatar, 0, 0, 250, 250));
      fitted(draw, avatar, 275, 1100, 250, 170);
      draw.drawImage(art, 0, 0);
      square(draw, avatar, 350, 670, 250, true);
      fitted(draw, avatar, 1100, 1060, 300, 400, { inside: true, alignLeft: true });
      rotation(600, 100, -15).draw(draw, 75, 825, canvas => {
        drawFittedText(canvas, [0, 0, 600, 100], $t("templates.legacy-photo-forms.text_f93b005cf8", { "name": name }), font, 30, 70, "left", "#000", bodyText);
      });
      drawFittedText(draw, [840, 960, 1440, 1060], $t("templates.legacy-photo-forms.text_7910650aa4", { "name": name }), font, 30, 70, "center", "#000", bodyText);
      drawFittedText(draw, [50, 1325, 650, 1475], $t("templates.legacy-photo-forms.text_edb0d8171e", { "name": name }), font, 30, 90, "center", "#000", { ...bodyText, vertical: "top" });
      drawFittedText(draw, [700, 1340, 1075, 1490], $t("templates.legacy-photo-forms.text_bfc56e260b", { "name": name }), font, 30, 70, "left", "#000", { ...bodyText, wrap: true, blockAlignment: "center" });
    }, context.signal);
  },
};

const spineCorners = [[0, 108], [1092, 0], [1023, 1134], [29, 1134]] as const;
const spine = screenProjection(1000, 1100, spineCorners);
const readBook: MemeTemplate = {
  info: { key: "read_book", keywords: ["看书"], params_type: params(1, [$t("templates.legacy-photo-forms.text_d6822a7f2b")]) },
  async render({ images, texts }, context) {
    const [art, avatar, bold] = await Promise.all([
      artwork(context, "read_book"), readMemeFirstImage(images[0]!, context.signal), registerFont(context, true),
    ]);
    const text = texts[0] ?? $t("templates.legacy-photo-forms.text_d6822a7f2b");
    const lines = text.split(/\r\n|[\r\n\v\f\u001c-\u001e\u0085\u2028\u2029]/u);
    if (lines.at(-1) === "") lines.pop();
    const parts = Array.from(lines.join(" "));
    if (parts.length > 60) throw new MemeTemplateFeedback($t("templates.legacy-photo-forms.text_002fc2fab2"));
    const pieces = parts.map(char => {
      const glyph = typeset(char, 150, bold, "#fff");
      const latin = /^[a-zA-Z0-9\s]$/u.test(char);
      const angle = rotation(glyph.width, glyph.height, -90);
      if (latin) return { w: angle.w, h: angle.h, draw: angle.draw, paint: (canvas: Context) => glyph.draw(canvas, 0, 0) };
      return {
        w: glyph.width, h: Math.max(1, glyph.height - 40),
        draw(canvas: Context, x: number, y: number) { glyph.draw(canvas, x, y - 40); },
      };
    });
    const width = Math.max(1, ...pieces.map(piece => piece.w));
    const height = pieces.reduce((sum, value) => sum + value.h, 0);
    if (width > 265 || height > 3000) throw new MemeTemplateFeedback($t("templates.legacy-photo-forms.text_002fc2fab2"));
    const scale = Math.min(1, 780 / Math.max(1, height));
    const captionWidth = Math.max(1, Math.floor(width * scale));
    const captionHeight = Math.max(1, Math.floor(height * scale));
    const caption = rotation(captionWidth, captionHeight, 3);
    const mounted = await renderMaskedRaster(art.width, art.height, draw => {
      draw.translate(1138, 1172);
      draw.beginPath();
      draw.rect(0, 0, 1092, 1134);
      draw.clip();
      draw.setTransform(draw.getTransform().multiply(spine));
      fitted(draw, avatar, 0, 0, 1000, 1100, { alignTop: true });
    }, [draw => draw.drawImage(art, 0, 0)], context.signal, { whiteBackground: true });
    const cover = await loadImage(mounted);
    return jpg(art.width, art.height, draw => {
      draw.drawImage(cover, 0, 0);
      if (!height) return;
      caption.draw(draw, 870 + Math.floor((240 - caption.w) / 2), 1500 + Math.floor((780 - caption.h) / 2), canvas => {
        canvas.scale(captionWidth / width, captionHeight / height);
        let top = 0;
        for (const piece of pieces) {
          const left = Math.floor((width - piece.w) / 2);
          canvas.save();
          canvas.beginPath();
          canvas.rect(left, top, piece.w, piece.h);
          canvas.clip();
          if ("paint" in piece && piece.paint) piece.draw(canvas, left, top, piece.paint);
          else piece.draw(canvas, left, top);
          canvas.restore();
          top += piece.h;
        }
      });
    }, context.signal);
  },
};

const oshiNoKo: MemeTemplate = {
  info: {
    key: "oshi_no_ko", keywords: ["我推的网友"], tags: ["我推的孩子"], shortcuts: legacyCaptionShortcuts("oshi_no_ko"),
    params_type: params(1, [$t("templates.legacy-photo-forms.text_e1ca33b2d2")]),
  },
  async render(input, context) {
    const [source, background, foreground, first, last, serif, fallback] = await Promise.all([
      readTransformSource(input, context.signal), artwork(context, "oshi_no_ko", "background.png"), artwork(context, "oshi_no_ko", "foreground.png"),
      artwork(context, "oshi_no_ko", "text1.png"), artwork(context, "oshi_no_ko", "text2.png"),
      registerMemeTypeface(context, "NotoSerifSC-Regular.otf", "LotusMemeNotoSerifSC"), registerFont(context),
    ]);
    const label = typeset(input.texts[0] ?? $t("templates.legacy-photo-forms.text_e1ca33b2d2"), 150, serif, "#000", "#fff", fallback);
    const nameWidth = Math.floor(label.width * first.height / Math.max(1, label.height));
    if (nameWidth > 800) throw new MemeTemplateFeedback($t("templates.legacy-photo-forms.text_002fc2fab2"));
    const textWidth = first.width + last.width + nameWidth;
    const captionHeight = Math.floor(last.height * 663 / textWidth);
    function paint(draw: Context, avatar: Image) {
      draw.drawImage(background, 0, 0);
      fitted(draw, avatar, 0, 0, 681, 692);
      draw.save();
      draw.translate(9, 102 - Math.floor(captionHeight / 2));
      draw.scale(663 / textWidth, captionHeight / last.height);
      draw.drawImage(first, 0, 0);
      draw.drawImage(last, first.width + nameWidth, 0);
      if (nameWidth && label.height) {
        draw.translate(first.width, 0);
        draw.scale(nameWidth / label.width, first.height / label.height);
        label.draw(draw, 0, 0);
      }
      draw.restore();
      draw.drawImage(foreground, 0, 0);
    }
    if (source.frames.length > 1) return renderTransformSequence(source, background.width, background.height, paint, context.signal);
    const { png } = await renderPng(background.width, background.height, draw => paint(draw, source.frames[0]));
    return png;
  },
};

function preview(template: MemeTemplate): MemeTemplate {
  return {
    ...template,
    async preview(context) {
      return template.render({ images: [await previewImage(context.signal)], texts: [], args: { user_infos: [{ name: $t("templates.legacy-photo-forms.text_e1ca33b2d2") }] } }, context);
    },
  };
}

export const legacyPhotoFormTemplates = [readBook, coupon, interview, makeFriend, oshiNoKo, sitStill, whyHaveHands].map(preview);
