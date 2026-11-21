import type { LoadMemeInfoCard, MemeInfoCard } from "./info-card-runtime.ts";

export interface ReferenceGroup {
  readonly title: string;
  readonly entries: readonly { title: string; detail: string; icon?: number }[];
}

export interface MemeReference {
  readonly title: string;
  readonly subtitle?: string;
  readonly view?: "settings";
  readonly groups: readonly ReferenceGroup[];
}

export function helpReference(owner: boolean): MemeReference {
  const groups: ReferenceGroup[] = [{
    title: "查询与合成",
    entries: [
      { title: "#表情列表 [页码]", detail: "浏览可用表情。指定页码时返回文字目录。", icon: 161 },
      { title: "#表情搜索 关键词", detail: "搜索表情名称和别名。", icon: 90 },
      { title: "#表情详情 关键词", detail: "查看图片、文本、参数数量和图样预览。", icon: 75 },
      { title: "#表情统计", detail: "查看表情调用次数。", icon: 72 },
      { title: "#随机表情", detail: "从可用模板中随机合成一张表情。" },
      { title: "表情关键词 [文字/文字] [@用户] [#参数名 参数值]",
        detail: "也可附图片或引用图片。详情中可查模板支持的参数。", icon: 71 },
    ],
  }];
  if (owner) groups.push({
    title: "主人命令",
    entries: [
      { title: "#表情合成设置", detail: "查看当前设置。发送设置项名称可查看或修改该项。", icon: 85 },
      { title: "#表情合成更新资源", detail: "增量更新表情数据。添加「强制」可重新读取全部表情。", icon: 81 },
      { title: "#更新 meme", detail: "通过宿主检查表情模块代码更新。", icon: 95 },
    ],
  });
  return { title: "表情帮助", groups };
}

let helpIcons: Promise<import("skia-canvas").Image | undefined> | undefined;

async function readIcons() {
  const { loadImage } = await import("skia-canvas");
  const image = await Bun.file(new URL("./resources/help/icon.webp", import.meta.url)).bytes();
  return loadImage(Buffer.from(image));
}

export async function renderMemeReference(reference: MemeReference, info: MemeInfoCard) {
  const icons = reference.groups.some(group => group.entries.some(entry => entry.icon))
    ? await (helpIcons ??= readIcons().catch(() => undefined)) : undefined;
  const { renderInfoCard, measureInfoText, drawInfoText, infoCardColors } = info;
  const settings = reference.view === "settings";
  return renderInfoCard({ title: reference.title, metadata: reference.subtitle }, ({ x, y, width, measure }) => {
    const groups = reference.groups.map(group => ({
      title: group.title,
      rows: group.entries.map(({ title, detail, icon }) => {
        const inset = icon && icons ? 54 : 14;
        const maxWidth = width - inset - 14;
        const titleLines = measureInfoText(measure, title, settings ? maxWidth * 0.6 : maxWidth, 20);
        const detailLines = measureInfoText(measure, detail, settings ? maxWidth * 0.35 : maxWidth, 17);
        const textHeight = settings ? Math.max(titleLines.length * 28, detailLines.length * 24)
          : titleLines.length * 28 + detailLines.length * 24;
        return { titleLines, detailLines, inset, icon, height: 22 + textHeight };
      }),
    }));
    return {
      height: groups.reduce((total, { rows }) => total + 32 + rows.reduce((sum, row) => sum + row.height + 8, 0), 0),
      draw(ctx) {
        let top = y;
        for (const { title, rows } of groups) {
          drawInfoText(ctx, [title], x, top, { size: 21, color: infoCardColors.gold });
          top += 32;
          for (const { titleLines, detailLines, inset, icon, height } of rows) {
            ctx.beginPath();
            ctx.roundRect(x, top, width, height, 7);
            ctx.fillStyle = infoCardColors.tile;
            ctx.fill();
            if (icons && icon) {
              const index = icon - 1;
              ctx.drawImage(icons, index % 10 * 100, Math.floor(index / 10) * 100, 100, 100, x + 12, top + 15, 30, 30);
            }
            drawInfoText(ctx, titleLines, x + inset, top + 10, { size: 20, leading: 28 });
            const detailLeft = settings ? x + width - 14 : x + inset;
            const detailTop = settings ? top + 12 : top + 10 + titleLines.length * 28;
            drawInfoText(ctx, detailLines, detailLeft, detailTop, {
              size: 17, leading: 24, color: settings ? infoCardColors.gold : infoCardColors.muted,
              align: settings ? "right" : "left",
            });
            top += height + 8;
          }
        }
      },
    };
  });
}

export async function presentMemeReference(reference: MemeReference, loadInfoCard?: LoadMemeInfoCard, signal?: AbortSignal) {
  if (signal?.aborted) return;
  if (loadInfoCard) {
    try {
      const info = await loadInfoCard();
      signal?.throwIfAborted();
      const { png } = await renderMemeReference(reference, info);
      return signal?.aborted ? undefined : { type: "image" as const, file: png };
    } catch {
      if (signal?.aborted) return;
    }
  }
  return [reference.title, reference.subtitle, ...reference.groups.flatMap(group => [
    group.title, ...group.entries.map(({ title, detail }) => `${title}：${detail}`),
  ])].filter(Boolean).join("\n");
}
