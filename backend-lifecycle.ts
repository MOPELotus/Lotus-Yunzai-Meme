import { join } from "node:path";
import { createMemeResources } from "./backend-resources.ts";
import type { MemeTemplate, MemeTemplateInput } from "./builtin-template.ts";
import {
  configDirectory, publishManagedMemeServer, safeCatalogKey, usesManagedMemeServer, type NativeMemeServer,
} from "./catalog-policy.ts";
import { isExcludedMemeTemplate } from "./template-policy.ts";

const maxOutputBytes = 8 * 1024 * 1024;

const nativeTriggers = new WeakMap<NativeMemeServer["generate"], readonly string[]>();

export function matchesManagedMemeTrigger(server: NativeMemeServer, message: string): boolean {
  const input = message.replace(/^#/u, "").toLowerCase();
  return nativeTriggers.get(server.generate)?.some(word => input.startsWith(word)) === true;
}

function buildRegistry(entries: readonly MemeTemplate[]) {
  const templates = new Map<string, MemeTemplate>();
  for (const template of entries) {
    const { key, tags } = template.info;
    if (!safeCatalogKey(key) || isExcludedMemeTemplate(key, tags)) continue;
    if (templates.has(key)) throw new Error(`重复的内置表情模板 ${key}`);
    templates.set(key, template);
  }
  return templates;
}

function parseInput(body: FormData): MemeTemplateInput {
  const images = body.getAll("images");
  const texts = body.getAll("texts");
  const raw = body.get("args");
  if (images.some((image) => typeof image === "string") || texts.some((value) => typeof value !== "string") ||
      (raw !== null && typeof raw !== "string")) throw new Error("无效的表情合成参数");
  const args: unknown = raw === null ? {} : JSON.parse(raw);
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new Error("无效的表情合成选项");
  return { images: images as File[], texts: texts as string[], args: args as Record<string, unknown> };
}

function validCount(actual: number, min: number, max: number) {
  return actual >= min && actual <= max;
}

export function createManagedMemeBackend(signal: AbortSignal, entries?: readonly MemeTemplate[]) {
  const lifetime = new AbortController();
  const active = AbortSignal.any([signal, lifetime.signal]);
  let withdraw: (() => void) | undefined;
  let starting: Promise<void> | undefined;

  function ensure() {
    if (active.aborted || withdraw) return;
    if (entries) return publish(entries);
    starting ??= import("./templates/index.ts").then(({ builtinMemeTemplates }) => publish(builtinMemeTemplates))
      .catch((error) => {
        if (usesManagedMemeServer()) throw error;
      }).finally(() => { starting = undefined; });
    return starting;
  }

  function publish(selected: readonly MemeTemplate[]) {
    if (active.aborted || withdraw) return;
    const registry = buildRegistry(selected);
    if (!registry.size) return;
    const resources = createMemeResources(join(configDirectory(), "..", "backend", "resources"), active);
    const keys = [...registry.keys()];
    const catalogIdentity = `lotus-skia:${Bun.hash(JSON.stringify([...registry.values()].map(({ info }) => info))).toString(16)}`;
    const managed = {
      catalogIdentity,
      async keys(caller?: AbortSignal) {
        active.throwIfAborted();
        caller?.throwIfAborted();
        return keys;
      },
      async info(key: string, caller?: AbortSignal) {
        active.throwIfAborted();
        caller?.throwIfAborted();
        return registry.get(key)?.info;
      },
      async generate(key: string, body: FormData, caller?: AbortSignal) {
        const template = registry.get(key);
        if (!template) return;
        const request = parseInput(body);
        const limits = template.info.params_type;
        if (!validCount(request.images.length, limits.min_images, limits.max_images) ||
            !validCount(request.texts.length, limits.min_texts, limits.max_texts)) return;
        return run((context) => template.render(request, context), caller);
      },
      async preview(key: string, caller?: AbortSignal) {
        const preview = registry.get(key)?.preview;
        if (!preview) return;
        return run(preview, caller);
      },
    };
    const triggers = [...registry.values()].flatMap(({ info }) => [
      ...info.keywords, ...(info.shortcuts ?? []).map(({ key }) => key),
    ]).filter(Boolean).map(word => word.toLowerCase());
    nativeTriggers.set(managed.generate, [...new Set(triggers)]);
    withdraw = publishManagedMemeServer(managed);

    async function run(render: NonNullable<MemeTemplate["preview"]>, caller?: AbortSignal) {
      const requestSignal = caller ? AbortSignal.any([active, caller]) : active;
      requestSignal.throwIfAborted();
      const canceled = Promise.withResolvers<never>();
      const cancel = () => canceled.reject(requestSignal.reason);
      requestSignal.addEventListener("abort", cancel, { once: true });
      const checkAsset = async (read: (path: string) => Promise<Buffer>, path: string) => {
        requestSignal.throwIfAborted();
        const bytes = await read(path);
        requestSignal.throwIfAborted();
        return bytes;
      };
      try {
        const bytes = await Promise.race([canceled.promise, render({
          signal: requestSignal,
          imageAsset: (path) => checkAsset(resources.imageAsset, path),
          fontAsset: (path) => checkAsset(resources.fontAsset, path),
        })]);
        requestSignal.throwIfAborted();
        if (bytes.byteLength > 0 && bytes.byteLength <= maxOutputBytes) return new Uint8Array(bytes);
      } finally {
        requestSignal.removeEventListener("abort", cancel);
      }
    }
  }

  function dispose() {
    lifetime.abort();
    withdraw?.();
    withdraw = undefined;
    signal.removeEventListener("abort", dispose);
  }

  signal.addEventListener("abort", dispose, { once: true });
  return { ensure, dispose };
}
