import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Canvas, FontLibrary, loadImage, type CanvasGradient, type CanvasRenderingContext2D as Context } from "skia-canvas";
import { renderPng } from "../../packages/skia/index.ts";

export interface UsageRow {
  readonly keywords: string;
  readonly count: number;
}

const width = 1152;
const columns = 5;
const gap = 16;
const gridPadding = 17;
const maxGridWidth = 1080;
const entryInsetLeft = 19;
const entryInsetRight = 17;
const badgeGap = 12;
const badgePadding = 8;
const leading = 20;
const bodyFont = '"LotusMemeNumber", "LotusMemeHan", "Noto Sans CJK SC", sans-serif';
const keywordFont = `600 16px ${bodyFont}`;
const badgeFont = `bold 14px ${bodyFont}`;
const footerFont = 'bold 15px Arial, "Noto Sans CJK SC", sans-serif';
const background = new URL("./resources/stat/imgs/bg.webp", import.meta.url);

let theme: ReturnType<typeof loadTheme> | undefined;

async function loadTheme() {
  const themeRoot = Bun.env.LOTUS_ATLAS_THEME_DIR?.trim() ||
    fileURLToPath(new URL("../../data/atlas/theme/", import.meta.url));
  for (const [name, filename] of [
    ["LotusMemeNumber", "tttgbnumber.ttf"],
    ["LotusMemeHan", "HYWH-65W.ttf"],
  ] as const) {
    const path = join(themeRoot, "fonts", filename);
    if (await Bun.file(path).exists()) FontLibrary.use(name, [path]);
  }
  return loadImage(fileURLToPath(background));
}

function fitLines(ctx: Context, value: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.match(/[A-Za-z0-9_-]+|\S|\s+/gu) ?? []) {
    // CJK text can break between characters. Keep ordinary Latin tokens together.
    const pieces = ctx.measureText(word).width > maxWidth ? Array.from(word) : [word];
    for (const piece of pieces) {
      if (line && ctx.measureText(line + piece).width > maxWidth) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (line || piece.trim()) line += piece;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function panel(ctx: Context, x: number, y: number, w: number, h: number, radius: number,
  fill: string | CanvasGradient, border?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function boldText(ctx: Context, text: string, x: number, y: number, stroke: number) {
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

export async function renderUsageCard(total: number, rows: readonly UsageRow[], mode: "auto" | "gpu" = "auto") {
  const backdrop = await (theme ??= loadTheme());
  const measure = new Canvas(1, 1).getContext("2d");
  const entries = rows.map((row) => {
    const badge = `${row.count} 次`;
    measure.font = badgeFont;
    const badgeWidth = measure.measureText(badge).width + 2 * badgePadding;
    measure.font = keywordFont;
    return { ...row, badge, badgeWidth, preferredWidth: measure.measureText(row.keywords).width };
  });
  const available = maxGridWidth - 2 * gridPadding - (columns - 1) * gap;
  const cellWidth = Math.min(available / columns, Math.max(0, ...entries.map(({ badgeWidth, preferredWidth }) =>
    preferredWidth + entryInsetLeft + entryInsetRight + badgeGap + badgeWidth)));
  const gridWidth = entries.length ? 2 * gridPadding + columns * cellWidth + (columns - 1) * gap : 2 * gridPadding;
  const gridX = (width - gridWidth) / 2;
  const gridY = 160;
  const cardRows: { height: number; cells: (typeof entries[number] & { lines: string[] })[] }[] = [];
  for (let offset = 0; offset < entries.length; offset += columns) {
    const cells = entries.slice(offset, offset + columns).map((entry) => ({
      ...entry, lines: fitLines(measure, entry.keywords, cellWidth - entryInsetLeft - entryInsetRight - badgeGap - entry.badgeWidth),
    }));
    cardRows.push({ cells, height: 26 + Math.max(21, ...cells.map(({ lines }) => lines.length * leading)) });
  }
  const gridHeight = 2 * gridPadding + cardRows.reduce((sum, { height }) => sum + height, 0) +
    Math.max(0, cardRows.length - 1) * gap;
  const cardBottom = gridY + gridHeight + 21;
  const height = cardBottom + 51;
  return renderPng(width, height, (ctx) => {
    const cover = Math.max(width / backdrop.width, height / backdrop.height);
    const backdropWidth = backdrop.width * cover;
    const backdropHeight = backdrop.height * cover;
    const backgroundX = (width - backdropWidth) / 2;
    const backgroundY = (height - backdropHeight) / 2;
    ctx.drawImage(backdrop, backgroundX, backgroundY, backdropWidth, backdropHeight);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(15.5, 20.5, width - 31, cardBottom - 21, 20);
    ctx.clip();
    ctx.filter = "blur(10px)";
    ctx.drawImage(backdrop, backgroundX, backgroundY, backdropWidth, backdropHeight);
    ctx.restore();

    panel(ctx, 15.5, 20.5, width - 31, cardBottom - 21, 20, "rgba(255,255,255,.92)", "rgba(0,0,0,.1)");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 36px ${bodyFont}`;
    ctx.fillStyle = "#234164";
    ctx.letterSpacing = "1px";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.1)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    boldText(ctx, "表情合成统计", width / 2, 63.5, 1.2);
    ctx.restore();
    ctx.letterSpacing = "0px";
    panel(ctx, width / 2 - 30, 91, 60, 3, 2, "rgba(70,130,180,.4)");
    ctx.font = `600 18px ${bodyFont}`;
    ctx.fillStyle = "#466e96";
    boldText(ctx, `表情调用总次数：${total}`, width / 2, 124.5, 0.65);

    ctx.shadowColor = "rgba(0,0,0,.08)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    panel(ctx, gridX, gridY, gridWidth, gridHeight, 12, "rgba(255,255,255,.85)", "rgba(200,200,200,.3)");
    ctx.shadowColor = "transparent";
    let y = gridY + gridPadding;
    ctx.textAlign = "left";
    for (const { height: rowHeight, cells } of cardRows) {
      for (const [index, cell] of cells.entries()) {
        const x = gridX + gridPadding + index * (cellWidth + gap);
        const gradient = ctx.createLinearGradient(x, y, x + cellWidth, y);
        gradient.addColorStop(0, "#f8f9fa");
        gradient.addColorStop(1, "#fff");
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.1)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        panel(ctx, x, y, cellWidth, rowHeight, 8, gradient, "rgba(200,200,200,.3)");
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, cellWidth, rowHeight, 8);
        ctx.clip();
        ctx.fillStyle = "#4a6e91";
        ctx.fillRect(x, y, 3, rowHeight);
        ctx.font = keywordFont;
        const leadY = y + (rowHeight - cell.lines.length * leading) / 2 + leading / 2;
        for (const [line, text] of cell.lines.entries()) {
          boldText(ctx, text, x + entryInsetLeft, leadY + line * leading, 0.55);
        }
        const badgeX = x + cellWidth - entryInsetRight - cell.badgeWidth;
        panel(ctx, badgeX, y + (rowHeight - 21) / 2, cell.badgeWidth, 21, 12, "rgba(85,143,200,.1)");
        ctx.fillStyle = "#558fc8";
        ctx.font = badgeFont;
        boldText(ctx, cell.badge, badgeX + badgePadding, y + rowHeight / 2, 0.5);
        ctx.restore();
      }
      y += rowHeight + gap;
    }
    ctx.textAlign = "center";
    ctx.font = footerFont;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 1;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText("Lotus-Yunzai · 表情合成", width / 2 + 5, cardBottom + 20.5);
  }, mode);
}
