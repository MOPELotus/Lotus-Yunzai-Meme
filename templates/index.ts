import type { MemeTemplate } from "../builtin-template.ts";
import { anyliewAvatarCycleTemplates } from "./anyliew-avatar-cycle.ts";
import { anyliewDeerHelpTemplate } from "./anyliew-deer-help.ts";
import { anyliewFixedBatchTemplates } from "./anyliew-fixed-batch.ts";
import { anyliewAvatarSceneTemplates } from "./anyliew-avatar-scenes.ts";
import { anyliewFixedAnimationV2 } from "./anyliew-fixed-animation-v2.ts";
import { anyliewLargeAvatarAnimations } from "./anyliew-large-avatar-animation.ts";
import { anyliewCircleDialogueTemplates } from "./anyliew-circle-dialogue.ts";
import { anyliewDialogueTemplates } from "./anyliew-dialogue.ts";
import { anyliewSignTemplates } from "./anyliew-signs.ts";
import { anyliewStaticAvatarTemplates } from "./anyliew-static-avatar.ts";
import { anyliewTailTemplates } from "./anyliew-tail.ts";
import { anyliewTextDialogueTemplates } from "./anyliew-text-dialogue.ts";
import { avatarCaptionMemeTemplates } from "./avatar-caption-cards.ts";
import { avatarFrameMemeTemplates } from "./avatar-frames.ts";
import { basicImageMemeTemplates } from "./basic-image-transforms.ts";
import { captionOverlayMemeTemplates } from "./caption-overlays.ts";
import { classicAvatarMemeTemplates } from "./classic-avatar-animations.ts";
import { classicLayeredMemeTemplates } from "./classic-layered-animations.ts";
import { dianzhongdian } from "./dianzhongdian.ts";
import { fixedAvatarAnimations } from "./fixed-avatar-animation.ts";
import { flush } from "./flush.ts";
import { jumpSoldMemeTemplates } from "./jump-sold.ts";
import { shortAvatarAnimations } from "./short-avatar-animation.ts";
import { localCanvasAnimations } from "./local-canvas-animation.ts";
import { twoLayerAvatarAnimations } from "./two-layer-avatar-animation.ts";
import { tudouShortAnimations } from "./tudou-short-animation.ts";
import { tudouPortraitAnimations } from "./tudou-portrait-animations.ts";
import { tudouLayeredTemplates } from "./tudou-layered-animations.ts";
import { hug, kiss } from "./kiss-hug.ts";
import { legacyBadgeTemplates } from "./legacy-badges.ts";
import { legacyPhotoCaptionTemplates } from "./legacy-photo-captions.ts";
import { legacyPortraitEffectTemplates } from "./legacy-portrait-effects.ts";
import { legacySceneMemeTemplates } from "./legacy-scene.ts";
import { legacyCaptionShortcutTemplates } from "./legacy-caption-shortcuts.ts";
import { legacyTextOverlayTemplates } from "./legacy-text-overlays.ts";
import { mirrorFlashMemeTemplates } from "./mirror-flash.ts";
import { motionMemeTemplates } from "./motion.ts";
import { offsetMotionMemeTemplates } from "./offset-motion.ts";
import { overlayMemeTemplates } from "./overlays.ts";
import { pat, rub } from "./pat-rub.ts";
import { perspectiveMemeTemplates } from "./perspective.ts";
import { petpet } from "./petpet.ts";
import { photoCompositeMemeTemplates } from "./photo-composites.ts";
import { photoInsetMemeTemplates } from "./photo-insets.ts";
import { rectangleOverlayTemplates } from "./rectangle-overlays.ts";
import { rotatedInsetMemeTemplates } from "./rotated-insets.ts";
import { pythonOverlayMemeTemplates } from "./python-overlay-animation.ts";
import { staticMemeTemplates } from "./static-layouts.ts";
import { textAnnouncementMemeTemplates } from "./text-announcements.ts";
import { textGraphicsMemeTemplates } from "./text-graphics.ts";
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
  ...captionOverlayMemeTemplates,
  dianzhongdian,
  ...avatarFrameMemeTemplates,
  ...avatarCaptionMemeTemplates,
  ...photoCompositeMemeTemplates,
  ...photoInsetMemeTemplates,
  ...rotatedInsetMemeTemplates,
  ...rectangleOverlayTemplates,
  ...anyliewAvatarSceneTemplates,
  ...anyliewStaticAvatarTemplates,
  ...anyliewTailTemplates,
  ...anyliewDialogueTemplates,
  ...anyliewCircleDialogueTemplates,
  ...anyliewSignTemplates,
  ...anyliewTextDialogueTemplates,
  ...legacySceneMemeTemplates,
  ...legacyTextOverlayTemplates,
  ...legacyCaptionShortcutTemplates,
  ...legacyBadgeTemplates,
  ...legacyPhotoCaptionTemplates,
  ...legacyPortraitEffectTemplates,
  ...textSignMemeTemplates,
  ...perspectiveMemeTemplates,
  ...fixedAvatarAnimations,
  ...anyliewAvatarCycleTemplates,
  anyliewDeerHelpTemplate,
  ...anyliewFixedBatchTemplates,
  ...anyliewFixedAnimationV2,
  ...anyliewLargeAvatarAnimations,
  ...classicAvatarMemeTemplates,
  ...classicLayeredMemeTemplates,
  flush,
  ...jumpSoldMemeTemplates,
  ...shortAvatarAnimations,
  ...localCanvasAnimations,
  ...twoLayerAvatarAnimations,
  ...tudouShortAnimations,
  ...tudouPortraitAnimations,
  ...tudouLayeredTemplates,
  ...textSpeechMemeTemplates,
  ...pythonOverlayMemeTemplates,
  ...textAnnouncementMemeTemplates,
  ...textGraphicsMemeTemplates,
  ...textPanelMemeTemplates,
];
