import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
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
    title: $t("reference-card.text_a589ce0aff"),
    entries: [
      { title: $t("reference-card.text_9aa5d79af2"), detail: $t("reference-card.text_7ee43534a0"), icon: 161 },
      { title: $t("reference-card.text_10f0fe7df6"), detail: $t("reference-card.text_90119af892"), icon: 90 },
      { title: $t("reference-card.text_2c78f41fbd"), detail: $t("reference-card.text_5271fc2f94"), icon: 75 },
      { title: "#表情统计", detail: $t("reference-card.text_bde3515fc5"), icon: 72 },
      { title: "#随机表情", detail: $t("reference-card.text_25ab51b9c4") },
      { title: $t("reference-card.text_9c27461465"),
        detail: $t("reference-card.text_9962dc4878"), icon: 71 },
    ],
  }];
  if (owner) groups.push({
    title: $t("reference-card.text_57cd91abe2"),
    entries: [
      { title: "#表情合成设置", detail: $t("reference-card.text_05d1067425"), icon: 85 },
      { title: "#表情合成更新资源", detail: $t("reference-card.text_a67a100892"), icon: 81 },
      { title: $t("reference-card.text_c1937be6df"), detail: $t("reference-card.text_fcb198138f"), icon: 95 },
    ],
  });
  return { title: $t("reference-card.text_31cce19faf"), groups };
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
