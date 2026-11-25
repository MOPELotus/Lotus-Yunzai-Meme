import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import type { MemeInfoCard } from "./info-card-runtime.ts";

export interface UsageRow {
  readonly keywords: string;
  readonly count: number;
}

const gap = 12;
const padding = 10;
const size = 16;
const leading = 22;

export function renderUsageCard(total: number, rows: readonly UsageRow[], info: MemeInfoCard, scale: 2 | 4 = 4) {
  const { renderInfoCard, measureInfoText, drawInfoText, infoCardColors } = info;
  return renderInfoCard({ title: $t("usage-card.text_862a6e26a2"), metadata: $t("usage-card.text_d43a58dda9", { "total": total }), width: 1152 },
    ({ x, y, width, measure }) => {
      const columns = Math.max(1, Math.min(5, rows.length));
      const cellWidth = (width - (columns - 1) * gap) / columns;
      const grid: { height: number; cells: { badge: string; lines: string[] }[] }[] = [];
      for (let offset = 0; offset < rows.length; offset += columns) {
        const cells = rows.slice(offset, offset + columns).map(({ keywords, count }) => {
          const badge = $t("usage-card.text_e6c66976bb", { "count": count });
          measureInfoText(measure, badge, cellWidth, size);
          const badgeWidth = measure.measureText(badge).width;
          const keywordWidth = cellWidth - badgeWidth - 3 * padding;
          // A separator belongs to the end of its alias, even when that alias wraps.
          const lines = measureInfoText(measure, keywords, keywordWidth - measure.measureText(",").width, size);
          for (let index = 1; index < lines.length; index++) {
            if (!lines[index]!.trimStart().startsWith(",")) continue;
            const previous = lines[index - 1]!.trimEnd();
            if (measure.measureText(previous + ",").width > keywordWidth) continue;
            lines[index - 1] = previous + ",";
            lines[index] = lines[index]!.trimStart().slice(1).trimStart();
          }
          return { badge, lines: lines.filter(Boolean) };
        });
        grid.push({ cells, height: 2 * padding + Math.max(...cells.map(({ lines }) => lines.length * leading)) });
      }
      return {
        height: grid.reduce((sum, row) => sum + row.height, 0) + Math.max(0, grid.length - 1) * gap,
        draw(ctx) {
          let top = y;
          for (const { height, cells } of grid) {
            for (const [index, { badge, lines }] of cells.entries()) {
              const left = x + index * (cellWidth + gap);
              ctx.beginPath();
              ctx.roundRect(left, top, cellWidth, height, 7);
              ctx.fillStyle = infoCardColors.tile;
              ctx.fill();
              drawInfoText(ctx, lines, left + padding, top + (height - lines.length * leading) / 2, { size, leading });
              drawInfoText(ctx, [badge], left + cellWidth - padding, top + (height - leading) / 2,
                { size, color: infoCardColors.gold, align: "right" });
            }
            top += height + gap;
          }
        },
      };
    }, { scale, allowHalfScale: scale === 4 });
}
