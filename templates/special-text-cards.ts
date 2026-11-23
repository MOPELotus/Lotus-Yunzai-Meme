import { Canvas, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext, type MemeTemplateInput } from "../builtin-template.ts";
import { jpg, paper, registerFont, registerMemeTypeface } from "./template-layout.ts";
import { layoutMemeText } from "./bbcode-text.ts";
import { renderPythonGif } from "./python-gif.ts";

const source = "python/meme_generator/memes/";
const textTooLong = () => new MemeTemplateFeedback("文字过长，无法放进表情模板。");
type Draw = CanvasRenderingContext2D;
type CanvasPaint = string | ReturnType<CanvasRenderingContext2D["createLinearGradient"]>;

function imageAsset(context: MemeTemplateContext, key: string, name: string) {
  return context.imageAsset(source + key + "/images/" + name).then(loadImage);
}

function plainLayout(text: string, size: number, family: string, color: string, wrap?: number, fallback = family) {
  return layoutMemeText(text.split(/\r\n|[\r\n]/u).map(line => ({
    alignment: "left", spans: [{ text: line, size, color }],
  })), wrap, { regular: family, cjk: fallback });
}

function lineShape(text: string, size: number, families: string) {
  const canvas = new Canvas(1, 1).getContext("2d");
  const font = size + "px " + families;
  canvas.font = font;
  const lines = text.split(/\r\n|[\r\n]/u).map(line => ({
    text: line, measured: canvas.measureText(line || " "),
  }));
  const width = Math.ceil(Math.max(1, ...lines.map(({ measured }) => measured.width)));
  const ascent = Math.max(0, ...lines.map(({ measured }) => -Number(measured.lines[0]?.ascent ?? -measured.fontBoundingBoxAscent)));
  const descent = Math.max(0, ...lines.map(({ measured }) => Number(measured.lines[0]?.descent ?? measured.fontBoundingBoxDescent)));
  const lineHeight = Math.ceil(ascent + descent);
  return {
    width, height: lines.length * lineHeight,
    draw(draw: Draw, x: number, y: number, fill: CanvasPaint, stroke = 0, strokeFill = fill) {
      draw.font = font;
      draw.textBaseline = "alphabetic";
      draw.textAlign = "left";
      draw.fillStyle = fill;
      draw.strokeStyle = strokeFill;
      draw.lineJoin = "round";
      draw.lineWidth = Math.max(1, 2 * stroke);
      lines.forEach(({ text: caption }, index) => {
        const baseline = y + ascent + index * lineHeight;
        if (stroke) draw.strokeText(caption, x, baseline);
        draw.fillText(caption, x, baseline);
      });
    },
  };
}

function rotateGeometry(width: number, height: number, degrees: number) {
  const angle = degrees * Math.PI / 180;
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const outWidth = Math.ceil(width * c + height * s);
  const outHeight = Math.ceil(width * s + height * c);
  return {
    width: outWidth, height: outHeight,
    apply(draw: Draw, x: number, y: number) {
      draw.translate(x + outWidth / 2, y + outHeight / 2);
      draw.rotate(angle);
      draw.translate(-width / 2, -height / 2);
    },
  };
}


async function nokia({ texts }: MemeTemplateInput, context: MemeTemplateContext) {
  const text = [...(texts[0] ?? "无内鬼，继续交易")].slice(0, 900).join("");
  const [background, pixel, fallback] = await Promise.all([
    imageAsset(context, "nokia", "0.jpg"),
    registerMemeTypeface(context, "FusionPixel12pxSC.ttf", "LotusMemeFusionPixel"),
    registerFont(context),
  ]);
  const family = pixel + ", " + fallback;
  const body = plainLayout(text, 70, pixel, "black", 700, fallback);
  const counter = lineShape(String([...text].length) + "/900", 70, family);
  return jpg(background.width, background.height, draw => {
    draw.drawImage(background, 0, 0);
    draw.save();
    rotateGeometry(700, 450, 9.3).apply(draw, 205, 330);
    draw.beginPath(); draw.rect(0, 0, 700, 450); draw.clip();
    body.draw(draw, 0, 0);
    draw.restore();
    draw.save();
    rotateGeometry(counter.width, counter.height, 9.3).apply(draw, 790, 320);
    counter.draw(draw, 0, 0, "#81d4fa");
    draw.restore();
  }, context.signal);
}

function blueArchiveHorizontalScale(text: string) {
  const glyphs = [...text].filter(character => !/\s/u.test(character));
  if (!glyphs.length) return 1;
  // Keep ideographs at their native width. The original Latin sample measures 1.205× the fallback.
  const latin = glyphs.filter(character => /[A-Za-z0-9]/u.test(character)).length;
  return 1 + 0.205 * latin / glyphs.length;
}

