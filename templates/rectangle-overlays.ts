import { loadImage } from "skia-canvas";
import type { MemeTemplate, MemeTemplateInput, MemeTemplateContext, MemeTemplateShortcut } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { previewImage, rgbaFrameDimensions, type Draw } from "./template-layout.ts";

interface OverlayOptions {
  readonly tags?: readonly string[];
  readonly shortcuts?: readonly MemeTemplateShortcut[];
  readonly radius?: number;
  readonly rotation?: number;
}

type Overlay = readonly [
  key: string, keywords: readonly string[], box: readonly [left: number, top: number, width: number, height: number],
  options?: OverlayOptions,
];

const genshin = { tags: ["米哈游", "原神"] } as const;
const yuzu = { tags: ["柚子社"] } as const;
const params = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };
const overlays: readonly Overlay[] = [
  ["deer_time", ["鹿管时间"], [281, 222, 305, 305]],
  ["doro_group_photo", ["doro合影", "Doro合影", "桃乐丝合影"], [112, 430, 407, 407]],
  ["error3b", ["30亿error", "三十亿报错"], [0, 0, 1024, 1024], { radius: 200 }],
  ["mihoyo_columbina_hug", ["少女抱", "哥伦比娅抱", "月神抱"], [510, 470, 467, 432], { tags: ["原神", "米哈游"] }],
  ["mihoyo_ineffa_droid", ["人机"], [96, 79, 165, 135], genshin],
  ["mihoyo_senior_phone", ["米学长手机"], [533, 495, 140, 210], genshin],
  ["mixue", ["蜜雪冰城"], [380, 140, 270, 230]],
  ["nakano_ltsuki", ["中野五月"], [125, 130, 195, 195]],
  ["nakano_nino", ["中野二乃"], [110, 120, 210, 210]],
  ["naruro_resurrection", ["复活", "立即复活"], [1, 1, 339, 286], genshin],
  ["naruto_bagua_seal", ["八卦封印"], [308, 330, 391, 368]],
  ["pregnancy_test", ["验孕棒"], [1, 1, 640, 640]],
  ["slam_table", ["砸桌"], [295, 13, 417, 417]],
  ["yuzu_soft_ciallo", ["ciallo", "ciallo~"], [364, 363, 355, 295], {
    ...yuzu,
    // The old shortcut accepts exactly these two suffixes, ignoring case.
    shortcuts: [
      { key: "ciallo", args: [], humanized: "ciallo" },
      ...["★", "☆"].map(star => ({ key: `ciallo～(∠・ω< )⌒${star}`, args: [], humanized: "ciallo～(∠・ω< )⌒★" })),
    ],
  }],
  ["yuzu_soft_ignore", ["视若无睹"], [95, 42, 340, 204], yuzu],
  ["baby", ["宝宝", "BB", "bb", "baby", "Baby"], [140, 480, 235, 235], { rotation: -8 }],
  ["drumstick", ["🍗", "鸡腿"], [150, 450, 339, 286], { ...genshin, rotation: -10 }],
  ["izumi_sagiri_painting", ["和泉纱雾画画"], [350, 1423, 1270, 730], { rotation: -10 }],
  ["mygo_sakiko_togawa", ["丰川祥子", "祥子", "豊川祥子"], [105, 70, 150, 150], { rotation: -5 }],
  ["pineapples", ["🍍", "菠萝头"], [240, 576, 320, 280], { ...genshin, rotation: -15 }],
  ["scissor_seven_head", ["伍六七", "阿七"], [100, 120, 200, 200], { rotation: -4 }],
  ["yuzu_soft_murasame_ipad", ["丛雨平板"], [280, 475, 520, 350], { ...yuzu, rotation: -3 }],
];

// Image.rotate(expand=True) encloses the rotated corners in whole pixels,
// then uses the center of that expanded box to place the rotated input.
function expandedCenter(length: number, extent: number) {
  return (Math.ceil((length + extent) / 2) - Math.floor((length - extent) / 2)) / 2;
}

export const rectangleOverlayTemplates: readonly MemeTemplate[] = overlays.map(
  ([key, keywords, [left, top, avatarWidth, avatarHeight], { tags = [], shortcuts, radius, rotation = 0 } = {}]) => {
    const radians = -rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
    const pivotX = left + expandedCenter(avatarWidth, avatarWidth * cos + avatarHeight * sin);
    const pivotY = top + expandedCenter(avatarHeight, avatarWidth * sin + avatarHeight * cos);

    async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
      if (input.images.length !== 1 || input.texts.length) throw new Error("表情需要一张图片。");
      const { signal } = context;
      signal.throwIfAborted();
      const [source, frame] = await Promise.all([
        readMemeImageSequence(input.images[0]!, signal),
        context.imageAsset(`anyliew/emoji/${key}/images/0.png`).then(loadImage),
      ]);
      const { width, height, scale } = rgbaFrameDimensions(frame.width, frame.height);
      const base: Draw = () => {};
      const outline: Draw = canvas => canvas.drawImage(frame, 0, 0, frame.width * scale, frame.height * scale);
      const clip: Draw | undefined = radius === undefined ? undefined : canvas => {
        canvas.roundRect(0, 0, frame.width * scale, frame.height * scale, radius * scale);
        canvas.fill();
      };
      function layers(avatar: (typeof source.frames)[number]): readonly Draw[] {
        return [canvas => {
          canvas.imageSmoothingQuality = "high";
          if (rotation) {
            canvas.translate(pivotX * scale, pivotY * scale);
            canvas.rotate(radians);
            canvas.drawImage(avatar, -avatarWidth * scale / 2, -avatarHeight * scale / 2, avatarWidth * scale, avatarHeight * scale);
          } else {
            canvas.drawImage(avatar, left * scale, top * scale, avatarWidth * scale, avatarHeight * scale);
          }
        }, outline];
      }
      if (source.frames.length === 1) {
        return renderMaskedRaster(width, height, base, layers(source.frames[0]), signal, { clip });
      }
      assertMemeGifDimensions(width, height, source.frames.length);
      const rendered = [];
      for (const avatar of source.frames) {
        const rgba = await renderMaskedRgba(width, height, base, layers(avatar), signal, { clip });
        rendered.push({ rgba, delayMs: source.averageDelayMs });
      }
      return encodeMemeGif(width, height, rendered, signal);
    }
    return {
      info: { key, keywords, tags, ...(shortcuts && { shortcuts }), params_type: params },
      render,
      async preview(context: MemeTemplateContext) {
        return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
      },
    };
  },
);
