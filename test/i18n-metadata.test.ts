import { expect, test } from "bun:test";

async function metadata(language: "zh-CN" | "en") {
  const runtime = new URL("../../../packages/i18n/index.ts", import.meta.url).href;
  const catalog = new URL("../i18n/zh-CN.json", import.meta.url).href;
  const templates = new URL("../templates/index.ts", import.meta.url).href;
  const presets = new URL("../models/Meme/preset.ts", import.meta.url).href;
  const characters = new URL("../pjsk-characters.ts", import.meta.url).href;
  const shortcuts = new URL("../legacy-caption-shortcuts.ts", import.meta.url).href;
  const script = `
    const {registerLanguage,setLanguage} = await import(${JSON.stringify(runtime)});
    const catalog = (await import(${JSON.stringify(catalog)})).default;
    if (${JSON.stringify(language)} === "en") {
      registerLanguage("en", {meme:Object.fromEntries(Object.keys(catalog.messages).map(key => [key,"EN:"+key]))});
      setLanguage("en");
    }
    const {builtinMemeTemplates} = await import(${JSON.stringify(templates)});
    const {preset} = await import(${JSON.stringify(presets)});
    const {pjskCharacters} = await import(${JSON.stringify(characters)});
    const {legacyCaptionShortcutPatterns} = await import(${JSON.stringify(shortcuts)});
    // Import metadata only: do not call render/preview or create a raster canvas.
    console.log(JSON.stringify({
      templates:builtinMemeTemplates.map(({info}) => ({
        key:info.key, keywords:info.keywords, tags:info.tags??[],
        shortcuts:(info.shortcuts??[]).map(({key,args})=>({key,args})),
        defaults:info.params_type.default_texts??[],
      })),
      presets:preset.map(({name,key,arg_name,arg_value})=>({name,key,arg_name,arg_value})),
      characters:pjskCharacters,
      patterns:legacyCaptionShortcutPatterns.map(({template,source,pattern,captions,args,option})=>({template,source,pattern:pattern.source,captions,args,option})),
    }));
  `;
  const child = Bun.spawn([process.execPath, "--eval", script], {
    cwd: import.meta.dir, env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe", timeout: 15_000,
  });
  const [output, error] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(await child.exited).toBe(0);
  expect(error).toBe("");
  return JSON.parse(output) as {
    templates: { key: string; keywords: string[]; tags: string[]; defaults: string[]; shortcuts: unknown[] }[];
    presets: { name: string; key: string; arg_name: string; arg_value: string | number }[];
    characters: unknown[];
    patterns: unknown[];
  };
}

test("switching every message preserves all template routing metadata and translates captions and preset names", async () => {
  // Each process selects its language before template modules cache their top-level text.
  const [chinese, english] = await Promise.all([metadata("zh-CN"), metadata("en")]);
  expect(chinese.templates.length).toBeGreaterThan(700);
  const routing = (items: typeof chinese.templates) => items.map(({ defaults: _defaults, ...info }) => info);
  expect(routing(english.templates)).toEqual(routing(chinese.templates));
  expect(english.characters).toEqual(chinese.characters);
  expect(english.patterns).toEqual(chinese.patterns);
  expect(english.presets.map(({ name: _name, ...value }) => value)).toEqual(chinese.presets.map(({ name: _name, ...value }) => value));
  expect(english.presets.some((value, index) => value.name !== chinese.presets[index]!.name)).toBe(true);
  const translatedCaptions = english.templates.filter((value, index) => JSON.stringify(value.defaults) !== JSON.stringify(chinese.templates[index]!.defaults));
  expect(translatedCaptions.length).toBeGreaterThan(100);
  expect(chinese.templates.find(info => info.key === "mihoyo_qiqi_suck")?.keywords).toContain("七七舔");
  expect(english.templates.find(info => info.key === "mihoyo_qiqi_suck")?.keywords).toContain("七七舔");
}, 20_000);
