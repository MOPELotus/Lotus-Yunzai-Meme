import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderPngWithoutFooter as renderPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { jpg, paper, previewImage, rgbaFrameDimensions } from "./template-layout.ts";

const params = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };
const genshinTags = ["米哈游", "原神"] as const;

// Original artwork and offsets from anyliew/meme_emoji, each matched to the old catalog key.
type AvatarPlacement = readonly [left: number, top: number, width: number, height: number];
type AvatarFrame = readonly [key: string, keywords: readonly string[], avatar: AvatarPlacement];
interface FrameOptions {
  readonly tags?: readonly string[];
  readonly maxTexts?: 1;
  readonly still?: "jpg";
}

const frames: readonly AvatarFrame[] = [
  ["mihoyo_amber_frame", ["安柏相框"], [36, 40, 245, 245]],
  ["mihoyo_barbara_pegg_frame", ["芭芭拉相框"], [36, 42, 245, 245]],
  ["mihoyo_barbatos_frame", ["巴巴托斯", "风神相框"], [36, 40, 245, 245]],
  ["mihoyo_caribert_alberich_frame", ["卡利贝尔相框"], [72, 80, 490, 490]],
  ["mihoyo_chasca_frame", ["恰斯卡相框"], [40, 42, 245, 245]],
  ["mihoyo_citlali_frame", ["茜特菈莉相框", "奶奶相框"], [30, 30, 270, 270]],
  ["mihoyo_editorial_society_frame", ["编辑协会相框"], [36, 42, 245, 245]],
  ["mihoyo_gemini_frame", ["双子相框"], [38, 40, 245, 245]],
  ["mihoyo_guoba_frame", ["锅巴相框"], [44, 42, 245, 245]],
  ["mihoyo_hilichurl_frame", ["丘丘人相框"], [40, 40, 240, 240]],
  ["mihoyo_hutao_frame", ["胡桃相框"], [36, 42, 245, 245]],
  ["mihoyo_kaveh_frame", ["卡维相框"], [36, 42, 245, 245]],
  ["mihoyo_klee_duduke_frame", ["可莉嘟嘟可相框", "嘟嘟可"], [36, 42, 245, 245]],
  ["mihoyo_klee_frame", ["可莉相框"], [36, 42, 245, 245]],
  ["mihoyo_klee_hat_frame", ["可莉帽子相框"], [40, 40, 240, 240]],
  ["mihoyo_kujou_sara_frame", ["九条裟罗相框"], [36, 42, 245, 245]],
  ["mihoyo_kuki_shinobu_frame", ["久岐忍相框", "阿忍相框"], [38, 40, 245, 245]],
  ["mihoyo_lce_slime_frame", ["冰史莱姆相框"], [84, 83, 434, 427]],
  ["mihoyo_outlander_frame", ["异乡人相框"], [36, 42, 245, 245]],
  ["mihoyo_paimon_emergency_food_frame", ["应急食品相框"], [72, 84, 490, 490]],
  ["mihoyo_paimon_frame", ["派蒙相框"], [40, 38, 245, 245]],
  ["mihoyo_shikanoin_heizou_frame", ["鹿野院平藏相框"], [36, 42, 245, 245]],
  ["mihoyo_tartaglia_frame", ["达达利亚相框", "阿贾克斯相框", "公子相框"], [36, 40, 245, 245]],
  ["mihoyo_tepetlisauri_frame", ["嵴锋龙相框"], [36, 45, 245, 245]],
  ["mihoyo_thunderbolt_slime_frame", ["雷史莱姆相框", "雷电史莱姆相框"], [40, 38, 245, 245]],
  ["mihoyo_traveler_frame", ["旅行者相框"], [36, 40, 245, 245]],
  ["mihoyo_wind_slime_frame", ["风史莱姆相框"], [38, 38, 245, 245]],
];

