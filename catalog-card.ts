import { fileURLToPath } from "node:url";
import { Canvas, loadImage, type CanvasRenderingContext2D as Context } from "skia-canvas";

const icons = ["text", "image", "arg"] as const;
type Icon = typeof icons[number];

export interface CatalogCardRow {
  readonly keyword: string;
  readonly types: readonly Icon[];
}

export type CatalogPngRenderer = (
  width: number, height: number, draw: (ctx: Context) => void,
) => Promise<{ readonly png: Uint8Array }>;

const width = 1440;
const headerX = 152;
const headerWidth = 1136;
const columnX = 168;
const columnWidth = 208;
const columnPadding = 16;
const columnGap = 16;
const columnY = 170;
const itemGap = 8;
const iconSize = 18;
const iconGap = 8;
const leading = 20;
const font = '"Helvetica Neue", Arial, "Noto Sans CJK SC", sans-serif';
const itemFont = `15px ${font}`;
const rowsPerColumn = 50;
export const rowsPerCatalogCard = rowsPerColumn * 5;

let material: ReturnType<typeof loadMaterial> | undefined;

async function loadMaterial() {
  const assets = new URL("./resources/list/imgs/", import.meta.url);
  const image = (name: string) => loadImage(fileURLToPath(new URL(name, assets)));
  const [background, ...symbols] = await Promise.all([image("bg.webp"), ...icons.map((icon) => image(`icons/${icon}.svg`))]);
  return { background, symbols: new Map(icons.map((icon, index) => [icon, symbols[index]!])) };
}

function panel(ctx: Context, x: number, y: number, w: number, h: number, radius: number, fill: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function fitLines(ctx: Context, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (line && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line.trimEnd());
      line = "";
    }
    if (line || char.trim()) line += char;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function cover(ctx: Context, image: Awaited<ReturnType<typeof loadImage>>, height: number) {
  const factor = Math.max(width / image.width, height / image.height);
  const w = image.width * factor;
  const h = image.height * factor;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

export async function renderCatalogCard(
  rows: readonly CatalogCardRow[], offset: number, total: number, render: CatalogPngRenderer,
) {
  const { background, symbols } = await (material ??= loadMaterial());
  const measure = new Canvas(1, 1).getContext("2d");
  measure.font = itemFont;
  const items = rows.map(({ keyword, types }, index) => {
    const iconsWidth = types.length ? types.length * (iconSize + iconGap) - iconGap : 0;
    const lineWidth = columnWidth - 2 * columnPadding - 32 - (iconsWidth ? iconsWidth + iconGap : 0);
    const clean = keyword.replace(/\s+/gu, " ").trim();
    const label = clean.length > 120 ? clean.slice(0, 119).toWellFormed() + "…" : clean;
    const lines = fitLines(measure, `${offset + index + 1}. ${label}`, lineWidth);
    return { types, lines, iconsWidth, height: 24 + Math.max(leading, lines.length * leading) };
  });
  const columns = Array.from({ length: Math.ceil(items.length / rowsPerColumn) }, (_, index) => {
    const entries = items.slice(index * rowsPerColumn, (index + 1) * rowsPerColumn);
    return { entries, height: 2 * columnPadding + entries.reduce((sum, item) => sum + item.height + itemGap, 0) };
  });
  const contentBottom = columnY + Math.max(0, ...columns.map(column => column.height));
  return render(width, contentBottom + 78, (ctx) => {
    cover(ctx, background, contentBottom + 78);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.05)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    panel(ctx, headerX, 52, headerWidth, 96, 12, "rgba(255,255,255,.9)");
    ctx.restore();
    ctx.font = `600 32px ${font}`;
    ctx.fillStyle = "#333";
    ctx.fillText("表情列表", width / 2, 88);
    ctx.font = `16px ${font}`;
    ctx.fillStyle = "#666";
    ctx.fillText(`表情总数：${total}`, width / 2, 121);

    ctx.font = itemFont;
    ctx.textAlign = "left";
    for (const [index, { entries, height }] of columns.entries()) {
      const x = columnX + index * (columnWidth + columnGap);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.08)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      panel(ctx, x, columnY, columnWidth, height, 10, "#fff");
      ctx.restore();
      let y = columnY + columnPadding;
      for (const item of entries) {
        panel(ctx, x + columnPadding, y, columnWidth - 2 * columnPadding, item.height, 6, "#f8f9fa");
        ctx.fillStyle = "#333";
        for (const [line, value] of item.lines.entries()) {
          ctx.fillText(value, x + 2 * columnPadding, y + 12 + leading / 2 + line * leading);
        }
        ctx.save();
        ctx.globalAlpha = 0.7;
        for (const [iconIndex, type] of item.types.entries()) {
          const iconX = x + columnWidth - 2 * columnPadding - item.iconsWidth + iconIndex * (iconSize + iconGap);
          ctx.drawImage(symbols.get(type)!, iconX, y + (item.height - iconSize) / 2, iconSize, iconSize);
        }
        ctx.restore();
        y += item.height + itemGap;
      }
    }
    ctx.font = `bold 15px ${font}`;
    ctx.textAlign = "center";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 1;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText("Lotus-Yunzai · 表情合成", width / 2, contentBottom + 48);
  });
}
