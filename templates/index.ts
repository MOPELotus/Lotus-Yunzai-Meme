import type { MemeTemplate } from "../builtin-template.ts";
import { anyliewCircleDialogueTemplates } from "./anyliew-circle-dialogue.ts";
import { anyliewDialogueTemplates } from "./anyliew-dialogue.ts";
import { avatarFrameMemeTemplates } from "./avatar-frames.ts";
import { basicImageMemeTemplates } from "./basic-image-transforms.ts";
import { fixedAvatarAnimations } from "./fixed-avatar-animation.ts";
import { hug, kiss } from "./kiss-hug.ts";
import { legacySceneMemeTemplates } from "./legacy-scene.ts";
import { mirrorFlashMemeTemplates } from "./mirror-flash.ts";
import { motionMemeTemplates } from "./motion.ts";
import { offsetMotionMemeTemplates } from "./offset-motion.ts";
import { overlayMemeTemplates } from "./overlays.ts";
import { pat, rub } from "./pat-rub.ts";
import { perspectiveMemeTemplates } from "./perspective.ts";
import { petpet } from "./petpet.ts";
import { rectangleOverlayTemplates } from "./rectangle-overlays.ts";
import { pythonOverlayMemeTemplates } from "./python-overlay-animation.ts";
import { staticMemeTemplates } from "./static-layouts.ts";
import { textAnnouncementMemeTemplates } from "./text-announcements.ts";
import { textPanelMemeTemplates } from "./text-panels.ts";
import { textSignMemeTemplates } from "./text-signs.ts";
import { textSpeechMemeTemplates } from "./text-speech.ts";
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
  ...rectangleOverlayTemplates,
  ...anyliewDialogueTemplates,
  ...anyliewCircleDialogueTemplates,
  ...legacySceneMemeTemplates,
  ...textSignMemeTemplates,
  ...perspectiveMemeTemplates,
  ...fixedAvatarAnimations,
  ...textSpeechMemeTemplates,
  ...pythonOverlayMemeTemplates,
  ...textAnnouncementMemeTemplates,
  ...textPanelMemeTemplates,
];
