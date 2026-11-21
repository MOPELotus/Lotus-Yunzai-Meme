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
  return renderInfoCard({ title: "表情合成统计", metadata: `表情调用总次数：${total}`, width: 1152 },
    ({ x, y, width, measure }) => {
      const columns = Math.max(1, Math.min(5, rows.length));
      const cellWidth = (width - (columns - 1) * gap) / columns;
      const grid: { height: number; cells: { badge: string; lines: string[] }[] }[] = [];
      for (let offset = 0; offset < rows.length; offset += columns) {
        const cells = rows.slice(offset, offset + columns).map(({ keywords, count }) => {
          const badge = `${count} 次`;
          measureInfoText(measure, badge, cellWidth, size);
          const badgeWidth = measure.measureText(badge).width;
          const lines = measureInfoText(measure, keywords, cellWidth - badgeWidth - 3 * padding, size);
          return { badge, lines };
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
