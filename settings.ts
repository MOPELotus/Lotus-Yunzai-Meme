import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { chmodSync, chownSync, closeSync, constants, fstatSync, fsyncSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isMap, isSeq, parseDocument } from "yaml";
import type { MemeReference } from "./reference-card.ts";
import { configDirectory, defaultAvatarCache, defaultManagedMemeTimeout, readConfig } from "./catalog-policy.ts";
import { isExcludedMemeName, memeNameExclusion } from "./catalog-exclusions.ts";

type Setting = readonly [title: string, key: string,
  type: "toggle" | "mode" | "users" | "templates", fallback: unknown];
type PanelSetting = Setting | readonly [title: string, key: string, type: "seconds", fallback: number];
type MemeNameExclusion = ReturnType<typeof memeNameExclusion>;
const sections = [
  { title: $t("settings.text_afc12c1a55"), file: "meme.yaml", fields: [
    [$t("settings.text_c5a62d9cb0"), "enable", "toggle", true],
    [$t("settings.text_24f2d79e2b"), "forceSharp", "toggle", false],
    [$t("settings.text_e89437675b"), "cache", "toggle", defaultAvatarCache],
    [$t("settings.text_c4ba41a93b"), "reply", "toggle", false],
    [$t("settings.text_71574c9a99"), "userName", "toggle", false],
    [$t("settings.text_954bb9ada7"), "imagesInMessage", "toggle", true],
    [$t("settings.text_7b8eaa7fd1"), "quotedImages", "toggle", true],
    [$t("settings.text_8949203415"), "errorReply", "toggle", true],
  ] satisfies Setting[] },
  { title: $t("settings.text_1ddd706592"), file: "access.yaml", fields: [
    [$t("settings.text_4bce67540f"), "enable", "toggle", false],
    [$t("settings.text_d1b53bdeb2"), "mode", "mode", 0],
    [$t("settings.text_8c4715253c"), "userWhiteList", "users", []],
    [$t("settings.text_6ae2ab05a0"), "userBlackList", "users", []],
    [$t("settings.text_9bef3636bc"), "blackListEnable", "toggle", false],
    [$t("settings.text_2857cc4121"), "blackList", "templates", []],
  ] satisfies Setting[] },
  { title: $t("settings.text_e5d932113e"), file: "protect.yaml", fields: [
    [$t("settings.text_f1b18e3110"), "list", "templates", []],
    [$t("settings.text_b9b173d82a"), "user", "users", []],
    [$t("settings.text_f2f840293d"), "enable", "toggle", false],
    [$t("settings.text_1bd63493b8"), "master", "toggle", false],
    [$t("settings.text_732ddf0412"), "userEnable", "toggle", false],
  ] satisfies Setting[] },
];

const panelSections: readonly { title: string; file: string; fields: readonly PanelSetting[] }[] = [
  { title: $t("settings.text_78c8f3b315"), file: "server.yaml", fields: [
    [$t("settings.text_939f087c86"), "managedTimeout", "seconds", defaultManagedMemeTimeout],
  ] },
  ...sections,
  { title: $t("settings.text_7720312544"), file: "stat.yaml", fields: [[$t("settings.text_1e6e80b1e5"), "enable", "toggle", true]] },
];

const settingCommand = /^#表情(?:合成)?设置\s*/u;
export interface SettingsContext {
  readonly isMaster?: boolean;
  readonly user_id?: number;
  readonly isBotMaster?: (userId: number) => boolean;
  readonly isDelegated?: boolean;
  readonly message?: string | readonly (Readonly<Record<string, unknown>> & { type: string })[];
}

function snapshot(file: string) {
  let fd: number;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { text: "{}\n", stat: undefined };
    throw error;
  }
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile()) throw new Error();
    return { text: readFileSync(fd, "utf8"), stat };
  } finally {
    closeSync(fd);
  }
}

function documentOf(text: string) {
  const document = parseDocument(text, { merge: true, strict: true, uniqueKeys: true });
  const persisted: unknown = Bun.YAML.parse(text) ?? {};
  if (document.errors.length || typeof persisted !== "object" || persisted === null || Array.isArray(persisted) ||
      !isDeepStrictEqual(document.toJS() ?? {}, persisted)) throw new Error();
  return { document, values: persisted as Record<string, unknown> };
}

