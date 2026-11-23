import { expect, test } from "bun:test";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { pythonMotionSceneTemplates } from "../templates/python-motion-scenes.ts";

test("后空翻和佩佩举合并静态重帧，同时保留原版总时长与画布", async () => {
  const signal = new AbortController().signal;
  const context = { signal, ...createBundledMemeResources(signal) };
  const marker = (await renderExactPng(126, 94, draw => {
    draw.fillStyle = "#219dbe";
    draw.fillRect(0, 0, 126, 94);
    draw.fillStyle = "#8c206d";
    draw.fillRect(5, 7, 33, 31);
  })).png;
  const avatar = new File([new Uint8Array(marker)], "avatar.png", { type: "image/png" });
  for (const [key, images, size, count, duration] of [
    ["backflip", [avatar], [204, 247], 28, 1500],
    ["pepe_raise", [avatar, avatar], [518, 518], 4, 360],
  ] as const) {
    const template = pythonMotionSceneTemplates.find(entry => entry.info.key === key)!;
    const encoded = await template.render({ images, texts: [], args: {} }, context);
    const decoded = await readMemeImageSequence(new File([new Uint8Array(encoded)], "result.gif"), signal);
    expect([decoded.frames[0].width, decoded.frames[0].height]).toEqual([...size]);
    expect(decoded.frames).toHaveLength(count);
    expect(decoded.averageDelayMs * decoded.frames.length).toBeCloseTo(duration, 5);
  }
}, 10_000);
