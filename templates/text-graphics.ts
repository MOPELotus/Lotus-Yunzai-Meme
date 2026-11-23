// Template geometry from MemeCrafters/meme-generator v0.1.14.
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { googleLogoText, layoutMemeText, parseMemeBbcode, type MemeTextFamilies } from "./bbcode-text.ts";
import { jpg, paper, registerFont, registerMemeTypeface } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

const universalText = "在此处添加文字";
const googleText = "Google";

async function defaultFamilies(context: MemeTemplateContext, styled: boolean): Promise<MemeTextFamilies> {
  const [regular, cjk, bold, italic, boldItalic, boldCjk] = await Promise.all([
    registerMemeTypeface(context, "LiberationSans-Regular.ttf", "LotusMemeLiberationSans"),
    registerFont(context),
    styled && registerMemeTypeface(context, "LiberationSans-Bold.ttf", "LotusMemeLiberationSansBold"),
    styled && registerMemeTypeface(context, "LiberationSans-Italic.ttf", "LotusMemeLiberationSansItalic"),
    styled && registerMemeTypeface(context, "LiberationSans-BoldItalic.ttf", "LotusMemeLiberationSansBoldItalic"),
    styled && registerFont(context, true),
  ]);
  return {
    regular, cjk,
    bold: bold || undefined, italic: italic || undefined,
    boldItalic: boldItalic || undefined, boldCjk: boldCjk || undefined,
  };
}

async function universal(input: MemeTemplateInput, context: MemeTemplateContext) {
  const { signal } = context;
  const [sequence, families] = await Promise.all([readTransformSource(input, signal), defaultFamilies(context, true)]);
  const width = 500;
  const source = sequence.frames[0];
  const imageHeight = Math.max(1, Math.floor(source.height * width / source.width));
  const sections = (input.texts.length ? input.texts : [universalText]).map(text =>
    layoutMemeText(parseMemeBbcode(text, 45, "center"), 480, families));
  const height = imageHeight + sections.reduce((sum, section) => sum + section.height, 0) + 10;
  return renderTransformSequence(sequence, width, height, (draw, image) => {
    paper(draw, width, height);
    draw.drawImage(image, 0, 0, width, imageHeight);
    let y = imageHeight;
    for (const section of sections) {
      section.draw(draw, Math.trunc((width - section.width) / 2), y);
      y += section.height;
    }
  }, signal);
}

async function google(input: MemeTemplateInput, context: MemeTemplateContext) {
  const margin = 50;
  const text = layoutMemeText(googleLogoText(input.texts[0] ?? googleText), undefined, await defaultFamilies(context, false));
  const width = text.width + margin * 2;
  const height = text.height + margin * 2;
  return jpg(width, height, draw => {
    paper(draw, width, height);
    text.draw(draw, margin, margin);
  }, context.signal);
}

export const textGraphicsMemeTemplates: readonly MemeTemplate[] = [
  {
    info: { key: "universal", keywords: ["万能表情", "空白表情"], params_type: {
      min_images: 1, max_images: 1, min_texts: 1, max_texts: 10, default_texts: [universalText], args_type: null,
    } },
    render: universal,
    async preview(context) {
      const input = await transformPreviewInput(context);
      return universal({ ...input, texts: [universalText] }, context);
    },
  },
  {
    info: { key: "google", keywords: ["google"], params_type: {
      min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [googleText], args_type: null,
    } },
    render: google,
    preview: context => google({ images: [], texts: [googleText], args: {} }, context),
  },
];
