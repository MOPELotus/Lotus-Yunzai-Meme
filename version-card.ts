import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import packageInfo from "./package.json";
import type { LoadMemeInfoCard, MemeInfoCard } from "./info-card-runtime.ts";

type ChangeRow = { readonly kind: "title" | "release" | "section" | "change"; readonly text: string };

const title = $t("version-card.text_2160fd4e12");
const metadata = $t("version-card.text_d5a9eae866", { "version": packageInfo.version });
const maxBodyHeight = 1520;
const textPageSize = 1500;
const imageBatchSize = 4;
const style = {
  title: { size: 27, leading: 35, before: 0, after: 12, inset: 0 },
  release: { size: 24, leading: 32, before: 16, after: 8, inset: 0 },
  section: { size: 20, leading: 27, before: 8, after: 5, inset: 0 },
  change: { size: 17, leading: 24, before: 0, after: 4, inset: 14 },
} as const;

export function readChangeRows(source: string): ChangeRow[] {
  return source.split(/\r?\n/u).flatMap((line): ChangeRow[] => {
    const input = line.trim();
    if (!input || input === "*" || input === "-") return [];
    const heading = /^(#{1,6})\s+(.+)$/u.exec(input);
    const kind = !heading ? "change" : heading[1]!.length === 1 ? "title"
      : heading[1]!.length === 2 ? "release" : "section";
    const text = (heading?.[2] ?? input.replace(/^[-*]\s+/u, ""))
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/gu, "$1")
      .replace(/\*\*([^*]+)\*\*/gu, "$1")
      .replace(/`([^`]+)`/gu, "$1");
    return [{ kind, text }];
  });
}

function textPages(changes: readonly ChangeRow[]) {
  const heading = `${title}\n${metadata}`;
  const pages: string[] = [];
  let text = heading;
  for (const { kind, text: value } of changes) {
    const line = kind === "change" ? `· ${value}` : value;
    if (text.length + line.length + 1 > textPageSize && text) {
      pages.push(text);
      text = "";
    }
    text += text ? `\n${line}` : line;
  }
  if (text) pages.push(text);
  if (pages.length === 1) return pages[0]!;
  return { type: "forward" as const, nodes: pages.map(text => [{ type: "text" as const, text }]) };
}

type RowLayout = ChangeRow & { readonly lines: readonly string[]; readonly height: number };

function splitPages(rows: readonly RowLayout[]) {
  const pages: RowLayout[][] = [];
  let page: RowLayout[] = [];
  let height = 0;
  for (const [index, row] of rows.entries()) {
    let needed = row.height;
    // Keep consecutive headings with the following change when it fits a page.
    if (row.kind !== "change") {
      for (let cursor = index + 1; cursor < rows.length; cursor++) {
        const next = rows[cursor]!;
        needed += next.height;
        if (next.kind === "change") break;
      }
    }
    if (page.length > 0 && height + Math.min(needed, maxBodyHeight) > maxBodyHeight) {
      pages.push(page);
      page = [];
      height = 0;
    }
    page.push(row);
    height += row.height;
  }
  if (page.length) pages.push(page);
  return pages;
}

export async function renderMemeVersion(changes: readonly ChangeRow[], info: MemeInfoCard, signal?: AbortSignal,
  imageByteLimit = Infinity,
) {
  if (!changes.length) return [];
  const { renderInfoCard, measureInfoText, drawInfoText, infoCardColors } = info;
  type BodyLayout = Parameters<Parameters<MemeInfoCard["renderInfoCard"]>[1]>[0];
  const header = { title, metadata };
  function measureRows({ width, measure }: BodyLayout) {
    return changes.map(row => {
      const { size, leading, before, after, inset } = style[row.kind];
      const lines = measureInfoText(measure, row.kind === "change" ? `· ${row.text}` : row.text, width - inset, size);
      return { ...row, lines, height: before + lines.length * leading + after };
    });
  }
  function buildBody({ x, y, width }: BodyLayout, rows: readonly RowLayout[], page?: string) {
    return {
      height: rows.reduce((sum, row) => sum + row.height, 0) + (page ? 24 : 0),
      draw(ctx: BodyLayout["measure"]) {
        let top = y;
        for (const row of rows) {
          const { size, leading, before, inset } = style[row.kind];
          drawInfoText(ctx, row.lines, x + inset, top + before, {
            size, leading, color: row.kind === "change" ? undefined : infoCardColors.gold,
          });
          top += row.height;
        }
        if (page) drawInfoText(ctx, [page], x + width, top + 4,
          { size: 15, color: infoCardColors.muted, align: "right" });
      },
    };
  }

  let measured: RowLayout[] | undefined;
  // A session's inline image limit applies even when Skia can make the full canvas.
  for (const scale of [4, 2]) {
    signal?.throwIfAborted();
    try {
      const { png } = await renderInfoCard(header, layout => buildBody(layout, measured ??= measureRows(layout)),
        { scale, allowHalfScale: false });
      signal?.throwIfAborted();
      if (png.byteLength <= imageByteLimit) return [{ type: "image" as const, file: png }];
    } catch {
      signal?.throwIfAborted();
    }
  }

  const images: { type: "image"; file: Uint8Array }[] = [];
  let pages: RowLayout[][] | undefined;
  for (let index = 0; index === 0 || index < (pages?.length ?? 0); index++) {
    signal?.throwIfAborted();
    const { png } = await renderInfoCard(header, layout => {
      pages ??= splitPages(measured ??= measureRows(layout));
      return buildBody(layout, pages[index]!, $t("version-card.text_87ad7d0914", { "value1": index + 1, "length": pages.length }));
    });
    if (png.byteLength > imageByteLimit) throw new Error($t("version-card.text_6d1797778f"));
    images.push({ type: "image", file: png });
  }
  signal?.throwIfAborted();
  return images;
}

const cachedCards = new WeakMap<LoadMemeInfoCard, {
  source: string;
  byLimit: Map<number, ReturnType<typeof renderMemeVersion>>;
}>();

export async function presentMemeVersion(loadInfoCard?: LoadMemeInfoCard, signal?: AbortSignal, imageByteLimit = Infinity) {
  if (signal?.aborted) return;
  const source = await Bun.file(new URL("./CHANGELOG.md", import.meta.url)).text().catch(() => "");
  if (signal?.aborted) return;
  const changes = readChangeRows(source);
  if (!changes.length) return $t("version-card.text_17790da4c3", { "title": title, "metadata": metadata });
  if (loadInfoCard) {
    try {
      let cached = cachedCards.get(loadInfoCard);
      if (!cached || cached.source !== source) {
        cached = { source, byLimit: new Map() };
        cachedCards.set(loadInfoCard, cached);
      }
      const { byLimit } = cached;
      let pending = byLimit.get(imageByteLimit);
      if (!pending) {
        pending = loadInfoCard().then(info => renderMemeVersion(changes, info, signal, imageByteLimit));
        byLimit.set(imageByteLimit, pending);
        void pending.catch(() => {
          if (byLimit.get(imageByteLimit) === pending) byLimit.delete(imageByteLimit);
        });
      }
      const images = await pending;
      if (signal?.aborted) return;
      if (images.length === 1) return images[0]!;
      const largest = Math.max(...images.map(image => image.file.byteLength));
      const batchSize = Math.min(imageBatchSize, Math.floor(imageByteLimit / largest));
      return { type: "forward" as const, batchSize, nodes: images.map(image => [image]) };
    } catch {
      if (signal?.aborted) return;
    }
  }
  return textPages(changes);
}
