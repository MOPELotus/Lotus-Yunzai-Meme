import { expect, test } from "bun:test";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { MemeTemplateFeedback } from "../builtin-template.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { generateMemeReply } from "../generate-reply.ts";
import { screenProjection } from "../templates/projective-transform.ts";
import { textSignMemeTemplates } from "../templates/text-signs.ts";

const firefly = textSignMemeTemplates.find(({ info }) => info.key === "firefly_holdsign")!;
const signal = new AbortController().signal;

test("举牌透视变换把矩形映射至原牌面的四角", () => {
  const corners = [[10, 5], [92, 0], [100, 80], [0, 100]] as const;
  const matrix = screenProjection(50, 40, corners);
  const source = [[0, 0], [50, 0], [50, 40], [0, 40]] as const;
  expect(source.map(([x, y]) => {
    const point = matrix.transformPoint({ x, y, z: 0, w: 1 });
    return [Math.round(point.x / point.w), Math.round(point.y / point.w)];
  })).toEqual(corners.map(pair => [...pair]));
});

test("旧举牌模板保留别名、默认文本与只接收文字", () => {
  expect(textSignMemeTemplates.map(({ info }) => [info.key, info.keywords, info.params_type.default_texts])).toEqual([
    ["bronya_holdsign", ["布洛妮娅举牌", "大鸭鸭举牌"], ["V我50"]],
    ["nekoha_holdsign", ["猫羽雫举牌", "猫猫举牌"], ["V我50"]],
    ["nijika_holdsign", ["伊地知虹夏举牌", "虹夏举牌"], ["你可少看点二次元吧"]],
    ["raise_sign", ["举牌"], ["大佬带带我"]],
    ["run", ["快跑"], ["快跑"]],
    ["ayachi_holdsign", ["宁宁举牌"], ["我控制不住自己啊"]],
    ["firefly_holdsign", ["流萤举牌"], ["我超爱你"]],
  ]);
  expect(textSignMemeTemplates.every(({ info: { params_type: params } }) =>
    params.min_images === 0 && params.max_images === 0 && params.min_texts === 1 && params.max_texts === 1)).toBeTrue();
  expect(parseGenerationArgs(firefly.info.params_type.args_type, "-n 21 你好")).toMatchObject({ values: { number: 21 }, text: "你好" });
});

test("流萤举牌按编号读取原素材，越界回原提示且不请求资源", async () => {
  const requests: string[] = [];
  const context: MemeTemplateContext = {
    signal,
    async imageAsset(path) { requests.push(path); throw new Error("fixture"); },
    async fontAsset(path) { requests.push(path); throw new Error("fixture"); },
  };
  const input = { images: [], texts: ["你好"], args: { number: 21 } };
  await expect(firefly.render(input, context)).rejects.toThrow("fixture");
  expect(requests).toEqual(["firefly_holdsign/21.png", "ZCOOLKuaiLe-Regular.ttf"]);
  requests.length = 0;
  await expect(firefly.render({ ...input, args: { number: -1 } }, context)).rejects.toBeInstanceOf(MemeTemplateFeedback);
  expect(requests).toEqual([]);
});

test("安全的本机模板提示从聊天合成通道返回", async () => {
  const response = await generateMemeReply({
    message_type: "private", isMaster: true, isBotMaster: () => true, user_id: 1234,
    message: "#流萤举牌 -n 22",
  }, async () => ({ key: "firefly_holdsign", body: new FormData(), quote: false }), {
    catalogIdentity: "lotus-skia:fixture", timeout: 5_000,
    async keys() { return ["firefly_holdsign"]; },
    async info() { return firefly.info; },
    async generate() { throw new MemeTemplateFeedback("图片编号错误，请选择 1~21"); },
    async preview() { return; },
  }, signal);
  expect(response).toBe("图片编号错误，请选择 1~21");
});
