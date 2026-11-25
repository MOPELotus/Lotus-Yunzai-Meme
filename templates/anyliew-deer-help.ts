import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { jpg, previewImage } from "./template-layout.ts";

const slots = [
  [605, 200, 180, 180],
  [300, 190, 180, 180],
] as const;

async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
  if (images.length !== 2 || texts.length) throw new Error($t("templates.anyliew-deer-help.text_7ccbb96dfc"));
  const { signal } = context;
  const [human, deer, background] = await Promise.all([
    readMemeFirstImage(images[1]!, signal),
    readMemeFirstImage(images[0]!, signal),
    context.imageAsset("anyliew/emoji/deer_help/images/0.jpg").then(loadImage),
  ]);
  return jpg(background.width, background.height, draw => {
    draw.drawImage(background, 0, 0);
    for (const [index, avatar] of [human, deer].entries()) {
      const slot = slots[index]!;
      const [x, y, width, height] = slot;
      draw.save();
      draw.beginPath();
      draw.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      draw.clip();
      drawAvatar(draw, avatar, { slot, fit: "square" }, true);
      draw.restore();
    }
  }, signal);
}

// The older two-avatar registration in AnyLiew at 5ccd78638b9a5272472659d411fba9a408705a92.
export const anyliewDeerHelpTemplate: MemeTemplate = {
  info: {
    key: "deer_help", keywords: ["帮鹿", "帮🦌"],
    params_type: { min_images: 2, max_images: 2, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  render,
  async preview(context) {
    const image = await previewImage(context.signal);
    return render({ images: [image, image], texts: [], args: {} }, context);
  },
};
