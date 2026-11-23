import { loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { buildImageMeme, loadPythonArt, positionedPhoto } from "./python-motion-scenes.ts";
import { jpg, rotateExpanded, type Draw } from "./template-layout.ts";
import { renderTransformSequence } from "./transforms.ts";

function contribArtwork(context: MemeTemplateContext, key: "forbid" | "grab") {
  return context.imageAsset(`python/memes/${key}/images/0.png`).then(loadImage);
}

async function portraitBehind(art: Image, photo: Image, width: number, height: number, signal: AbortSignal) {
  const result = await renderMaskedRaster(art.width, art.height, positionedPhoto(photo, 0, 0, width, height),
    [draw => draw.drawImage(art, 0, 0)], signal);
  return loadImage(result);
}

const forbid = buildImageMeme("forbid", ["禁止", "禁"], [1, 1], async ({ images }, context) => {
  const { signal } = context;
  const [art, source] = await Promise.all([contribArtwork(context, "forbid"), readMemeImageSequence(images[0]!, signal)]);
  return renderTransformSequence(source, art.width, art.height, async (draw, photo) => {
    const joined = await portraitBehind(art, photo, 304, 324, signal);
    draw.drawImage(joined, 0, 0);
  }, signal);
});

const grab = buildImageMeme("grab", ["抓"], [1, 1], async ({ images }, context) => {
  const { signal } = context;
  const [art, photo] = await Promise.all([contribArtwork(context, "grab"), readMemeFirstImage(images[0]!, signal)]);
  const joined = await portraitBehind(art, photo, 500, 500, signal);
  return jpg(art.width, art.height, draw => draw.drawImage(joined, 0, 0), signal);
});

function portraitAt(photo: Image, size: number) {
  return renderExactPng(size, size, positionedPhoto(photo, 0, 0, size, size)).then(({ png }) => loadImage(png));
}

function fragment(photo: Image, x: number, y: number, angle: number): Draw {
  return draw => {
    draw.save();
    draw.translate(x, y);
    rotateExpanded(draw, photo.width, photo.height, angle);
    draw.drawImage(photo, 0, 0);
    draw.restore();
  };
}

const rip = buildImageMeme("rip", ["撕"], [1, 2], async ({ images }, context) => {
  const { signal } = context;
  const [art, ...photos] = await Promise.all([
    loadPythonArt(context, "rip", images.length === 1 ? "0.png" : "1.png"),
    ...images.map(file => readMemeFirstImage(file, signal)),
  ]);
  const torn = await portraitAt(photos.at(-1)!, 385);
  const [left, right] = [fragment(torn, -5, 355, 24), fragment(torn, 649, 310, -11)];
  const masks = [left];
  if (photos.length === 2) {
    const self = await portraitAt(photos[0]!, 230);
    masks.push(draw => draw.drawImage(self, 408, 418));
  }
  masks.push(draw => draw.drawImage(art, 0, 0));
  const joined = await loadImage(await renderMaskedRaster(art.width, art.height, right, masks, signal, { whiteBackground: true }));
  return jpg(art.width, art.height, draw => draw.drawImage(joined, 0, 0), signal);
});

export const pythonPhotoBehindTemplates = [forbid, grab, rip] as const;
