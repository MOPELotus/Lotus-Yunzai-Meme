import { expect, test } from "bun:test";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { leaveNoteTemplate } from "../templates/leave-note.ts";
import { legacyPhotoFormTemplates } from "../templates/legacy-photo-forms.ts";
import { previewImage } from "../templates/template-layout.ts";
import { readMemeDate } from "../templates/meme-date.ts";

const signal = new AbortController().signal;
const context = { ...createBundledMemeResources(signal), signal };

test("原版图文表情保留别名、尺寸和静图格式，采访可接单图或双图", async () => {
  const sizes = {
    read_book: [2304, 2304, "jpeg"],
    coupon: [500, 355, "jpeg"],
    interview: [600, 310, "jpeg"],
    make_friend: [1000, 1000, "jpeg"],
    oshi_no_ko: [681, 851, "png"],
    sit_still: [1066, 974, "jpeg"],
    why_have_hands: [1500, 1495, "jpeg"],
  } as const;
  const avatar = await previewImage(signal);
  for (const template of legacyPhotoFormTemplates) {
    const [width, height, format] = sizes[template.info.key as keyof typeof sizes];
    const result = await template.render({ images: [avatar], texts: [], args: { user_infos: [{ name: "网友" }] } }, context);
    expect(await new Bun.Image(result).metadata()).toMatchObject({ width, height, format });
  }
  const interview = legacyPhotoFormTemplates.find(({ info }) => info.key === "interview")!;
  expect(interview.info.params_type).toMatchObject({ min_images: 1, max_images: 2, default_texts: ["采访大佬经验"] });
  const result = await interview.render({ images: [avatar, avatar], texts: ["采访朋友"], args: {} }, context);
  expect(await new Bun.Image(result).metadata()).toMatchObject({ width: 600, height: 310, format: "jpeg" });

  for (const key of ["make_friend", "why_have_hands"]) {
    const template = legacyPhotoFormTemplates.find(({ info }) => info.key === key)!;
    await expect(template.render({ images: [avatar], texts: [], args: {} }, context)).rejects.toThrow("文字或昵称");
  }
}, 20_000);

test("我推的网友保留快捷截取，动图逐帧绘制并采用原平均时长", async () => {
  const template = legacyPhotoFormTemplates.find(({ info }) => info.key === "oshi_no_ko")!;
  expect(template.info.shortcuts).toEqual([{ key: "我推的(?P<name>\\S+)", args: ["{name}"], humanized: "我推的xx" }]);
  const color = (red: number) => Uint8Array.from({ length: 16 }, (_, index) => index % 4 === 0 ? red : index % 4 === 3 ? 255 : 0);
  const gif = encodeMemeGif(2, 2, [{ rgba: color(120), delayMs: 40 }, { rgba: color(220), delayMs: 120 }], signal);
  const rendered = await template.render({ images: [new File([Uint8Array.from(gif)], "source.gif")], texts: ["网友"], args: {} }, context);
  const replay = await readMemeImageSequence(new File([Uint8Array.from(rendered)], "result.gif"), signal);
  expect(replay.frames).toHaveLength(2);
  expect(replay.averageDelayMs).toBe(80);
  expect([replay.frames[0].width, replay.frames[0].height]).toEqual([681, 851]);
});

test("请假条保留名字和日期选项，非法日期沿用当天", async () => {
  const parsed = parseGenerationArgs(leaveNoteTemplate.info.params_type.args_type, "游玩原神 -t 2025年4月3日 --name 荷花");
  expect(parsed).toMatchObject({ text: "游玩原神", values: { time: "2025年4月3日", name: "荷花" } });
  const now = new Date(2026, 10, 23, 16);
  const day = (input: unknown) => {
    const date = readMemeDate(input, now);
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  };
  expect(day("2025年4月3日")).toEqual([2025, 4, 3]);
  expect(day("2026/11/25")).toEqual([2026, 11, 25]);
  expect(day("明天")).toEqual([2026, 11, 24]);
  expect(day("下周三")).toEqual([2026, 12, 2]);
  expect(day("2025-02-29")).toEqual([2026, 11, 23]);
  const output = await leaveNoteTemplate.render({ images: [await previewImage(signal)], texts: [parsed.text], args: parsed.values! }, context);
  expect(await new Bun.Image(output).metadata()).toMatchObject({ width: 800, height: 950, format: "jpeg" });
});
