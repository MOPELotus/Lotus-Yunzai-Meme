import { expect, test } from "bun:test";
import { renderExactPng } from "@lotus-yunzai/skia";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { motionMemeTemplates } from "../templates/motion.ts";

const signal = new AbortController().signal;
const context: MemeTemplateContext = {
  signal,
  async imageAsset() { throw new Error("Motion templates have no image assets"); },
  async fontAsset() { throw new Error("Motion templates have no font assets"); },
};

async function asymmetricImage() {
  const { png } = await renderExactPng(100, 80, draw => {
    draw.fillStyle = "#e32525";
    draw.fillRect(0, 0, 50, 80);
    draw.fillStyle = "#2865e5";
    draw.fillRect(50, 0, 50, 80);
  });
  return new File([Buffer.from(png)], "avatar.png", { type: "image/png" });
}

async function decode(bytes: Uint8Array) {
  return readMemeImageSequence(new File([Buffer.from(bytes)], "output.gif"), signal);
}

test("turn emits the original 36 transparent circle frames", async () => {
  const result = await decode(await motionMemeTemplates[0].render({ images: [await asymmetricImage()], texts: [], args: {} }, context));
  expect(result.frames.map(frame => [frame.width, frame.height])).toEqual(Array(36).fill([250, 250]));
  expect(result.averageDelayMs).toBe(50);
  const { png } = await renderExactPng(250, 250, draw => {
    draw.drawImage(result.frames[0], 0, 0);
    expect(draw.getImageData(0, 0, 1, 1).data[3]).toBe(0);
    expect(draw.getImageData(125, 125, 1, 1).data[3]).toBe(255);
  });
  expect(png.byteLength).toBeGreaterThan(0);
});

test("left-right jump preserves the original directions, turnaround, and cadence", async () => {
  const images = [await asymmetricImage()];
  const leftward = await decode(await motionMemeTemplates[1].render({ images, texts: [], args: {} }, context));
  const rightward = await decode(await motionMemeTemplates[1].render({ images, texts: [], args: { direction: "right_left" } }, context));
  expect(leftward.frames.map(frame => [frame.width, frame.height])).toEqual(Array(30).fill([300, 110]));
  expect(leftward.averageDelayMs).toBe(40);
  const { png } = await renderExactPng(300, 110, draw => {
    draw.drawImage(leftward.frames[0], 0, 0);
    expect(draw.getImageData(215, 40, 1, 1).data[0]).toBeGreaterThan(200);
    expect(draw.getImageData(15, 40, 1, 1).data[3]).toBe(0);
    draw.clearRect(0, 0, 300, 110);
    draw.drawImage(leftward.frames[15]!, 0, 0);
    expect(draw.getImageData(15, 40, 1, 1).data[2]).toBeGreaterThan(200);
    draw.clearRect(0, 0, 300, 110);
    draw.drawImage(rightward.frames[0], 0, 0);
    expect(draw.getImageData(15, 40, 1, 1).data[0]).toBeGreaterThan(200);
    expect(draw.getImageData(215, 40, 1, 1).data[3]).toBe(0);
  });
  expect(png.byteLength).toBeGreaterThan(0);
});
