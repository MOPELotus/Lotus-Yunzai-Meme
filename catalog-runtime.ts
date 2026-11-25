import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
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
      if (!signal.aborted) console.warn($t("catalog-runtime.text_18ae92c446"), error);
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
