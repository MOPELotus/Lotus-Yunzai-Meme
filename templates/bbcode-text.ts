// Caption tags and default typefaces follow pil-utils 0.2.0 Text2Image.
import { Canvas, FontLibrary, type CanvasRenderingContext2D } from "skia-canvas";
import { MemeTemplateFeedback } from "../builtin-template.ts";

const colors = new Set((
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
  "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
  "darkgrey darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
  "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
  "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew " +
  "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
  "lightgoldenrodyellow lightgreen lightgray lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
  "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid " +
  "mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
  "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen " +
  "paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue " +
  "saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
  "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
).split(" "));

const fallbackFamilies = [
  "Arial", "Tahoma", "Helvetica Neue", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
  "Source Han Sans SC", "Noto Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", "Apple Color Emoji",
  "Noto Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
].map(name => JSON.stringify(name)).join(", ") + ", sans-serif";
const tags = new Set(["align", "color", "stroke", "font", "size", "b", "i", "u", "del"]);

type Alignment = "left" | "center" | "right";

interface Span {
  readonly text: string;
  readonly size: number;
  readonly color?: string;
  readonly stroke?: string;
  readonly family?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
}

interface Paragraph {
  readonly alignment: Alignment;
  readonly spans: Span[];
}

function validColor(value: string) {
  return colors.has(value) || /^#[\da-f]{6}$/iu.test(value);
}

