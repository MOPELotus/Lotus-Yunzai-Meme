import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import { anyliewFixedBatchAssets } from "../backend-anyliew-fixed-batch-assets.ts";
import { anyliewFixedBatchTemplates } from "../templates/anyliew-fixed-batch.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";

test("原固定动图以原键和别名注册，长序列只请求实际使用的首个原帧", () => {
  const templates = new Map(anyliewFixedBatchTemplates.map(template => [template.info.key, template.info]));
  expect(templates.size).toBe(16);
  expect(templates.get("rabbit")?.keywords).toEqual(["🐇", "兔子", "兔", "兔耳帽"]);
  expect(templates.get("palworld_chillet_god_wealth")?.keywords).toEqual(["财源滚滚", "财神到"]);
  expect([...templates.values()].every(({ params_type: params }) =>
    params.min_images === 1 && params.max_images === 1 && params.min_texts === 0 && params.max_texts === 0 &&
    params.args_type === null)).toBe(true);
  const path = (key: string) => anyliewFixedBatchAssets.filter(([filename]) => filename.startsWith(`emoji/${key}/`));
  expect(path("prison")).toHaveLength(78);
  expect(path("please_waiting")).toHaveLength(100);
  expect(path("rabbit")).toHaveLength(9);
  expect(new Set(anyliewFixedBatchAssets.map(([filename]) => filename)).size).toBe(anyliewFixedBatchAssets.length);
});

test("被窝保留逻辑画布，原短帧底部补透明且保留时长", async () => {
  function base(height: number) {
    const canvas = new Canvas(300, height);
    const draw = canvas.getContext("2d");
    draw.fillStyle = "#c9e8f7";
    draw.fillRect(0, 0, 300, height);
    return canvas.toBuffer("png");
  }

  const signal = AbortSignal.timeout(10_000);
  const avatar = new File([new Uint8Array(await new Canvas(10, 10).toBuffer("png"))], "avatar.png");
  const normal = await base(300);
  const short = await base(296);
  const quilt = anyliewFixedBatchTemplates.find(({ info }) => info.key === "quilt")!;
  const gif = await quilt.render({ images: [avatar], texts: [], args: {} }, {
    signal,
    async imageAsset(name) { return name.endsWith("/4.png") ? short : normal; },
    async fontAsset() { throw new Error("原版不使用字体"); },
  });
  const decoded = await readMemeImageSequence(new File([new Uint8Array(gif)], "quilt.gif"), signal);
  expect(decoded.frames).toHaveLength(3);
  expect(decoded.averageDelayMs).toBe(210);
  const canvas = new Canvas(300, 300);
  const draw = canvas.getContext("2d");
  draw.drawImage(decoded.frames[1]!, 0, 0);
  expect(draw.getImageData(150, 299, 1, 1).data[3]).toBe(0);
  expect(draw.getImageData(150, 295, 1, 1).data[3]).toBe(255);
});
