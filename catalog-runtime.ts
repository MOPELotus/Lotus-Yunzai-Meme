import type { createManagedMemeBackend } from "./backend-lifecycle.ts";
import type { LoadMemeInfoCard } from "./info-card-runtime.ts";
import { catalogRefreshSchedule } from "./catalog-policy.ts";
import { runAutomaticCatalogRefresh } from "./catalog-update.ts";

export interface MemeRuntime {
  readonly loadInfoCard?: LoadMemeInfoCard;
  whenReady(start: () => void): () => void;
  registerTask(cron: string, run: () => Promise<void>): () => void | Promise<void>;
}

export function startCatalogRuntime(
  runtime: MemeRuntime,
  signal: AbortSignal,
  backend: ReturnType<typeof createManagedMemeBackend>,
) {
  let startup: Promise<void> | undefined;
  let unregister: (() => void | Promise<void>) | undefined;

  async function refresh(initializing = false) {
    if (signal.aborted) return;
    try {
      if (!initializing && !catalogRefreshSchedule()) return;
      await backend.ensure();
      const summary = await runAutomaticCatalogRefresh(signal, initializing);
      if (!signal.aborted && summary) console.info(`[meme] ${summary}`);
    } catch (error) {
      if (!signal.aborted) console.warn(initializing ? "[meme] 初始化表情目录失败。" : "[meme] 自动更新表情包数据失败，保留已有目录。", error);
    }
  }

  const cancelReady = runtime.whenReady(() => {
    if (signal.aborted) return;
    startup = refresh(true);
    try {
      const cron = catalogRefreshSchedule();
      if (cron) unregister = runtime.registerTask(cron, refresh);
    } catch {
      console.warn("[meme] 表情包数据定时配置无效。");
    }
  });
  return async () => {
    cancelReady();
    await Promise.all([startup, unregister?.()]);
  };
}
