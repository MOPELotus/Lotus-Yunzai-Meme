import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

const maxAssetBytes = 64 * 1024 * 1024;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVerifiedFile(path: string, digest: string) {
  try {
    const file = await open(path, "r");
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > maxAssetBytes) return;
      const bytes = await file.readFile();
      if (sha256(bytes) === digest) return bytes;
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