async function bluearchive({ texts }: MemeTemplateInput, context: MemeTemplateContext) {
  const [halo, cross, family] = await Promise.all([
    imageAsset(context, "bluearchive", "halo.png"),
    imageAsset(context, "bluearchive", "cross.png"),
    registerMemeTypeface(context, "GlowSansSC-Normal-Heavy.otf", "LotusMemeGlowSansHeavy"),
  ]);
  const fontSize = 168;
  const leftText = texts[0] ?? "Blue";
  const rightText = texts[1] ?? "Archive";
  const first = lineShape(leftText, fontSize, family);
  const second = lineShape(rightText, fontSize, family);
  // The old template's Latin title face has wider advances than its open fallback.
  const firstScale = blueArchiveHorizontalScale(leftText);
  const secondScale = blueArchiveHorizontalScale(rightText);
  const firstWidth = Math.round(first.width * firstScale);
  const secondWidth = Math.round(second.width * secondScale);
  const tilt = 0.4;
  const outline = Math.round(fontSize * 0.07);
  const shearWidth = Math.round(Math.max(first.height, second.height) * tilt);
  const width = firstWidth + secondWidth + 2 * outline + shearWidth + 100;
  if (width > 8192) throw textTooLong();
  return jpg(width, 450, draw => {
    paper(draw, width, 450);
    draw.drawImage(halo, firstWidth - 50, 10);
    draw.save();
    draw.translate(50 + outline + shearWidth, 120);
    draw.transform(1, 0, -tilt, 1, 0, 0);
    draw.save();
    draw.scale(firstScale, 1);
    first.draw(draw, 0, 0, "#128afa");
    draw.restore();
    draw.translate(firstWidth, 0);
    draw.scale(secondScale, 1);
    second.draw(draw, 0, 0, "#2b2b2b", outline, "#fff");
    draw.restore();
    draw.drawImage(cross, firstWidth - 50, 10);
  }, context.signal);
}

async function douyin({ texts }: MemeTemplateInput, context: MemeTemplateContext) {
  const [regular, cjk] = await Promise.all([
    registerMemeTypeface(context, "LiberationSans-Regular.ttf", "LotusMemeLiberationSans"), registerFont(context),
  ]);
  const shape = lineShape((texts[0] ?? "douyin").split(/\r\n|[\r\n]/u).join(" "), 200, regular + ", " + cjk);
  const bg = "#1c0b1b";
  const width = shape.width + 160, height = shape.height + 80;
  if (width + 64 > 8192) throw textTooLong();
  const base = await renderExactPng(width, height, draw => {
    draw.fillStyle = bg;
    draw.fillRect(0, 0, width, height);
    shape.draw(draw, 90, 50, "#ff0050", 5);
    shape.draw(draw, 70, 30, "#00f5eb", 5);
    shape.draw(draw, 80, 40, "#fff", 5);
  });
  const picture = await loadImage(base.png);
  const count = 6;
  const frames = Array.from({ length: 10 }, () => ({
    value: Array.from({ length: count }, () => Math.abs(Math.sin(Math.random() * count))), delayMs: 200,
  }));
  return renderPythonGif({
    width: width + 64, height, frames, signal: context.signal,
    async renderFrame(slices, frameWidth, frameHeight) {
      const bands = slices.reduce((sum, n) => sum + n, 0) || 1;
      return (await renderRgba(frameWidth, frameHeight, draw => {
        draw.scale(frameWidth / (width + 64), frameHeight / height);
        draw.fillStyle = bg;
        draw.fillRect(0, 0, width + 64, height);
        draw.transform(1, 0, -64 / height, 1, 64, 0);
        draw.drawImage(picture, 0, 0);
        let top = 0;
        for (const [index, fraction] of slices.entries()) {
          const band = Math.min(height - top, Math.max(2, Math.round((height - 30) * fraction / bands)));
          if (band < 1) break;
          const offset = index * (index % 2 === 0 ? -1 : 1);
          draw.drawImage(picture, 70, top, width - 70, band, 70 + offset, top, width - 70, band);
          top += band;
        }
      })).rgba;
    },
  });
}

const p5Red = "#e5191c", p5White = "#fdfdfd", p5Black = "#0f0f0f";