function rewrite(
  directory: string,
  path: string,
  previous: ReturnType<typeof snapshot>,
  yaml: string,
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temp = mkdtempSync(join(directory, ".lotus-meme-"));
  try {
    const staged = join(temp, "settings.yaml");
    const fd = openSync(staged, "wx", 0o600);
    try {
      writeFileSync(fd, yaml, "utf8");
      if (previous.stat) {
        const owner = fstatSync(fd, { bigint: true });
        if (owner.uid !== previous.stat.uid || owner.gid !== previous.stat.gid) {
          chownSync(staged, Number(previous.stat.uid), Number(previous.stat.gid));
        }
        chmodSync(staged, Number(previous.stat.mode & 0o777n));
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const latest = snapshot(path);
    if (latest.text !== previous.text || latest.stat?.ino !== previous.stat?.ino ||
      latest.stat?.dev !== previous.stat?.dev || latest.stat?.ctimeNs !== previous.stat?.ctimeNs) throw new Error();
    renameSync(staged, path);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function settingValue(setting: PanelSetting, values: Record<string, unknown>): unknown {
  const value = values[setting[1]] ?? setting[3];
  // Older protection files can store a single QQ number instead of a sequence.
  if (setting[1] === "user" && (typeof value === "string" || typeof value === "number")) return [value];
  return value;
}

function visibleSettingValue(setting: PanelSetting, value: unknown, excluded: MemeNameExclusion): unknown {
  if (setting[2] !== "templates") return value;
  if (!Array.isArray(value)) return [];
  return value.filter(entry => (typeof entry === "string" || Number.isSafeInteger(entry)) && !excluded(String(entry)));
}

function panelField(group: string, [label, key, type]: PanelSetting) {
  const field = `${group}.${key}`;
  switch (type) {
    case "toggle": return { label, field, component: "Switch",
      ...(field === "meme.cache" && { bottomHelpMessage: $t("settings.text_9abebabf06") }) };
    case "mode": return { label, field, component: "Select", componentProps: { options: [
      { label: $t("settings.text_27e2d9e2d9"), value: 0 }, { label: $t("settings.text_174ec5a4ab"), value: 1 },
    ] } };
    case "users":
    case "templates": return { label, field, component: "Select", componentProps: { mode: "tags" } };
    case "seconds": return { label, field, component: "InputNumber", componentProps: { min: 0, max: 120 } };
  }
}

function panelValue(type: PanelSetting[2], value: unknown, excluded = isExcludedMemeName) {
  switch (type) {
    case "toggle": if (typeof value === "boolean") return value; break;
    case "mode": if (value === 0 || value === 1) return value; break;
    case "users":
    case "templates": {
      if (!Array.isArray(value) || !value.every(item => typeof item === "string" || Number.isSafeInteger(item))) break;
      const entries = value.map(item => typeof item === "string" ? item.trim() : item as number);
      if (type === "templates" ? entries.every(item => item !== "" && !excluded(String(item))) :
        entries.every(item => /^[1-9]\d*$/u.test(String(item)) && Number.isSafeInteger(Number(item)))) return entries;
      break;
    }
    case "seconds": {
      const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof number === "number" && Number.isFinite(number) && number > 0 && number <= 120) return number;
      break;
    }
  }
  throw new Error($t("settings.text_bd3956e837"));
}

function panelYaml(text: string, { document, values }: ReturnType<typeof documentOf>, updates: ReadonlyMap<string, unknown>) {
  const root = document.contents;
  const items = [...updates].map(([key, value]) => [key, JSON.stringify(value)] as const);
  const edits: { start: number; end: number; value: string }[] = [];
  if (isMap(root) || root === null) {
    const additions: string[] = [];
    for (const [key, value] of items) {
      const node = root?.get(key, true);
      if (node === undefined) {
        additions.push(`${key}: ${value}`);
        continue;
      }
      if (!node?.range) throw new Error();
      const [start, end] = node.range;
      const gap = start === end && text[start - 1] === ":" ? " " : "";
      const following = start === end && text[start] === "#" ? " " : "";
      const eol = /(?:\r?\n)+$/u.exec(text.slice(start, end))?.[0] ?? "";
      edits.push({ start, end, value: `${gap}${value}${following}${eol}` });
    }
    if (additions.length) {
      if (root?.flow && root.range) {
        const start = root.range[0] + 1;
        edits.push({ start, end: start, value: additions.join(", ") + (root.items.length ? ", " : "") });
      } else {
        const start = root?.range?.[1] ?? document.range?.[1] ?? text.length;
        const eol = /\r?\n/u.exec(text)?.[0] ?? "\n";
        const before = text.slice(0, start).replace(/^\uFEFF/u, "");
        edits.unshift({ start, end: start, value: (before && !before.endsWith("\n") ? eol : "") + additions.join(eol) + eol });
      }
    }
  } else if (root.range) {
    const [start, end] = root.range;
    edits.push({ start, end, value: `{${items.map(([key, value]) => `${key}: ${value}`).join(", ")}}` });
  } else {
    throw new Error();
  }
  const output = edits.sort((left, right) => right.start - left.start || right.end - left.end)
    .reduce((source, { start, end, value }) => source.slice(0, start) + value + source.slice(end), text);
  if (!isDeepStrictEqual(documentOf(output).values, { ...values, ...Object.fromEntries(updates) })) throw new Error();
  return output;
}

export function supportGuoba() {
  const fields = new Map<string, { file: string; setting: PanelSetting }>(panelSections.flatMap(({ file, fields }) => fields.map(setting => [
    `${file.slice(0, -5)}.${setting[1]}`, { file, setting },
  ] as const)));
  return {
    pluginInfo: { name: "meme", title: $t("settings.text_c6807b80bc"), isV3: true, isV2: false },
    configInfo: {
      schemas: panelSections.flatMap(({ title, file, fields }) => [
        { label: title, component: "SOFT_GROUP_BEGIN" }, ...fields.map(setting => panelField(file.slice(0, -5), setting)),
      ]),
      getConfigData() {
        const directory = configDirectory();
        const excluded = memeNameExclusion();
        return Object.fromEntries(panelSections.map(({ file, fields }) => {
          const values = readConfig(directory, file);
          return [file.slice(0, -5), Object.fromEntries(fields.map(setting => [
            setting[1], visibleSettingValue(setting, settingValue(setting, values), excluded),
          ]))];
        }));
      },
      setConfigData(data: Record<string, unknown>, { Result, changedFields }: {
        Result: { ok(): unknown; error(message: string, status: number): unknown }; changedFields?: readonly string[];
      }) {
        const patches = new Map<string, Map<string, unknown>>();
        let excluded: MemeNameExclusion | undefined;
        try {
          for (const name of changedFields ?? Object.keys(data)) {
            const entry = fields.get(name);
            if (!entry || !Object.hasOwn(data, name)) throw new Error();
            const { file, setting } = entry;
            const patch = patches.get(file) ?? new Map();
            if (setting[2] === "templates") excluded ??= memeNameExclusion();
            patch.set(setting[1], panelValue(setting[2], data[name], excluded));
            patches.set(file, patch);
          }
        } catch {
          return Result.error($t("settings.text_d21699fe5c"), 422);
        }

        const directory = configDirectory();
        const writes = [...patches].flatMap(([file, updates]) => {
          const path = join(directory, file);
          const previous = snapshot(path);
          const current = documentOf(previous.text);
          for (const [key, value] of updates) if (isDeepStrictEqual(current.values[key], value)) updates.delete(key);
          return updates.size ? [{ path, previous, yaml: panelYaml(previous.text, current, updates) }] : [];
        });
        for (const { path, previous, yaml } of writes) rewrite(directory, path, previous, yaml);
        return Result.ok();
      },
    },
  };
}

function show(setting: PanelSetting, value: unknown): string {
  if (setting[2] === "toggle") return value === true ? $t("settings.text_8da97ddda9") : $t("settings.text_3fd47edce4");
  if (setting[2] === "mode") return value === 1 ? $t("settings.text_174ec5a4ab") : $t("settings.text_27e2d9e2d9");
  if (setting[2] === "seconds") return $t("settings.text_55c9cd213f", { "value": value });
  return Array.isArray(value) && value.length ? value.map(String).join("、") : $t("settings.text_2f8267a89a");
}

function namesFor(argument: string, context: SettingsContext, users: boolean): string[] {
  if (!users) return argument.trim() ? [argument.trim()] : [];
  const parts = typeof context.message === "string" ? [] : context.message ?? [];
  const mentions = parts.flatMap((part) => part.type === "at" && part.qq != null ? [String(part.qq)] : []);
  if (!mentions.length && argument.trim()) mentions.push(argument.trim().replace(/^@\s*/u, ""));
  return mentions.every((id) => /^[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id)))
    ? [...new Set(mentions)] : [];
}

export function isMemeOwner(context: SettingsContext): boolean {
  return context.isDelegated !== true && (context.isMaster === true ||
    (context.user_id !== undefined && context.isBotMaster?.(context.user_id) === true));
}

function memeSettings(argument: string, context: SettingsContext): string | MemeReference {
  if (!isMemeOwner(context)) return $t("settings.text_5f9f117d1d");
  try {
    const directory = configDirectory();
    let excludeName: MemeNameExclusion | undefined;
    const excluded = (name: string) => (excludeName ??= memeNameExclusion())(name);
    const normalized = argument.replace(/^统计设置/u, "表情统计设置").replace(/^服务设置/u, "合成设置");
    const selected = panelSections.find((section) => normalized.startsWith(section.title));
    const action = (selected ? normalized.slice(selected.title.length).trimStart() : normalized)
      .replace(/^缓存/u, "头像缓存")
      .replace(/^本机合成超时（秒）/u, "合成超时（秒）");
    const candidates = selected ? [selected] : panelSections;
    for (const section of candidates) {
      // Some field names are prefixes of longer fields (e.g. 表情保护 and 表情保护列表).
      const setting = section.fields.filter(([title]) => action.startsWith(title))
        .sort(([left], [right]) => right.length - left.length)[0];
      if (!setting) continue;
      const [title, key, type] = setting;
      const value = action.slice(title.length).trim();
      const path = join(directory, section.file);
      const previous = snapshot(path);
      const { document, values } = documentOf(previous.text);
      const current = settingValue(setting, values);
      if (!value) return `${title}：${show(setting, visibleSettingValue(setting, current, excluded))}`;
      let next: unknown;
      if (type === "toggle") {
        if (value !== "开启" && value !== "关闭") return $t("settings.text_ce8cb065e4");
        next = value === "开启";
        document.set(key, next);
      } else if (type === "mode") {
        if (value !== "0" && value !== "1") return $t("settings.text_a29c9b95f8");
        next = Number(value);
        document.set(key, next);
      } else if (type === "seconds") {
        try { next = panelValue(type, value); }
        catch { return $t("settings.text_1303cd69ff", { "title": title }); }
        document.set(key, next);
      } else {
        const change = /^(添加|删除)\s*(.*)$/u.exec(value);
        const names = change && namesFor(change[2] ?? "", context, type === "users");
        if (!change || !names || !names.length) return $t("settings.text_ad800d378d");
        if (!Array.isArray(current) || current.some((entry) => typeof entry !== "string" && !Number.isSafeInteger(entry))) {
          throw new Error();
        }
        const contains = (entry: unknown) => names.includes(String(entry).trim());
        const added = names.filter((name) => !current.some((entry) => String(entry).trim() === name));
        const sequence = document.get(key, true);
        if (change[1] === "添加") {
          if (type === "templates" && names.some(excluded)) return $t("settings.text_a1d4baeda4");
          next = [...current, ...added];
          if (isSeq(sequence)) for (const item of added) sequence.add(item);
          else document.set(key, next);
        } else {
          next = current.filter((entry) => !contains(entry));
          if (isSeq(sequence)) {
            for (let i = current.length - 1; i >= 0; i--) if (contains(current[i])) sequence.delete(i);
          } else document.set(key, next);
        }
      }
      if (!isDeepStrictEqual(current, next)) {
        const yaml = document.toString();
        const written = documentOf(yaml).values;
        if (!isDeepStrictEqual(written, { ...values, [key]: next })) throw new Error();
        rewrite(directory, path, previous, yaml);
      }
      return `${title}：${show(setting, visibleSettingValue(setting, next, excluded))}`;
    }

    if (action) return $t("settings.text_1c53b7ad6c");
    const groups = candidates.map((section) => {
      const values = documentOf(snapshot(join(directory, section.file)).text).values;
      const entries = section.fields.map((field) => {
        const value = visibleSettingValue(field, settingValue(field, values), excluded);
        const detail = Array.isArray(value) ? (value.length ? $t("settings.text_dd4a9fca8f", { "length": value.length }) : $t("settings.text_80a57e03f0")) : show(field, value);
        return { title: field[0], detail };
      });
      return { title: section.title, entries };
    });
    return { title: $t("settings.text_d4bb9f1183"), view: "settings", groups };
  } catch {
    return $t("settings.text_eabce164b1");
  }
}

export function handleMemeSettings(message: string, context: SettingsContext): string | MemeReference | undefined {
  const match = settingCommand.exec(message);
  if (match) return memeSettings(message.slice(match[0].length).trim(), context);
}
