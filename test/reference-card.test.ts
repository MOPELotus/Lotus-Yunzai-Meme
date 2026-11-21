import { expect, test } from "bun:test";
import module from "../lotus.ts";
import { presentMemeVersion, readChangeRows, renderMemeVersion } from "../version-card.ts";
import type { MemeInfoCard } from "../info-card-runtime.ts";

const actor = { message_type: "private" as const, isMaster: false, user_id: 1000, isBotMaster: () => false };
const owner = { ...actor, isBotMaster: (id: number) => id === actor.user_id };

test("帮助和版本沿用通用表情别名并隐藏非主人的管理条目", async () => {
  for (const command of ["#表情帮助", "表情合成使用说明", "memeHELP", "#表情菜单", "#表情功能"]) {
    const reply = await module.fallback(command, actor);
    expect(reply).toContain("#表情列表");
    expect(reply).not.toContain("#表情合成设置");
  }
  expect(await module.fallback("meme命令", owner)).toContain("#表情合成设置");
  expect(await module.fallback("meme命令", { ...owner, isDelegated: true })).not.toContain("#表情合成设置");
  const original = await presentMemeVersion();
  expect(original).toMatchObject({ type: "forward" });
  for (const command of ["#表情版本", "#表情版本信息", "memeVersionInfo", "表情合成版本信息", "#表情插件更新日志"]) {
    expect(await module.fallback(command, actor)).toEqual(original);
  }
  expect(await module.commands["#表情版本"]("")).toEqual(original);
  expect(await module.fallback("#表情合成插件强制更新", owner)).toContain("#强制更新 meme");
  expect(await module.fallback("#表情插件更新", actor)).toContain("只有主人");
});

test("表情版本图卡及文本降级保留日志标题、分类、正文和版本顺序", async () => {
  const source = await Bun.file(new URL("../CHANGELOG.md", import.meta.url)).text();
  const changes = readChangeRows(source);
  const nonEmpty = source.split(/\r?\n/u).filter(line => !["", "*", "-"].includes(line.trim()));
  expect(changes).toHaveLength(nonEmpty.length);
  expect(changes[0]).toEqual({ kind: "title", text: "变更日志" });
  expect(changes[1]).toEqual({ kind: "release", text: "1.18.0 (2026-01-12)" });
  expect(changes).toContainEqual({ kind: "change", text: "main: release 1.16.1 (#57) (f85d3ff)" });
  const output = await presentMemeVersion(async () => { throw new Error("render fixture"); });
  expect(output && typeof output === "object" && output.type).toBe("forward");
  if (!output || typeof output !== "object" || output.type !== "forward") throw new Error("需要文字转发。");
  const textNodes = output.nodes.flat().flatMap(node => node.type === "text" ? [node.text] : []);
  expect(textNodes.join("\n").split("\n").slice(2)).toEqual(changes.map(row =>
    row.kind === "change" ? `· ${row.text}` : row.text));

  const drawn: string[] = [];
  const pageHeights: number[] = [];
  const singleScales: number[] = [];
  const emptyContext = {} as Parameters<Parameters<MemeInfoCard["renderInfoCard"]>[1]>[0]["measure"];
  const fixture: MemeInfoCard = {
    infoCardColors: { gold: "#d3bc8e", tile: "#243344", muted: "#c2c5cb" },
    drawInfoText(_, rows) { drawn.push(...rows); },
    measureInfoText(_, text) { return [text]; },
    async renderInfoCard(header, layout, options) {
      expect(header.metadata).toContain("模块版本");
      if (options?.scale) {
        singleScales.push(options.scale);
        throw new Error("模拟整张图不受支持。");
      }
      const body = layout({ x: 30, y: 120, width: 840, measure: emptyContext });
      pageHeights.push(body.height);
      body.draw(emptyContext);
      return { png: new Uint8Array([1]) };
    },
  };
  const images = await renderMemeVersion(changes, fixture);
  expect(singleScales).toEqual([4, 2]);
  expect(images.length).toBeGreaterThan(1);
  expect(pageHeights.every(height => height <= 1544)).toBe(true);
  expect(drawn.filter(line => !/^第 \d+ \/ \d+ 页$/u.test(line))).toEqual(changes.map(row =>
    row.kind === "change" ? `· ${row.text}` : row.text));
  expect(drawn.at(-1)).toBe(`第 ${images.length} / ${images.length} 页`);
});

test("版本信息保留可发送的整张图，超过协议限制才用二倍", async () => {
  const rows = readChangeRows("# 变更日志\n## 1.0\n* 完整内容");
  const options: number[] = [];
  const smallImage = new Uint8Array([42]);
  let tooLarge = false;
  const renderer = {
    async renderInfoCard(_header, _body, scale) {
      options.push(scale?.scale ?? 4);
      return { png: tooLarge && scale?.scale === 4 ? new Uint8Array(16 * 1024 * 1024 + 1) : smallImage };
    },
  } satisfies Pick<MemeInfoCard, "renderInfoCard">;
  // The renderer can reject or accept by output size before drawing the fixture.
  const info = { ...renderer, infoCardColors: { gold: "", tile: "", muted: "" },
    drawInfoText() {}, measureInfoText: () => [] };
  expect(await renderMemeVersion(rows, info)).toEqual([{ type: "image", file: smallImage }]);
  expect(options).toEqual([4]);
  tooLarge = true;
  options.length = 0;
  expect(await renderMemeVersion(rows, info, undefined, 16 * 1024 * 1024)).toEqual([{ type: "image", file: smallImage }]);
  expect(options).toEqual([4, 2]);
});
