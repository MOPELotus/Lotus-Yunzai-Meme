import type { MemeTemplate } from "../builtin-template.ts";
import { avatarFrameMemeTemplates } from "./avatar-frames.ts";
import { basicImageMemeTemplates } from "./basic-image-transforms.ts";
import { hug, kiss } from "./kiss-hug.ts";
import { legacySceneMemeTemplates } from "./legacy-scene.ts";
import { mirrorFlashMemeTemplates } from "./mirror-flash.ts";
import { motionMemeTemplates } from "./motion.ts";
import { offsetMotionMemeTemplates } from "./offset-motion.ts";
import { overlayMemeTemplates } from "./overlays.ts";
import { pat, rub } from "./pat-rub.ts";
import { petpet } from "./petpet.ts";
import { staticMemeTemplates } from "./static-layouts.ts";
import { textSignMemeTemplates } from "./text-signs.ts";
import { transformMemeTemplates } from "./transforms.ts";
import { waveMemeTemplate } from "./wave.ts";

export const builtinMemeTemplates: readonly MemeTemplate[] = [
  petpet, pat, rub, kiss, hug,
  ...staticMemeTemplates,
  ...transformMemeTemplates,
  ...basicImageMemeTemplates,
  ...motionMemeTemplates,
  ...offsetMotionMemeTemplates,
  ...mirrorFlashMemeTemplates,
  waveMemeTemplate,
  ...overlayMemeTemplates,
  ...avatarFrameMemeTemplates,
  ...legacySceneMemeTemplates,
  ...textSignMemeTemplates,
];
