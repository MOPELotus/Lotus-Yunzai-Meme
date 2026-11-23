import type { createLocalMemeBackend } from "./backend-lifecycle.ts";
import type { LoadMemeInfoCard } from "./info-card-runtime.ts";
import { initializeLocalCatalog } from "./catalog-update.ts";

export interface MemeRuntime {
  readonly loadInfoCard?: LoadMemeInfoCard;
  whenReady(start: () => void): () => void;
}

export function startCatalogRuntime(
  runtime: MemeRuntime,
  signal: AbortSignal,
  backend: ReturnType<typeof createLocalMemeBackend>,
) {
  let startup: Promise<void> | undefined;
  async function initialize() {
    if (signal.aborted) return;
    try {
      await backend.ensure();
      const summary = await initializeLocalCatalog(signal);
      if (!signal.aborted && summary) console.info(`[meme] ${summary}`);
    } catch (error) {
      if (!signal.aborted) console.warn("[meme] 初始化表情目录失败。", error);
    }
  }

  const cancelReady = runtime.whenReady(() => {
    if (signal.aborted) return;
    startup ??= initialize();
  });
  return async () => {
    cancelReady();
    await startup;
  };
}