function drawFrame(avatar: Image, frame: Image, [left, top, width, height]: AvatarPlacement) {
  return (canvas: CanvasRenderingContext2D) => {
    const side = Math.min(avatar.width, avatar.height);
    const sourceX = Math.floor((avatar.width - side) / 2);
    const sourceY = Math.floor((avatar.height - side) / 2);
    canvas.save();
    canvas.imageSmoothingQuality = "high";
    canvas.beginPath();
    canvas.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    canvas.clip();
    canvas.drawImage(avatar, sourceX, sourceY, side, side, left, top, width, height);
    canvas.restore();
    canvas.drawImage(frame, 0, 0);
  };
}

function avatarFrame([key, keywords, placement]: AvatarFrame, { tags = [], maxTexts, still }: FrameOptions = {}): MemeTemplate {
  const limits = maxTexts ? { ...params, max_texts: maxTexts } : params;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== 1 || input.texts.length > limits.max_texts) throw new Error($t("templates.avatar-frames.text_a2bee4ca3d"));
    const { signal } = context;
    signal.throwIfAborted();
    const [sequence, frame] = await Promise.all([
      readMemeImageSequence(input.images[0]!, signal),
      context.imageAsset(`anyliew/emoji/${key}/images/0.png`).then(loadImage),
    ]);
    const { width, height } = frame;
    if (sequence.frames.length === 1) {
      const draw = drawFrame(sequence.frames[0], frame, placement);
      if (still === "jpg") {
        return jpg(width, height, canvas => {
          paper(canvas, width, height);
          draw(canvas);
        }, signal);
      }
      const result = await renderPng(width, height, draw);
      signal.throwIfAborted();
      return result.png;
    }
    const raster = rgbaFrameDimensions(width, height);
    return renderPythonCanvasGif({
      ...raster, signal,
      frames: sequence.frames.map(value => ({ value, delayMs: sequence.averageDelayMs })),
      drawFrame: (avatar, canvas) => drawFrame(avatar, frame, placement)(canvas),
    });
  }

  return {
    info: { key, keywords, tags, params_type: limits },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const avatarFrameMemeTemplates: readonly MemeTemplate[] = [
  ...frames.map(frame => avatarFrame(frame, { tags: genshinTags })),
  avatarFrame(["springframe", ["春日燕归来"], [23, 28, 159, 159]]),
  avatarFrame(["catch", ["抓住"], [73, 93, 999, 999]]),
  avatarFrame(["christmas_hat", ["圣诞帽子", "圣诞帽"], [47, 78, 209, 209]]),
  // These old catalog entries accept a caption, but the legacy drawing code emits no text.
  avatarFrame(["fireworks_head", ["烟花头像"], [340, 165, 320, 320]], { maxTexts: 1, still: "jpg" }),
  avatarFrame(["ikun_head", ["小黑子"], [73, 75, 220, 220]], { maxTexts: 1, still: "jpg" }),
  avatarFrame(["mihoyo_funina_round_head", ["芙芙圆形头像", "芙宁娜圆形头像"], [68, 68, 500, 500]],
    { tags: genshinTags, maxTexts: 1, still: "jpg" }),
  avatarFrame(["mihoyo_mem_hat", ["迷迷帽", "迷迷帽子"], [145, 155, 245, 245]], { tags: ["崩坏：星穹铁道", "米哈游"] }),
  avatarFrame(["mihoyo_paimon_crown", ["派蒙王冠", "派蒙皇冠", "👑"], [72, 84, 490, 490]], { tags: genshinTags }),
  avatarFrame(["nakano_lchika", ["中野一花"], [104, 112, 210, 215]]),
  avatarFrame(["nakano_miku", ["中野三玖"], [105, 100, 230, 230]]),
  avatarFrame(["nakano_yotsuba", ["中野四叶"], [95, 103, 230, 230]]),
  avatarFrame(["ok", ["ok", "OK", "Ok"], [13, 49, 230, 205]]),
  avatarFrame(["orange_head", ["橘子头"], [185, 445, 475, 475]], { maxTexts: 1 }),
  avatarFrame(["pierrot_plus_head", ["拾又之国"], [80, 97, 260, 260]]),
  avatarFrame(["shikanoko_noko", ["鹿乃子乃子", "鹿乃子"], [360, 3, 290, 290]], { maxTexts: 1, still: "jpg" }),
];
