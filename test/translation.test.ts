import { expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGuobaForm } from "../../../lib/panel-guoba.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { translateMemeToJapanese } from "../translation.ts";

const appid = "12345678901234567";
const secret = "only-a-mock-translation-secret";
const text = "独立测试 & 例子";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-translate-test-"));
  const previous = Bun.env.LOTUS_MEME_CONFIG_DIR;
  Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
  return {
    file: join(directory, "translation.yaml"),
    async cleanup() {
      if (previous === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
      else Bun.env.LOTUS_MEME_CONFIG_DIR = previous;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("典中典保留三条关键词和旧版一至两段文字的参数", () => {
  const template = builtinMemeTemplates.find(({ info }) => info.key === "dianzhongdian");
  expect(template?.info).toMatchObject({ key: "dianzhongdian", keywords: ["入典", "典中典", "黑白草图"],
    params_type: { min_images: 1, max_images: 1, min_texts: 1, max_texts: 2, default_texts: ["救命啊"], args_type: null } });
});

test("官方百度翻译只在凭据齐备时发请求，签名、范围及失败提示独立验证", async () => {
  const config = await fixture();
  const requests: URL[] = [];
  let response: () => Response = () => Response.json({ trans_result: [{ src: text, dst: "テスト" }] });
  const request = Object.assign(async (input: URL | string | Request, options?: RequestInit) => {
    expect(options?.redirect).toBe("error");
    expect(options?.method).toBe("GET");
    expect(options?.signal?.aborted).toBe(false);
    requests.push(new URL(String(input)));
    return response();
  }, { preconnect() {} });
  const fetched = spyOn(globalThis, "fetch").mockImplementation(request);
  try {
    const signal = new AbortController().signal;
    await expect(translateMemeToJapanese(text, signal)).rejects.toThrow('"baidu_trans_appid" 或 "baidu_trans_apikey" 未设置');
    await writeFile(config.file, `baidu_trans_appid: ${JSON.stringify(appid)}\n`);
    await expect(translateMemeToJapanese(text, signal)).rejects.toThrow("未设置");
    expect(requests).toHaveLength(0);
    await writeFile(config.file, `baidu_trans_appid: ${JSON.stringify(appid)}\nbaidu_trans_apikey: ${JSON.stringify(secret)}\n`);
    expect(await translateMemeToJapanese(text, signal)).toBe("テスト");
    const endpoint = requests[0]!;
    expect(endpoint.origin + endpoint.pathname).toBe("https://fanyi-api.baidu.com/api/trans/vip/translate");
    const salt = endpoint.searchParams.get("salt")!;
    expect(salt).toMatch(/^\d+$/u);
    expect(Object.fromEntries(endpoint.searchParams)).toEqual({ q: text, from: "auto", to: "jp", appid, salt,
      sign: createHash("md5").update(appid + text + salt + secret).digest("hex") });
    expect(endpoint.href).not.toContain(secret);
    for (const result of [() => Response.json({ error_code: 54003, error_msg: `${text}${secret}` }),
      () => new Response("X".repeat(40 * 1024)), () => { throw new Error(`${text}${secret}`); }]) {
      response = result;
      await expect(translateMemeToJapanese(text, signal)).rejects.toThrow(/^百度翻译暂不可用，请稍后再试或直接提供第二段文案。$/u);
    }
    const before = requests.length;
    await expect(translateMemeToJapanese(text, AbortSignal.abort())).rejects.toThrow();
    expect(requests).toHaveLength(before);
  } finally {
    fetched.mockRestore();
    await config.cleanup();
  }
});

test("主人面板仅展示翻译密钥的配置状态，留空保留并可明确清除", async () => {
  const config = await fixture();
  const key = "translation.baidu_trans_apikey";
  try {
    await writeFile(config.file, "# 可读说明\n", { mode: 0o644 });
    const form = await loadGuobaForm(fileURLToPath(new URL("../", import.meta.url)));
    if (!form) throw new Error("表情合成面板未加载");
    expect(form.schemas.find(schema => "field" in schema && schema.field === key)).toMatchObject({ component: "InputPassword" });
    expect(await form.save({ "translation.baidu_trans_appid": appid, [key]: secret })).toMatchObject({ ok: true });
    const snapshot = await form.read();
    expect(snapshot.configuredPasswords).toContain(key);
    expect(snapshot.values[key]).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect((await stat(config.file)).mode & 0o777).toBe(0o600);
    expect(await form.save({ [key]: "" })).toMatchObject({ ok: true });
    expect(await readFile(config.file, "utf8")).toContain(secret);
    expect(await form.save({ [key]: null })).toMatchObject({ ok: true });
    expect((await form.read()).configuredPasswords).not.toContain(key);
    expect(await readFile(config.file, "utf8")).not.toContain(secret);
  } finally { await config.cleanup(); }
});
