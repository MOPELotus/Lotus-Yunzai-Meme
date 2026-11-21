import { fileURLToPath } from "node:url";
import { loadImage } from "skia-canvas";
import type { MemeInfoCard } from "./info-card-runtime.ts";

const icons = ["text", "image", "arg"] as const;
type Icon = typeof icons[number];

export interface CatalogCardRow {
  readonly keyword: string;
  readonly types: readonly Icon[];
}

const columnGap = 10;
const rowGap = 6;
const rowPadding = 10;
const iconSize = 18;
const iconTile = 24;
const iconGap = 4;
const size = 16;
const leading = 22;
const rowsPerColumn = 50;
export const rowsPerCatalogCard = rowsPerColumn * 5;

let symbols: ReturnType<typeof loadSymbols> | undefined;

async function loadSymbols() {
  const assets = new URL("./resources/list/imgs/icons/", import.meta.url);
  return new Map(await Promise.all(icons.map(async icon =>
    [icon, await loadImage(fileURLToPath(new URL(icon + ".svg", assets)))] as const)));
}

export async function renderCatalogCard(
  rows: readonly CatalogCardRow[], offset: number, total: number, info: MemeInfoCard,
) {
  const loaded = await (symbols ??= loadSymbols());
  const columnCount = Math.max(1, Math.ceil(rows.length / rowsPerColumn));
  const width = Math.max(900, 60 + columnCount * 268 + (columnCount - 1) * columnGap);
  const { renderInfoCard, measureInfoText, drawInfoText, infoCardColors } = info;
  return renderInfoCard({ title: "表情列表", metadata: `表情总数：${total}`, width }, ({ x, y, width, measure }) => {
    const columnWidth = (width - (columnCount - 1) * columnGap) / columnCount;
    const items = rows.map(({ keyword, types }, index) => {
      const iconsWidth = types.length ? types.length * (iconTile + iconGap) - iconGap : 0;
      const lineWidth = columnWidth - rowPadding * 2 - (iconsWidth ? iconsWidth + rowPadding : 0);
      const clean = keyword.replace(/\s+/gu, " ").trim();
      const label = clean.length > 120 ? clean.slice(0, 119).toWellFormed() + "…" : clean;
      const lines = measureInfoText(measure, `${offset + index + 1}. ${label}`, lineWidth, size);
      return { types, lines, iconsWidth, height: rowPadding * 2 + Math.max(iconTile, lines.length * leading) };
    });
    const columns = Array.from({ length: columnCount }, (_, index) =>
      items.slice(index * rowsPerColumn, (index + 1) * rowsPerColumn));
    return {
      height: Math.max(0, ...columns.map(items => items.reduce((sum, row) => sum + row.height + rowGap, -rowGap))),
      draw(ctx) {
        for (const [index, entries] of columns.entries()) {
          const left = x + index * (columnWidth + columnGap);
          let top = y;
          for (const row of entries) {
            ctx.beginPath();
            ctx.roundRect(left, top, columnWidth, row.height, 7);
            ctx.fillStyle = infoCardColors.tile;
            ctx.fill();
            drawInfoText(ctx, row.lines, left + rowPadding, top + (row.height - row.lines.length * leading) / 2,
              { size, leading });
            const badgeTop = top + (row.height - iconTile) / 2;
            for (const [iconIndex, type] of row.types.entries()) {
              const badgeLeft = left + columnWidth - rowPadding - row.iconsWidth + iconIndex * (iconTile + iconGap);
              ctx.beginPath();
              ctx.roundRect(badgeLeft, badgeTop, iconTile, iconTile, 5);
              ctx.fillStyle = infoCardColors.gold;
              ctx.fill();
              const inset = (iconTile - iconSize) / 2;
              ctx.drawImage(loaded.get(type)!, badgeLeft + inset, badgeTop + inset, iconSize, iconSize);
            }
            top += row.height + rowGap;
          }
        }
      },
    };
  });
}
