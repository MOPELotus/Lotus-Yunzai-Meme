import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchAvatar } from "../generate-reply.ts";
import { createProfileLikeImageRenderer } from "../lotus.ts";
import { renderProfileLikeImage } from "../profile-like-image.ts";

test("点赞配图只读取旧版素材清单并核对本地文件摘要", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-profile-like-"));
  try {
    await mkdir(join(directory, "crawl"));
    const fixture = Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    );
    await writeFile(join(directory, "crawl", "unknown.png"), fixture);
    expect(await renderProfileLikeImage(fixture, "failure", { directory, random: () => 0 })).toBeUndefined();
    await writeFile(join(directory, "crawl", "1.jpg"), fixture);
    expect(await renderProfileLikeImage(fixture, "failure", { directory, random: () => 0 })).toBeUndefined();

    let requests = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => {
      requests++;
      return new Response(fixture);
    }, { preconnect: previous.preconnect });
    try {
      const render = createProfileLikeImageRenderer(directory);
      expect(await render(10001, "failure")).toBeUndefined();
      expect(requests).toBe(0);
    } finally {
      globalThis.fetch = previous;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("点赞头像沿用受限的 QQ 下载，并可取消或保留普通合成尺寸", async () => {
  const previous = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, options?: RequestInit) => {
    urls.push(String(input));
    expect(options?.redirect).toBe("error");
    expect(options?.signal?.aborted).toBe(false);
    return new Response(Uint8Array.of(255, 216, 255));
  }, { preconnect: previous.preconnect });
  try {
    expect((await fetchAvatar("10001"))?.type).toBe("image/jpeg");
    const controller = new AbortController();
    expect((await fetchAvatar("10001", { size: 100, signal: controller.signal }))?.type).toBe("image/jpeg");
    controller.abort();
    expect(await fetchAvatar("10001", { size: 100, signal: controller.signal })).toBeUndefined();
    expect(await fetchAvatar("1e5", { size: 100 })).toBeUndefined();
    expect(urls).toEqual(["https://q1.qlogo.cn/g?b=qq&s=0&nk=10001", "https://q1.qlogo.cn/g?b=qq&s=100&nk=10001"]);
  } finally {
    globalThis.fetch = previous;
  }
});
