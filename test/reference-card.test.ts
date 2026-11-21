import { expect, test } from "bun:test";
import module from "../lotus.ts";

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
  for (const command of ["#表情版本", "memeVersionInfo", "表情合成版本信息", "#表情插件更新日志"]) {
    expect(await module.fallback(command, actor)).toContain("模块版本");
  }
  expect(await module.fallback("#表情合成插件强制更新", owner)).toContain("#强制更新 meme");
  expect(await module.fallback("#表情插件更新", actor)).toContain("只有主人");
});