function p5Tile(character: string, first: boolean, faces: string) {
  const angle = -Math.round(10 * Math.random()) * (first || Math.random() < 0.5 ? 1 : -1);
  const fontSize = 120 * (first ? 1.1 : (1 - Math.floor(3 * Math.random()) / 10));
  const redLetter = !first && Math.random() < 0.4;
  const glyph = lineShape(character, fontSize, faces);
  let width = Math.round(glyph.width * 1.4), height = Math.round(glyph.height * 1.1);
  const plaqueWidth = width, plaqueHeight = height;
  if (first) {
    width = Math.round(1.2 * width);
    height = Math.round(1.2 * height);
  }
  const fixedWidth = width + 12, fixedHeight = height + 12;
  const position = rotateGeometry(fixedWidth, fixedHeight, angle);
  const innerAngle = Math.round(5 * Math.random()) * (Math.random() < 0.5 ? 1 : -1);
  return {
    width: fixedWidth,
    rotatedWidth: position.width,
    rotatedHeight: position.height,
    draw(draw: Draw, x: number, y: number) {
      draw.save();
      position.apply(draw, x, y);
      draw.fillStyle = p5White;
      draw.fillRect(0, 0, fixedWidth, fixedHeight);
      draw.fillStyle = p5Black;
      draw.fillRect(6, 6, width, height);
      if (first) {
        draw.save();
        draw.beginPath(); draw.rect(6, 6, width, height); draw.clip();
        draw.translate(fixedWidth / 2, fixedHeight / 2);
        draw.rotate(innerAngle * Math.PI / 180);
        draw.fillStyle = p5Red;
        draw.fillRect(-plaqueWidth / 2, -plaqueHeight / 2, plaqueWidth, plaqueHeight);
        draw.restore();
      }
      glyph.draw(draw, (fixedWidth - glyph.width) / 2, (fixedHeight - glyph.height) / 2, redLetter ? p5Red : p5White);
      draw.restore();
    },
  };
}

async function p5letter({ texts }: MemeTemplateInput, context: MemeTemplateContext) {
  const input = (texts[0] ?? "TAKEYOURHEART").split(/\r\n|[\r\n]/u);
  if (input.at(-1) === "") input.pop();
  if (input.length > 5) throw textTooLong();
  const [background, latin, cjk] = await Promise.all([
    imageAsset(context, "p5letter", "background.png"),
    registerMemeTypeface(context, "LiberationSans-Bold.ttf", "LotusMemeLiberationSansBold"), registerFont(context, true),
  ]);
  const rows = input.flatMap(line => {
    const letters = [...line].filter(character => !!character.trim());
    if (letters.length > 150) throw textTooLong();
    if (!letters.length) return [];
    const tiles = letters.map((character, index) => p5Tile(character, index === 0, latin + ", " + cjk));
    const offset = Math.floor((tiles[0]!.rotatedWidth - tiles[0]!.width) / 2);
    const tail = tiles.at(-1)!;
    const width = tiles.reduce((sum, tile) => sum + tile.width, offset)
      + Math.floor((tail.rotatedWidth - tail.width) / 2);
    if (width > 1700) throw textTooLong();
    return [{
      width, height: Math.max(...tiles.map(tile => tile.rotatedHeight)), tiles, offset,
    }];
  });
  const { png } = await renderExactPng(background.width, background.height, draw => {
    draw.drawImage(background, 0, 0);
    let top = Math.floor((background.height - rows.reduce((sum, row) => sum + row.height, 0)) / 2);
    for (const row of rows) {
      const left = Math.floor((background.width - row.width) / 2);
      let x = left + row.offset;
      draw.save();
      draw.beginPath(); draw.rect(left, top, row.width, row.height); draw.clip();
      for (const tile of row.tiles) {
        tile.draw(draw, x - Math.floor((tile.rotatedWidth - tile.width) / 2),
          top + Math.floor((row.height - tile.rotatedHeight) / 2));
        x += tile.width;
      }
      draw.restore();
      top += row.height;
    }
  });
  return png;
}

