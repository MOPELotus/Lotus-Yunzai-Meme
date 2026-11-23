import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const downloadLimit = 64 * 1024 * 1024;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVerifiedFile(path: string, digest: string) {
  try {
    const file = await open(path, "r");
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > downloadLimit) return;
      const bytes = await file.readFile();
      if (sha256(bytes) === digest) return bytes;
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function writeBackendFile(path: string, bytes: Uint8Array, signal: AbortSignal) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, signal });
    signal.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function downloadVerifiedFile(url: string, digest: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > downloadLimit) {
    await response.body?.cancel();
    throw new Error(`表情资源下载失败 (${response.status})`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > downloadLimit) throw new Error("表情资源下载超过大小限制");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, size);
  if (sha256(bytes) !== digest) throw new Error("表情资源文件摘要不匹配");
  return bytes;
}
