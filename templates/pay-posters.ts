// Fixed paper artwork, data and layout from MemeCrafters/meme-generator at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import QRCode from "qrcode";
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { drawFittedText, jpg, previewImage, registerFont } from "./template-layout.ts";

const defaultMessage = "https://github.com/MemeCrafters/meme-generator";
const textChoice = {
  args_model: { properties: { message: { type: "string", default: "", description: "二维码内容" } } },
  parser_options: [{ names: ["-m", "--message"], args: [{ name: "message", value: "str" }], help_text: "二维码内容" }],
};
type Square = readonly [x: number, y: number, size: number];
type Tile = readonly [x: number, y: number, size: number, radius: number];
type TextBox = readonly [left: number, top: number, right: number, bottom: number];

interface Poster {
  readonly key: "alipay" | "wechat_pay";
  readonly keyword: string;
  readonly code: Square;
  readonly paper: Tile;
  readonly avatar: Tile;
  readonly logo?: readonly [x: number, y: number];
  readonly name: TextBox;
  readonly font: readonly [minimum: number, maximum: number];
}

function titleFrom(input: MemeTemplateInput) {
  const owner: unknown = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
  if (input.texts[0] !== undefined) return input.texts[0];
  if (owner && typeof owner === "object" && "name" in owner && typeof owner.name === "string") return owner.name;
  throw new MemeTemplateFeedback("请提供文字或可用的用户昵称。");
}

function codeFor(text: string) {
  const options = { errorCorrectionLevel: "Q" } as const;
  try {
    const code = QRCode.create(text, options);
    return code.version < 5 ? QRCode.create(text, { ...options, version: 5 }).modules : code.modules;
  } catch {
    throw new MemeTemplateFeedback("二维码内容过长或无法生成。");
  }
}

function drawCode(canvas: CanvasRenderingContext2D, matrix: ReturnType<typeof codeFor>, [x, y, size]: Square) {
  canvas.fillStyle = "white";
  canvas.fillRect(x, y, size, size);
  const edges = Array.from({ length: matrix.size + 1 }, (_, index) => Math.round(size * index / matrix.size));
  canvas.fillStyle = "black";
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.get(row, column)) {
        canvas.fillRect(x + edges[column]!, y + edges[row]!, edges[column + 1]! - edges[column]!, edges[row + 1]! - edges[row]!);
      }
    }
  }
}

function drawAvatar(canvas: CanvasRenderingContext2D, image: Image, [x, y, size, radius]: Tile) {
  canvas.save();
  canvas.beginPath();
  canvas.roundRect(x, y, size, size, radius);
  canvas.clip();
  canvas.imageSmoothingQuality = "high";
  const scaled = Math.max(size / image.width, size / image.height);
  const width = Math.trunc(image.width * scaled), height = Math.trunc(image.height * scaled);
  canvas.drawImage(image, x + Math.floor((size - width) / 2), y + Math.floor((size - height) / 2), width, height);
  canvas.restore();
}

function poster(spec: Poster): MemeTemplate {
  const template: MemeTemplate = {
    info: { key: spec.key, keywords: [spec.keyword], params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, args_type: textChoice,
    } },
    async render(input, context) {
      if (input.images.length !== 1 || input.texts.length > 1) throw new MemeTemplateFeedback("表情图片或文字数量不符合要求。");
      const title = titleFrom(input);
      const content = typeof input.args.message === "string" && input.args.message ? input.args.message : defaultMessage;
      const code = codeFor(content);
      const { signal } = context;
      const [base, avatar, font, logo] = await Promise.all([
        context.imageAsset(`${spec.key}/0.png`).then(loadImage), readMemeFirstImage(input.images[0]!, signal),
        registerFont(context), spec.logo && context.imageAsset(`${spec.key}/logo.png`).then(loadImage),
      ]);
      return jpg(base.width, base.height, canvas => {
        canvas.drawImage(base, 0, 0);
        drawCode(canvas, code, spec.code);
        const [paperX, paperY, paperSize, radius] = spec.paper;
        canvas.fillStyle = "white";
        canvas.beginPath();
        canvas.roundRect(paperX, paperY, paperSize, paperSize, radius);
        canvas.fill();
        drawAvatar(canvas, avatar, spec.avatar);
        if (logo && spec.logo) canvas.drawImage(logo, ...spec.logo);
        drawFittedText(canvas, spec.name, title, font, ...spec.font, "center", "black", { wrap: false });
      }, signal);
    },
    async preview(context) {
      return template.render({ images: [await previewImage(context.signal)], texts: ["预览用户"], args: {} }, context);
    },
  };
  return template;
}

export const payPosterMemeTemplates = [
  poster({ key: "alipay", keyword: "支付宝支付", code: [211, 606, 658], paper: [482, 877, 116, 12], avatar: [486, 881, 108, 8],
    name: [230, 1290, 850, 1380], font: [40, 70] }),
  poster({ key: "wechat_pay", keyword: "微信支付", code: [356, 439, 530], paper: [528, 611, 186, 0], avatar: [538, 621, 166, 8],
    logo: [649, 734], name: [370, 1000, 872, 1100], font: [50, 80] }),
] as const;