type ColorStop = readonly [offset: number, color: string];
type Paint = string | readonly [top: number, bottom: number, stops: readonly ColorStop[]];
type Layer = readonly [stroke: number, x: number, y: number, fill: Paint];
const upperSilver: Paint = [38, 234, [
  [0, "#000f24"], [0.1, "#fff"], [0.18, "#373a3b"], [0.25, "#373a3b"], [0.5, "#c8c8c8"], [0.75, "#373a3b"],
  [0.85, "#19141f"], [0.91, "#f0f0f0"], [0.95, "#a6afc2"], [1, "#323232"],
]];
const upperGold: Paint = [40, 200, [
  [0, "#fdf100"], [0.25, "#f5fdbb"], [0.4, "#fff"], [0.75, "#fddb09"], [0.9, "#7f3500"], [1, "#f3c40b"],
]];
const lowerSilver: Paint = [320, 506, [
  [0, "#000f24"], [0.25, "#fafafa"], [0.5, "#969696"], [0.75, "#373a3b"],
  [0.85, "#19141f"], [0.91, "#f0f0f0"], [0.95, "#a6afc2"], [1, "#323232"],
]];
const upperLayers: readonly Layer[] = [
  [22, 8, 8, "#000"], [20, 8, 8, upperSilver], [16, 0, 0, "#000"], [10, 0, 0, upperGold],
  [6, 4, -6, "#000"], [6, 0, -6, "#fff"],
  [4, 0, -6, [50, 200, [[0, "#ff6400"], [0.5, "#7b0000"], [0.51, "#f00000"], [1, "#050000"]]]],
  [0, 0, -6, [50, 200, [[0, "#e60000"], [0.5, "#7b0000"], [0.51, "#f00000"], [1, "#050000"]]]],
];
const lowerLayers: readonly Layer[] = [
  [22, 10, 4, "#000"], [19, 10, 4, lowerSilver], [17, 0, 0, "#10193a"], [8, 0, 0, "#d0d0d0"],
  [7, 0, 0, [320, 480, [[0, "#10193a"], [0.03, "#fff"], [0.08, "#10193a"], [0.2, "#10193a"], [1, "#10193a"]]]],
  [0, 0, -6, [320, 480, [[0, "#f5f6f8"], [0.15, "#fff"], [0.35, "#c3d5dc"], [0.5, "#a0bec9"], [0.51, "#a0bec9"], [0.52, "#c4d7de"], [1, "#ebf5f7"]]]],
];
function metallicLayer(draw: Draw, glyph: ReturnType<typeof lineShape>, top: number, left: number, layers: readonly Layer[]) {
  const skew = 0.45;
  for (const [stroke, x, y, fill] of layers) {
    draw.save();
    draw.translate(left + x, top + y);
    draw.transform(1, 0, -skew, 1, Math.round(glyph.height * skew), 0);
    let paint: CanvasPaint = "#000";
    if (typeof fill === "string") paint = fill;
    else {
      const [from, to, stops] = fill;
      const gradient = draw.createLinearGradient(0, from - top, 0, to - top);
      for (const [offset, color] of stops) gradient.addColorStop(offset, color);
      paint = gradient;
    }
    glyph.draw(draw, 20, 0, paint, stroke);
    draw.restore();
  }
}

async function choyen({ texts }: MemeTemplateInput, context: MemeTemplateContext) {
  const [sans, serif] = await Promise.all([
    registerFont(context),
    registerMemeTypeface(context, "NotoSerifSC-Regular.otf", "LotusMemeNotoSerif"),
  ]);
  const first = lineShape(texts[0] ?? "我去", 200, sans);
  const second = lineShape(texts[1] ?? "洛天依", 200, serif);
  const width = Math.max(first.width + Math.round(first.height * 0.45) + 68,
    second.width + Math.round(second.height * 0.45) + 330);
  if (width > 8192) throw textTooLong();
  return jpg(width, 580, draw => {
    paper(draw, width, 580);
    metallicLayer(draw, first, 0, 20, upperLayers);
    metallicLayer(draw, second, 260, 280, lowerLayers);
  }, context.signal);
}

function specialTextTemplate(
  key: string,
  keywords: readonly string[],
  defaultText: readonly string[],
  render: MemeTemplate["render"],
  tags?: readonly string[],
): MemeTemplate {
  return {
    info: { key, keywords, tags, params_type: {
      min_images: 0, max_images: 0, min_texts: defaultText.length, max_texts: defaultText.length,
      default_texts: defaultText, args_type: null,
    } },
    render,
    preview: context => render({ images: [], texts: defaultText, args: {} }, context),
  };
}

export const specialTextCardTemplates: readonly MemeTemplate[] = [
  specialTextTemplate("nokia", ["诺基亚", "有内鬼"], ["无内鬼，继续交易"], nokia),
  specialTextTemplate("bluearchive", ["蔚蓝档案标题", "batitle"], ["Blue", "Archive"], bluearchive, ["碧蓝档案", "蔚蓝档案"]),
  specialTextTemplate("douyin", ["douyin"], ["douyin"], douyin),
  specialTextTemplate("p5letter", ["女神异闻录5预告信", "P5预告信"], ["TAKEYOURHEART"], p5letter),
  specialTextTemplate("5000choyen", ["5000兆"], ["我去", "洛天依"], choyen),
];
