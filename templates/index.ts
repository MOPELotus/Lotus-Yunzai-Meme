import type { MemeTemplate } from "../builtin-template.ts";
import { hug, kiss } from "./kiss-hug.ts";
import { pat, rub } from "./pat-rub.ts";
import { petpet } from "./petpet.ts";
import { staticMemeTemplates } from "./static-layouts.ts";
import { transformMemeTemplates } from "./transforms.ts";

export const builtinMemeTemplates: readonly MemeTemplate[] = [
  petpet, pat, rub, kiss, hug,
  ...staticMemeTemplates,
  ...transformMemeTemplates,
];
