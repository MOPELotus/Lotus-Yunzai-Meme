type Argument = string | number | boolean;
type Fields = Record<string, unknown>;

function record(value: unknown): Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Fields : {};
}

interface ParserOption {
  readonly dest: string;
  readonly value?: Argument;
}

function optionsFor(schema: Fields, properties: Fields) {
  const options = new Map<string, ParserOption>();
  if (!Array.isArray(schema.parser_options)) return options;
  for (const value of schema.parser_options) {
    const option = record(value);
    if (option.compact === true || !Array.isArray(option.names)) continue;
    const args = Array.isArray(option.args) ? option.args : [];
    const action = record(option.action);
    const dest = typeof option.dest === "string" ? option.dest
      : args.length === 1 ? record(args[0]).name
      : option.names.find((name) => typeof name === "string" && /^--\w/u.test(name))?.slice(2);
    if (typeof dest !== "string" || dest === "user_infos" || !Object.hasOwn(properties, dest)) continue;
    if (args.length === 0 && (action.type !== 0 ||
        !["string", "number", "boolean"].includes(typeof action.value))) continue;
    if (args.length > 1) continue;
    const parsed: ParserOption = args.length === 0
      ? { dest, value: action.value as Argument } : { dest };
    for (const name of option.names) {
      if (typeof name === "string" && /^--?\w/u.test(name)) options.set(name, parsed);
    }
  }
  return options;
}

function asType(raw: Argument, property: unknown): Argument | undefined {
  const schema = record(property);
  let result: Argument | undefined;
  switch (schema.type) {
    case "string":
      result = String(raw);
      break;
    case "integer": {
      const value = /^[-+]?\d+$/u.test(String(raw)) ? Number(raw) : NaN;
      if (Number.isSafeInteger(value) &&
          (typeof schema.minimum !== "number" || value >= schema.minimum) &&
          (typeof schema.maximum !== "number" || value <= schema.maximum)) result = value;
      break;
    }
    case "boolean": {
      const value = String(raw).toLowerCase();
      if (["true", "1", "yes", "on", "t", "y"].includes(value)) result = true;
      else if (["false", "0", "no", "off", "f", "n"].includes(value)) result = false;
      break;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(result)) return;
  return result;
}

function unquote(token: string): string {
  if (token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1).replace(/\\(["\\])/gu, "$1");
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
  return token;
}

export function parseGenerationArgs(argsType: unknown, input: string) {
  const schema = record(argsType);
  const properties = record(record(schema.args_model).properties);
  const flags = optionsFor(schema, properties);
  const values = new Map<string, Argument>();
  let issue: string | undefined;
  let found = false;

  function apply(name: string, raw: Argument) {
    if (name === "user_infos" || !Object.hasOwn(properties, name)) {
      issue ??= `该表情不支持参数：${name}`;
      return;
    }
    const value = asType(raw, properties[name]);
    if (value === undefined) issue ??= `表情参数 ${name} 的值无效。`;
    else values.set(name, value);
  }

  // The legacy syntax consumes text after #name up to the next # section.
  const remaining = input.replace(/#([^#\s]+)\s+([^#]+)/gu, (_, name: string, value: string) => {
    found = true;
    apply(name, value.trim());
    return "";
  });
  const tokens = [...remaining.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/gu)];
  const rest: string[] = [];
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const option = flags.get(token[0]);
    if (!option) continue;

    found = true;
    rest.push(remaining.slice(cursor, token.index));
    cursor = token.index + token[0].length;
    if (option.value !== undefined) {
      apply(option.dest, option.value);
      continue;
    }
    const next = tokens[i + 1];
    if (!next || flags.has(next[0]) || /^--?[a-z]/iu.test(next[0])) {
      issue ??= `表情参数 ${option.dest} 缺少值。`;
      continue;
    }
    apply(option.dest, unquote(next[0]));
    cursor = next.index + next[0].length;
    i++;
  }
  rest.push(remaining.slice(cursor));

  return { values: Object.fromEntries(values), text: rest.join("").trim(), found, issue };
}

export function argsTypeFromParams(serialized: string | undefined): unknown {
  if (!serialized) return;
  try {
    return record(JSON.parse(serialized)).args_type;
  } catch {
    return;
  }
}
