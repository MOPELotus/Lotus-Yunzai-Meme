import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { pjskCharacters } from "./pjsk-characters.ts";

// Fixed from the original Python CommandShortcut registrations.
// Group order is also the argument order, including the legacy low/high inversion for high_EQ.
export interface NativeShortcutPattern {
  readonly template: string;
  readonly source: string;
  readonly pattern: RegExp;
  readonly captions?: readonly string[];
  readonly args?: readonly string[];
  readonly option?: { readonly name: string; readonly capture: string; readonly suffix: string };
  readonly humanized?: string;
}

export function matchFixedShortcut(definition: NativeShortcutPattern, candidate: string) {
  const match = definition.pattern.exec(candidate);
  if (!match) return;
  const option = definition.option;
  const value = option && match.groups?.[option.capture];
  if (option && value === undefined) return;
  const captions = definition.captions ?? (option ? [] : undefined);
  const shortcutTexts = captions ? captions.map(name => match.groups?.[name]) : [match[1]];
  if (!shortcutTexts.every(text => text !== undefined)) return;
  return {
    keyword: match[0],
    shortcutTexts: shortcutTexts.length ? shortcutTexts : undefined,
    preset: option && value !== undefined ? { name: option.name, value: value + option.suffix } : undefined,
  };
}

const pjskPatterns = pjskCharacters.map(([name, english], index) => {
  const source = `(:?pjsk|世界计划)[_-]?(:?${name}|${english})`;
  return {
    template: "pjsk", source, pattern: new RegExp(`^${source}`, "iu"),
    captions: [], args: ["--character", String(index + 1)], humanized: `pjsk${name}`,
  };
});

const patterns: readonly NativeShortcutPattern[] = [
  ...pjskPatterns,
  {
    template: "oshi_no_ko", source: "我推的(?P<name>\\S+)",
    pattern: /^我推的(?<name>\S+)(?=\s|$)/u, captions: ["name"], humanized: $t("legacy-caption-shortcuts.text_28fd6e3c41"),
  },
  {
    template: "caused_by_this", source: "你的(?P<text>.+?)(?:主要)?都?是由?这个引起的",
    pattern: /^你的(?<text>.+?)(?:主要)?都?是由?这个引起的(?=\s|$)/u,
    captions: ["text"], humanized: $t("legacy-caption-shortcuts.text_8e52f516dc"),
  },
  {
    template: "high_EQ",
    source: "低情商[\\s:：]*(?P<low>\\S+)\\s*高情商[\\s:：]*(?P<high>\\S+)",
    pattern: /^低情商[\s:：]*(?<low>\S+)\s*高情商[\s:：]*(?<high>\S+)(?=\s|$)/u,
    captions: ["low", "high"], humanized: $t("legacy-caption-shortcuts.text_9a2ce2d9df"),
  },
  {
    template: "high_EQ",
    source: "高情商[\\s:：]*(?P<high>\\S+)\\s*低情商[\\s:：]*(?P<low>\\S+)",
    pattern: /^高情商[\s:：]*(?<high>\S+)\s*低情商[\s:：]*(?<low>\S+)(?=\s|$)/u,
    captions: ["low", "high"], humanized: $t("legacy-caption-shortcuts.text_5801191b6b"),
  },
  {
    template: "intel_inside", source: "(?P<text>\\S{1,10})\\s+inside",
    pattern: /^(?<text>\S{1,10})\s+inside(?=\s|$)/u, captions: ["text"], humanized: "xx inside",
  },
  {
    template: "wujing", source: "吴京[\\s:：]*(?P<left>\\S*)中国(?P<right>\\S*)",
    pattern: /^吴京[\s:：]*(?<left>\S*)中国(?<right>\S*)(?=\s|$)/u,
    captions: ["left", "right"], humanized: $t("legacy-caption-shortcuts.text_94d19939fe"),
  },
  {
    template: "wakeup", source: "(?P<text>\\S{1,4})\\s+起来了",
    pattern: /^(?<text>\S{1,4})\s+起来了(?=\s|$)/u, captions: ["text"], humanized: $t("legacy-caption-shortcuts.text_1d3f0aae06"),
  },
];

export const legacyCaptionShortcutPatterns: readonly NativeShortcutPattern[] = patterns;

export function legacyCaptionShortcuts(template: string) {
  return patterns.filter(entry => entry.template === template).map(({ source, captions, args, humanized }) => ({
    key: source, args: args ?? captions?.map(name => "{" + name + "}"), humanized,
  }));
}