export function parseMemeBbcode(text: string, size: number, alignment: Alignment): readonly Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const stacks = new Map<string, string[]>();
  const loadedFonts = new Map(FontLibrary.families.map(name => [name.toLowerCase(), name]));
  let paragraph: Paragraph | undefined;
  const current = (tag: string) => stacks.get(tag)?.at(-1);
  for (const token of text.replace(/\r\n?/gu, "\n").split(/(\[[^\[\]\r\n]*\]|\n)/gu)) {
    if (token === "\n") { paragraph = undefined; continue; }
    if (!token) continue;
    const marker = /^\[\s*(\/?)([a-z]+)(?:\s*=\s*(.*?))?\s*\]$/iu.exec(token);
    const tag = marker?.[2]?.toLowerCase();
    if (tag && tags.has(tag)) {
      const stack = stacks.get(tag) ?? [];
      if (marker![1]) {
        stack.pop();
      } else {
        let value = (marker![3] ?? "").trim();
        value = /^(["'])(.*)\1$/u.exec(value)?.[2] ?? value;
        if (tag === "font") {
          const family = loadedFonts.get(value.toLowerCase());
          if (value) stack.push(family ?? "");
        } else if ((tag === "color" || tag === "stroke") ? validColor(value) :
          tag === "align" ? /^(left|center|right)$/u.test(value) :
            tag === "size" ? /^\d+$/u.test(value) : true) {
          stack.push(value);
        }
      }
      stacks.set(tag, stack);
      continue;
    }
    const align = (current("align") ?? alignment) as Alignment;
    if (paragraph?.alignment !== align) {
      paragraph = { alignment: align, spans: [] };
      paragraphs.push(paragraph);
    }
    const fontSize = Number(current("size") ?? size);
    if (!Number.isSafeInteger(fontSize) || fontSize > 8192) throw new MemeTemplateFeedback("文字字号超出表情绘制范围。");
    if (!fontSize) continue;
    paragraph.spans.push({
      text: token, size: fontSize, color: current("color"), stroke: current("stroke"), family: current("font"),
      bold: Boolean(stacks.get("b")?.length), italic: Boolean(stacks.get("i")?.length),
      underline: Boolean(stacks.get("u")?.length), strike: Boolean(stacks.get("del")?.length),
    });
  }
  return paragraphs;
}

export function googleLogoText(text: string): readonly Paragraph[] {
  const lines = text.split(/\r\n|[\r\n\v\f\u001c-\u001e\u0085\u2028\u2029]/u);
  if (lines.at(-1) === "") lines.pop();
  const palette = ["#4285f4", "#db4437", "#f4b400", "#4285f4", "#0f9d58", "#db4437"];
  let index = 0;
  return [{ alignment: "left", spans: Array.from(graphemes.segment(lines.join(" ")), ({ segment }) => {
    const color = /^[\p{White_Space}\u001c-\u001f]+$/u.test(segment) ? undefined : palette[index % palette.length];
    // The palette still advances for every code point, even when Skia paints them as one glyph.
    index += Array.from(segment).length;
    return { text: segment, size: 200, color };
  }) }];
}

function font(span: Span) {
  return `${span.italic ? "italic " : ""}${span.bold ? "bold " : ""}${span.size}px ` +
    (span.family ? JSON.stringify(span.family) + ", " : "") + fallbackFamilies;
}

function fontGroups(spans: readonly Span[]) {
  const groups: { font: string; spans: Span[] }[] = [];
  for (const span of spans) {
    const family = font(span);
    const previous = groups.at(-1);
    if (previous?.font === family) previous.spans.push(span);
    else groups.push({ font: family, spans: [span] });
  }
  return groups;
}

function sliceSpans(spans: readonly Span[], start: number, end: number) {
  const fragments: Span[] = [];
  let offset = 0;
  for (const span of spans) {
    const text = span.text.slice(Math.max(0, start - offset), Math.max(0, end - offset));
    if (text) fragments.push({ ...span, text });
    offset += span.text.length;
    if (offset >= end) break;
  }
  return fragments;
}

const words = new Intl.Segmenter("en", { granularity: "word" });
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

function advance(draw: CanvasRenderingContext2D, text: string, keepTrailingSpaces = false) {
  if (/^\s+$/u.test(text)) return draw.measureText("x" + text + "x").width - draw.measureText("xx").width;
  if (keepTrailingSpaces && /\s$/u.test(text)) {
    return draw.measureText(text + "x").width - draw.measureText("x").width;
  }
  return draw.measureText(text).width;
}

function wrappedSpans(draw: CanvasRenderingContext2D, spans: readonly Span[], maxWidth?: number): (readonly Span[])[] {
  if (!spans.length) return [];
  const text = spans.map(span => span.text).join("");
  if (!maxWidth) return [spans];
  const firstFont = font(spans[0]!);
  if (spans.every(span => font(span) === firstFont)) {
    draw.font = firstFont;
    return draw.measureText(text, maxWidth).lines.map(({ startIndex, endIndex }, index, lines) =>
      sliceSpans(spans, startIndex, index === lines.length - 1 ? text.length : endIndex));
  }
  const naturalBreaks = [...words.segment(text)].map(item => item.index).slice(1).concat(text.length);
  const characterBreaks = [...graphemes.segment(text)].map(item => item.index).slice(1).concat(text.length);
  const measured = (start: number, end: number) => fontGroups(sliceSpans(spans, start, end)).reduce((sum, group, index, all) => {
    draw.font = group.font;
    return sum + advance(draw, group.spans.map(span => span.text).join(""), index < all.length - 1);
  }, 0);
  const lines: Span[][] = [];
  let start = 0;
  while (start < text.length) {
    function lastFit(breaks: readonly number[]) {
      let end = start;
      for (const next of breaks) {
        if (next <= start) continue;
        if (measured(start, next) > maxWidth!) break;
        end = next;
      }
      return end;
    }
    const end = lastFit(naturalBreaks);
    const split = end > start ? end : lastFit(characterBreaks);
    const next = split > start ? split : characterBreaks.find(index => index > start)!;
    lines.push(sliceSpans(spans, start, next));
    start = next;
  }
  return lines;
}

interface DrawRun extends Span {
  readonly font: string;
  readonly x: number;
  readonly width: number;
  readonly underlineY: number;
  readonly strikeY: number;
  readonly shaped?: { readonly text: string; readonly x: number; readonly left: number; readonly right: number };
}

function textDirections(spans: readonly Span[]) {
  const text = spans.map(span => span.text).join("");
  const word = "[\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}\\p{Script=Thaana}]";
  const directions = new RegExp(`${word}(?:${word}|\\p{Mark}|[ \\t]+(?=${word}))*`, "gu");
  const blocks: { spans: readonly Span[]; rtl: boolean }[] = [];
  let offset = 0;
  for (const match of text.matchAll(directions)) {
    if (offset < match.index) blocks.push({ spans: sliceSpans(spans, offset, match.index), rtl: false });
    const end = match.index + match[0].length;
    blocks.push({ spans: sliceSpans(spans, match.index, end), rtl: true });
    offset = end;
  }
  if (offset < text.length) blocks.push({ spans: sliceSpans(spans, offset, text.length), rtl: false });
  return blocks;
}

function measureLine(draw: CanvasRenderingContext2D, spans: readonly Span[]) {
  let width = 0, ascent = 0, descent = 0;
  const runs: DrawRun[] = [];
  const groups = fontGroups(spans);
  for (const [groupIndex, group] of groups.entries()) {
    draw.font = group.font;
    const whole = group.spans.map(span => span.text).join("");
    const metrics = draw.measureText(whole);
    const line = metrics.lines[0];
    ascent = Math.max(ascent, -(line?.ascent ?? -metrics.fontBoundingBoxAscent));
    descent = Math.max(descent, line?.descent ?? metrics.fontBoundingBoxDescent);
    // A single paint can use Skia's own contextual shaping directly. Only styled RTL spans need clips.
    const blocks = group.spans.length === 1 ? [{ spans: group.spans, rtl: false }] : textDirections(group.spans);
    let start = width;
    for (const [blockIndex, block] of blocks.entries()) {
      const text = block.spans.map(span => span.text).join("");
      const carry = blockIndex < blocks.length - 1 || groupIndex < groups.length - 1;
      const blockWidth = advance(draw, text, carry);
      let prefix = "";
      let previous = 0;
      for (const [index, span] of block.spans.entries()) {
        const style = draw.measureText(span.text).lines[0]?.runs[0];
        const next = index < block.spans.length - 1;
        const following = Array.from(span.text)[0]!;
        // Measuring the next character accounts for kerning across a paint-only boundary.
        let x = start + (prefix ? draw.measureText(prefix + following).width - draw.measureText(following).width : 0);
        let spanWidth = advance(draw, span.text, next || carry);
        let shaped: DrawRun["shaped"];
        if (block.rtl && block.spans.length > 1) {
          const before = prefix + span.text;
          const after = text.slice(before.length);
          const joined = /\p{Script=Arabic}$/u.test(before) && /^\p{Script=Arabic}/u.test(after) ? "\u200d" : "";
          const boundary = next ? (advance(draw, before + joined, true) + blockWidth - advance(draw, joined + after, true)) / 2 : blockWidth;
          const end = Math.max(previous, Math.min(blockWidth, boundary));
          x = start + blockWidth - end;
          spanWidth = end - previous;
          shaped = {
            text, x: start,
            left: next ? x : x - span.size,
            right: previous ? x + spanWidth : x + spanWidth + span.size,
          };
          previous = end;
        }
        runs.push({ ...span, font: group.font, x, width: spanWidth, shaped,
          underlineY: style?.underline ?? span.size * 0.1, strikeY: style?.strikethrough ?? -span.size * 0.3,
        });
        prefix += span.text;
      }
      start += blockWidth;
    }
    width += advance(draw, whole, groupIndex < groups.length - 1);
  }
  return { width, ascent, height: Math.round(ascent + descent), runs };
}

export function layoutMemeText(paragraphs: readonly Paragraph[], wrapWidth?: number) {
  const measure = new Canvas(1, 1).getContext("2d");
  measure.textWrap = true;
  measure.textBaseline = "alphabetic";
  function layout(width?: number) {
    return paragraphs.map(paragraph => ({
      alignment: paragraph.alignment,
      lines: wrappedSpans(measure, paragraph.spans, width).map(line => measureLine(measure, line)),
    }));
  }
  const initial = layout(wrapWidth);
  const width = Math.ceil(initial.reduce((maximum, paragraph) =>
    paragraph.lines.reduce((lineMax, line) => Math.max(lineMax, line.width), maximum), 0));
  const result = wrapWidth && width !== wrapWidth ? layout(width || wrapWidth) : initial;
  const height = result.reduce((sum, paragraph) => sum + paragraph.lines.reduce((total, line) => total + line.height, 0), 0);

  return {
    width, height,
    draw(canvas: CanvasRenderingContext2D, left: number, top: number) {
      canvas.save();
      canvas.textAlign = "left";
      canvas.textBaseline = "alphabetic";
      canvas.textWrap = false;
      canvas.lineJoin = "round";
      let y = top;
      for (const { alignment, lines } of result) {
        const hasStroke = lines.some(line => line.runs.some(run => run.stroke));
        for (const line of lines) {
          const x = left + (alignment === "left" ? 0 : (width - line.width) * (alignment === "center" ? 0.5 : 1));
          const baseline = y + line.ascent;
          function paint(run: DrawRun, outline: boolean) {
            canvas.font = run.font;
            canvas.fillStyle = run.color ?? "black";
            if (run.shaped) {
              canvas.save();
              canvas.beginPath();
              canvas.rect(x + run.shaped.left, y - line.height, run.shaped.right - run.shaped.left, line.height * 3);
              canvas.clip();
            }
            const painted = run.shaped?.text ?? run.text;
            const offset = x + (run.shaped?.x ?? run.x);
            if (outline && run.stroke) {
              canvas.strokeStyle = run.stroke;
              canvas.lineWidth = run.size * 0.04;
              canvas.strokeText(painted, offset, baseline);
            } else {
              canvas.fillText(painted, offset, baseline);
            }
            const thickness = Math.max(1, run.size * 0.045);
            if (run.underline) canvas.fillRect(x + run.x, baseline + run.underlineY - thickness / 2, run.width, thickness);
            if (run.strike) canvas.fillRect(x + run.x, baseline + run.strikeY - thickness / 2, run.width, thickness);
            if (run.shaped) canvas.restore();
          }
          if (hasStroke) for (const run of line.runs) paint(run, true);
          for (const run of line.runs) paint(run, false);
          y += line.height;
        }
      }
      canvas.restore();
    },
  };
}
