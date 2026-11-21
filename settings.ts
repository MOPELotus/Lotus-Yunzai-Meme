import { chmodSync, chownSync, closeSync, constants, fstatSync, fsyncSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Job } from "node-schedule";
import { isMap, isSeq, parseDocument } from "yaml";
import { configDirectory, normalizeCatalogCron, parseGenerationServerUrl, readConfig } from "./catalog-policy.ts";

type Setting = readonly [title: string, key: string, type: "toggle" | "mode" | "users" | "templates", fallback: unknown];
type PanelSetting = Setting | readonly [title: string, key: string, type: "url" | "seconds" | "cron", fallback: string | number];
const sections = [
  { title: "表情设置", file: "meme.yaml", fields: [
    ["默认表情", "enable", "toggle", true],
    ["强制触发", "forceSharp", "toggle", false],
    ["引用回复", "reply", "toggle", false],
    ["用户昵称", "userName", "toggle", false],
    ["消息图片", "imagesInMessage", "toggle", true],
    ["引用图片", "quotedImages", "toggle", true],
    ["错误回复", "errorReply", "toggle", true],
  ] satisfies Setting[] },
  { title: "名单设置", file: "access.yaml", fields: [
    ["名单限制", "enable", "toggle", false],
    ["名单模式", "mode", "mode", 0],
    ["用户白名单", "userWhiteList", "users", []],
    ["用户黑名单", "userBlackList", "users", []],
    ["禁用表情列表", "blackListEnable", "toggle", false],
    ["黑名单表情列表", "blackList", "templates", []],
  ] satisfies Setting[] },
  { title: "表情保护设置", file: "protect.yaml", fields: [
    ["表情保护列表", "list", "templates", []],
    ["保护用户列表", "user", "users", []],
    ["表情保护", "enable", "toggle", false],
    ["主人保护", "master", "toggle", false],
    ["用户保护", "userEnable", "toggle", false],
  ] satisfies Setting[] },
];

