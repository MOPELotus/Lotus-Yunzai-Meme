import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { DOMMatrix } from "skia-canvas";

type Point = readonly [x: number, y: number];
export type ProjectiveQuad = readonly [topLeft: Point, topRight: Point, bottomRight: Point, bottomLeft: Point];

/** Maps a rectangular source to the four projected corners in clockwise order. */
export function screenProjection(
  width: number, height: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: ProjectiveQuad,
) {
  const dx1 = x1 - x2, dy1 = y1 - y2;
  const dx2 = x3 - x2, dy2 = y3 - y2;
  const dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (!determinant || width <= 0 || height <= 0) throw new RangeError($t("templates.projective-transform.text_816ac781db"));
  const gx = (dx3 * dy2 - dx2 * dy3) / determinant;
  const gy = (dx1 * dy3 - dx3 * dy1) / determinant;
  // Skia reads these DOMMatrix components as a 3×3 projective transform.
  return new DOMMatrix([
    (x1 - x0 + gx * x1) / width, (y1 - y0 + gx * y1) / width, 0, gx / width,
    (x3 - x0 + gy * x3) / height, (y3 - y0 + gy * y3) / height, 0, gy / height,
    0, 0, 1, 0,
    x0, y0, 0, 1,
  ]);
}
