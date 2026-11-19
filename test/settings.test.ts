import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogPolicy, generationSettings } from "../catalog-policy.ts";
import module from "../lotus.ts";
import { buildGenerationBody } from "../generation.ts";

test("旧清语设置命令可安全更新隔离 YAML 并即时生效", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-settings-"));
  const previous = Bun.env.LOTUS_MEME_CONFIG_DIR;
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    const meme = join(directory, "meme.yaml");
    const access = join(directory, "access.yaml");
    const source = "# 保留旧注释\nforceSharp: true # 前缀设置\ncache: true\n未知字段: { a: 1 }\n";
    await writeFile(meme, source, { mode: 0o640 });
    await writeFile(access, "enable: true\nmode: 0\nuserWhiteList: [10001]\nblackList: []\n");
    const owner = { message_type: "group" as const, user_id: 10001, isMaster: true, isBotMaster: () => false };
    const user = { ...owner, isMaster: false };
    const milkyOwner = { ...user, isBotMaster: (id: number) => id === 10001 };
    function settings(argument: string, actor: Parameters<typeof module.fallback>[1]) {
      return module.fallback("#清语表情设置 " + argument, actor);
    }
    expect(await module.fallback("#清语表情设置强制触发关闭", { ...owner, isDelegated: true })).toContain("只有主人");
    expect(await settings("强制触发关闭", user)).toContain("只有主人");
    expect(await module.fallback("#表情合成设置强制触发关闭", user)).toBe("只有主人可以修改表情合成设置。");
    expect(await readFile(meme, "utf8")).toBe(source);
    expect(await settings("强制触发", owner)).toBe("强制触发：开启");
    expect(await module.fallback("#表情设置 强制触发", owner)).toBe("强制触发：开启");
    expect(await readFile(meme, "utf8")).toBe(source);

    expect(await module.fallback("#表情合成设置表情设置 强制触发关闭", owner)).toBe("强制触发：关闭");
    expect(catalogPolicy(10001, true).forceSharp).toBe(false);
    expect(await readFile(meme, "utf8")).toContain("# 保留旧注释");
    expect(await readFile(meme, "utf8")).toContain("# 前缀设置");
    expect(Bun.YAML.parse(await readFile(meme, "utf8"))).toEqual({
      forceSharp: false, cache: true, 未知字段: { a: 1 },
    });
    expect((await stat(meme)).mode & 0o777).toBe(0o640);
    expect(await settings("引用回复开启", milkyOwner)).toBe("引用回复：开启");
    expect(generationSettings().quote).toBe(true);

    expect(await settings("名单设置 用户白名单 添加", {
      ...owner, message: [{ type: "at", qq: 10001 }, { type: "at", qq: 10002 }],
    })).toBe("用户白名单：10001、10002");
    expect(catalogPolicy(10002).allowed).toBe(true);
    expect(await settings("用户白名单 删除10001", owner)).toBe("用户白名单：10002");
    expect(catalogPolicy(10001).allowed).toBe(false);
    expect(await settings("黑名单表情列表 添加可莉吃", owner)).toBe("黑名单表情列表：可莉吃");
    expect(await settings("禁用表情列表开启", owner)).toBe("禁用表情列表：开启");
    expect(catalogPolicy(10002).hidden).toEqual(["可莉吃"]);

    const protect = join(directory, "protect.yaml");
    const oldProtection = `# 旧保护设置
enable: false
master: false
userEnable: false
user: 10002
list: []
保留字段: 原样
`;
    await writeFile(protect, oldProtection);
    expect(await settings("保护用户列表", milkyOwner)).toBe("保护用户列表：10002");
    expect(await settings("保护用户列表 添加10002", milkyOwner)).toBe("保护用户列表：10002");
    expect(await readFile(protect, "utf8")).toBe(oldProtection);
    expect(await settings("表情保护列表 添加旧关键词", milkyOwner)).toBe("表情保护列表：旧关键词");
    expect(await settings("表情保护开启", milkyOwner)).toBe("表情保护：开启");
    expect(await settings("用户保护开启", milkyOwner)).toBe("用户保护：开启");

    const recipe = JSON.stringify({ min_images: 1, max_images: 2, min_texts: 0, max_texts: 0 });
    async function imageOrder(isMaster: boolean, targetMaster = false) {
      const prepared = await buildGenerationBody("fixture", ["旧关键词"], "", recipe, {
        user_id: 10001, isMaster, mentions: [10002],
        avatar: async (user) => new Blob([user]), isTargetMaster: () => targetMaster,
      });
      if (typeof prepared === "string") throw new Error(prepared);
      return await Promise.all(prepared.body.getAll("images").map((image) => (image as Blob).text()));
    }
    expect(await imageOrder(false)).toEqual(["10001", "10002"]);
    expect(await settings("主人保护开启", milkyOwner)).toBe("主人保护：开启");
    expect(await imageOrder(false, false)).toEqual(["10002", "10001"]);
    expect(await imageOrder(false, true)).toEqual(["10001", "10002"]);
    expect(await imageOrder(true, true)).toEqual(["10002", "10001"]);
    expect(await settings("保护用户列表 添加10003", milkyOwner)).toBe("保护用户列表：10002、10003");
    expect(await settings("保护用户列表 删除10002", milkyOwner)).toBe("保护用户列表：10003");
    expect(await readFile(protect, "utf8")).toContain("# 旧保护设置");
    expect(Bun.YAML.parse(await readFile(protect, "utf8"))).toEqual({
      enable: true, master: true, userEnable: true, user: ["10003"], list: ["旧关键词"], 保留字段: "原样",
    });

    await writeFile(meme, "forceSharp: [\n");
    expect(await settings("强制触发关闭", owner)).toContain("无法读取或保存");
    expect(await readFile(meme, "utf8")).toBe("forceSharp: [\n");
    const alternate = join(directory, "alternate");
    await writeFile(alternate, "forceSharp: true\n");
    await rm(meme);
    await symlink(alternate, meme);
    expect(await settings("强制触发关闭", owner)).toContain("无法读取或保存");
    expect(await readFile(alternate, "utf8")).toBe("forceSharp: true\n");
  } finally {
    if (previous === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