const panelSections: readonly { title: string; file: string; fields: readonly PanelSetting[] }[] = [
  { title: "服务设置", file: "server.yaml", fields: [
    ["服务地址", "url", "url", ""], ["请求超时（秒）", "timeout", "seconds", 5],
  ] },
  ...sections,
  { title: "表情统计设置", file: "stat.yaml", fields: [["表情统计", "enable", "toggle", true]] },
  { title: "目录更新设置", file: "other.yaml", fields: [
    ["自动更新资源", "autoUpdateRes", "toggle", true], ["自动更新 Cron", "autoUpdateResCron", "cron", "0 0 2 * * ?"],
  ] },
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

function panelField(group: string, [label, key, type]: PanelSetting) {
  const field = `${group}.${key}`;
  switch (type) {
    case "toggle": return { label, field, component: "Switch",
      ...(field === "other.autoUpdateRes" && { bottomHelpMessage: "重启后重新登记定时任务。" }) };
    case "mode": return { label, field, component: "Select", componentProps: { options: [
      { label: "白名单", value: 0 }, { label: "黑名单", value: 1 },
    ] } };
    case "users":
    case "templates": return { label, field, component: "Select", componentProps: { mode: "tags" } };
    case "url": return { label, field, component: "Input", bottomHelpMessage: "环境变量 LOTUS_MEME_SERVER_URL 优先。" };
    case "seconds": return { label, field, component: "InputNumber", componentProps: { min: 0, max: 120 } };
    case "cron": return { label, field, component: "EasyCron", bottomHelpMessage: "重启后按新时间更新目录。" };
  }
}

function panelValue(type: PanelSetting[2], value: unknown) {
  switch (type) {
    case "toggle": if (typeof value === "boolean") return value; break;
    case "mode": if (value === 0 || value === 1) return value; break;
    case "users":
    case "templates": {
      if (!Array.isArray(value) || !value.every(item => typeof item === "string" || Number.isSafeInteger(item))) break;
      const entries = value.map(item => typeof item === "string" ? item.trim() : item as number);
      if (type === "templates" ? entries.every(item => item !== "") :
        entries.every(item => /^[1-9]\d*$/u.test(String(item)) && Number.isSafeInteger(Number(item)))) return entries;
      break;
    }
    case "url": {
      if (typeof value !== "string") break;
      const url = value.trim();
      if (url) parseGenerationServerUrl(url);
      return url;
    }
    case "seconds": {
      const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof number === "number" && Number.isFinite(number) && number > 0 && number <= 120) return number;
      break;
    }
    case "cron": {
      const cron = normalizeCatalogCron(value);
      const job: Job & { readonly isOneTimeJob?: boolean } = new Job(() => {});
      try {
        if (job.schedule(cron) && !job.isOneTimeJob) return (value as string).trim();
      } finally {
        job.cancel();
      }
      break;
    }
  }
  throw new Error("无效的表情设置");
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
    pluginInfo: { name: "meme", title: "表情合成", isV3: true, isV2: false },
    configInfo: {
      schemas: panelSections.flatMap(({ title, file, fields }) => [
        { label: title, component: "SOFT_GROUP_BEGIN" }, ...fields.map(setting => panelField(file.slice(0, -5), setting)),
      ]),
      getConfigData() {
        const directory = configDirectory();
        return Object.fromEntries(panelSections.map(({ file, fields }) => {
          const values = readConfig(directory, file);
          return [file.slice(0, -5), Object.fromEntries(fields.map(setting => [setting[1], settingValue(setting, values)]))];
        }));
      },
      setConfigData(data: Record<string, unknown>, { Result, changedFields }: {
        Result: { ok(): unknown; error(message: string, status: number): unknown }; changedFields?: readonly string[];
      }) {
        const patches = new Map<string, Map<string, unknown>>();
        try {
          for (const name of changedFields ?? Object.keys(data)) {
            const entry = fields.get(name);
            if (!entry || !Object.hasOwn(data, name)) throw new Error();
            const { file, setting } = entry;
            const patch = patches.get(file) ?? new Map();
            patch.set(setting[1], panelValue(setting[2], data[name]));
            patches.set(file, patch);
          }
        } catch {
          return Result.error("表情配置包含未知字段或无效值。", 422);
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

function show(setting: Setting, value: unknown): string {
  if (setting[2] === "toggle") return value === true ? "开启" : "关闭";
  if (setting[2] === "mode") return value === 1 ? "黑名单" : "白名单";
  return Array.isArray(value) && value.length ? value.map(String).join("、") : "空";
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

function memeSettings(argument: string, context: SettingsContext): string {
  if (!isMemeOwner(context)) return "只有主人可以修改表情合成设置。";
  try {
    const directory = configDirectory();
    const selected = sections.find((section) => argument.startsWith(section.title));
    const action = selected ? argument.slice(selected.title.length).trimStart() : argument;
    const candidates = selected ? [selected] : sections;
    for (const section of candidates) {
      const setting = section.fields.find(([title]) => action.startsWith(title));
      if (!setting) continue;
      const [title, key, type] = setting;
      const value = action.slice(title.length).trim();
      const path = join(directory, section.file);
      const previous = snapshot(path);
      const { document, values } = documentOf(previous.text);
      const current = settingValue(setting, values);
      if (!value) return `${title}：${show(setting, current)}`;
      let next: unknown;
      if (type === "toggle") {
        if (value !== "开启" && value !== "关闭") return "请指定开启或关闭。";
        next = value === "开启";
        document.set(key, next);
      } else if (type === "mode") {
        if (value !== "0" && value !== "1") return "名单模式使用 0（白名单）或 1（黑名单）。";
        next = Number(value);
        document.set(key, next);
      } else {
        const change = /^(添加|删除)\s*(.*)$/u.exec(value);
        const names = change && namesFor(change[2] ?? "", context, type === "users");
        if (!change || !names || !names.length) return "请指定要添加或删除的名单项。";
        if (!Array.isArray(current) || current.some((entry) => typeof entry !== "string" && !Number.isSafeInteger(entry))) {
          throw new Error();
        }
        const contains = (entry: unknown) => names.includes(String(entry).trim());
        const added = names.filter((name) => !current.some((entry) => String(entry).trim() === name));
        const sequence = document.get(key, true);
        if (change[1] === "添加") {
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
      return `${title}：${show(setting, next)}`;
    }

    if (action) return "未找到该表情合成设置项。";
    return candidates.flatMap((section) => {
      const values = documentOf(snapshot(join(directory, section.file)).text).values;
      return [section.title, ...section.fields.map((field) =>
        `${field[0]}：${show(field, settingValue(field, values))}`)];
    }).join("\n");
  } catch {
    return "无法读取或保存表情合成设置，请检查本地 YAML 配置。";
  }
}

export function handleMemeSettings(message: string, context: SettingsContext): string | undefined {
  const match = settingCommand.exec(message);
  if (match) return memeSettings(message.slice(match[0].length).trim(), context);
}
