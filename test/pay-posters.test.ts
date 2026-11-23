import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { payPosterMemeTemplates } from "../templates/pay-posters.ts";

const signal = new AbortController().signal;
const context = { signal, ...createBundledMemeResources(signal) };
const sample = new File([Uint8Array.fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
)], "avatar.png");
const sampleUrl = "https://example.org/lotus-meme-example";

test("支付纸牌的原关键词与 -m 参数保留，按原尺寸从本机合成", async () => {
  const [ali, wechat] = payPosterMemeTemplates;
  for (const [template, size, name] of [[ali, [1080, 1620], "支付宝支付"], [wechat, [1242, 1692], "微信支付"]] as const) {
    expect(template.info.keywords).toEqual([name]);
    const params = template.info.params_type as { readonly args_type?: unknown };
    expect(parseGenerationArgs(params.args_type, `-m ${sampleUrl} 样例`)).toMatchObject({
      values: { message: sampleUrl }, text: "样例",
    });
    const bytes = await template.render({ images: [sample], texts: ["样例"], args: { message: sampleUrl } }, context);
    expect(Buffer.from(bytes).subarray(0, 3).toString("hex")).toBe("ffd8ff");
    const image = await loadImage(Buffer.from(bytes));
    expect([image.width, image.height]).toEqual([...size]);
  }
});

test("显式文字优先，缺文字使用原昵称与默认二维码内容", async () => {
  const [ali] = payPosterMemeTemplates;
  await expect(ali.render({ images: [sample], texts: [], args: {} }, context)).rejects.toThrow("昵称");
  await expect(ali.render({ images: [sample], texts: ["样例"], args: { message: "x".repeat(16000) } }, context))
    .rejects.toThrow("二维码内容过长");
  const implicit = await ali.render({ images: [sample], texts: [], args: { user_infos: [{ name: "样例" }] } }, context);
  const explicit = await ali.render({ images: [sample], texts: ["样例"],
    args: { message: "https://github.com/MemeCrafters/meme-generator", user_infos: [{ name: "其他" }] },
  }, context);
  expect(implicit).toEqual(explicit);
});
