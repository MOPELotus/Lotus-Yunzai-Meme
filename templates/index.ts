import type { MemeTemplate } from "../builtin-template.ts";
import { avatarAccessoryMemeTemplates } from "./avatar-accessories.ts";
import { legacyFixedPoseTemplates } from "./legacy-fixed-poses.ts";
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
import { anyliewWordCardTemplates } from "./anyliew-word-cards.ts";
import { anyliewTextDialogueTemplates } from "./anyliew-text-dialogue.ts";
import { avatarCaptionMemeTemplates } from "./avatar-caption-cards.ts";
import { avatarFrameMemeTemplates } from "./avatar-frames.ts";
import { basicImageMemeTemplates } from "./basic-image-transforms.ts";
import { captionOverlayMemeTemplates } from "./caption-overlays.ts";
import { classicAvatarMemeTemplates } from "./classic-avatar-animations.ts";
import { classicLayeredMemeTemplates } from "./classic-layered-animations.ts";
import { croppedPhotoTemplates } from "./cropped-photo-templates.ts";
import { dianzhongdian } from "./dianzhongdian.ts";
import { fixedAvatarAnimations } from "./fixed-avatar-animation.ts";
import { shapeTimedAnimations } from "./shape-timed-animations.ts";
import { largeSourceAnimations } from "./large-source-animations.ts";
import { flush } from "./flush.ts";
import { jumpSoldMemeTemplates } from "./jump-sold.ts";
import { shortAvatarAnimations } from "./short-avatar-animation.ts";
import { localCanvasAnimations } from "./local-canvas-animation.ts";
import { twoLayerAvatarAnimations } from "./two-layer-avatar-animation.ts";
import { tudouShortAnimations } from "./tudou-short-animation.ts";
import { tudouPortraitAnimations } from "./tudou-portrait-animations.ts";
import { tudouLayeredTemplates, tudouOverlayTemplates, tudouExtendedOverlayTemplates } from "./tudou-layered-animations.ts";
import { tudouTailTemplates } from "./tudou-tail.ts";
import { tudouExtraTemplates } from "./tudou-extra.ts";
import { hug, kiss } from "./kiss-hug.ts";
import { legacyBadgeTemplates } from "./legacy-badges.ts";
import { legacyPhotoCaptionTemplates } from "./legacy-photo-captions.ts";
import { legacyPhotoFormTemplates } from "./legacy-photo-forms.ts";
import { leaveNoteTemplate } from "./leave-note.ts";
import { legacyPortraitEffectTemplates } from "./legacy-portrait-effects.ts";
import { legacySceneMemeTemplates } from "./legacy-scene.ts";
import { legacyCaptionSceneTemplates } from "./legacy-caption-scenes.ts";
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
import { portraitOverlayTemplates } from "./portrait-overlays.ts";
import { rectangleOverlayTemplates } from "./rectangle-overlays.ts";
import { rotatedInsetMemeTemplates } from "./rotated-insets.ts";
import { pythonOverlayMemeTemplates } from "./python-overlay-animation.ts";
import { staticMemeTemplates } from "./static-layouts.ts";
import { scrollingDialogueMemeTemplates } from "./scrolling-dialogue.ts";
import { subtitleMemeTemplates } from "./subtitle-animations.ts";
import { spatialRotationTemplates } from "./spatial-rotation.ts";
import { textAnnouncementMemeTemplates } from "./text-announcements.ts";
import { textGraphicsMemeTemplates } from "./text-graphics.ts";
import { specialTextCardTemplates } from "./special-text-cards.ts";
import { textPanelMemeTemplates } from "./text-panels.ts";
import { textSignMemeTemplates } from "./text-signs.ts";
import { textSpeechMemeTemplates } from "./text-speech.ts";
import { transformMemeTemplates } from "./transforms.ts";
import { timedOverlayMemeTemplates } from "./timed-overlays.ts";
import { waveMemeTemplate } from "./wave.ts";

export const builtinMemeTemplates: readonly MemeTemplate[] = [
  ...avatarAccessoryMemeTemplates,
  petpet, pat, rub, kiss, hug,
  ...staticMemeTemplates,
  ...scrollingDialogueMemeTemplates,
  ...subtitleMemeTemplates,
  ...spatialRotationTemplates,
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
  ...portraitOverlayTemplates,
  ...rectangleOverlayTemplates,
  ...anyliewAvatarSceneTemplates,
  ...anyliewStaticAvatarTemplates,
  ...anyliewTailTemplates,
  ...anyliewDialogueTemplates,
  ...anyliewCircleDialogueTemplates,
  ...anyliewSignTemplates,
  ...anyliewTextDialogueTemplates,
  ...anyliewWordCardTemplates,
  ...legacySceneMemeTemplates,
  ...legacyTextOverlayTemplates,
  ...legacyCaptionShortcutTemplates,
  ...legacyCaptionSceneTemplates,
  ...legacyBadgeTemplates,
  ...legacyPhotoCaptionTemplates,
  ...legacyPhotoFormTemplates,
  leaveNoteTemplate,
  ...legacyPortraitEffectTemplates,
  ...textSignMemeTemplates,
  ...perspectiveMemeTemplates,
  ...fixedAvatarAnimations,
  ...shapeTimedAnimations,
  ...largeSourceAnimations,
  ...anyliewAvatarCycleTemplates,
  ...legacyFixedPoseTemplates,
  anyliewDeerHelpTemplate,
  ...anyliewFixedBatchTemplates,
  ...anyliewFixedAnimationV2,
  ...anyliewLargeAvatarAnimations,
  ...classicAvatarMemeTemplates,
  ...classicLayeredMemeTemplates,
  ...timedOverlayMemeTemplates,
  flush,
  ...jumpSoldMemeTemplates,
  ...shortAvatarAnimations,
  ...localCanvasAnimations,
  ...croppedPhotoTemplates,
  ...twoLayerAvatarAnimations,
  ...tudouShortAnimations,
  ...tudouPortraitAnimations,
  ...tudouLayeredTemplates,
  ...tudouExtraTemplates,
  ...tudouOverlayTemplates,
  ...tudouTailTemplates,
  ...tudouExtendedOverlayTemplates,
  ...textSpeechMemeTemplates,
  ...pythonOverlayMemeTemplates,
  ...textAnnouncementMemeTemplates,
  ...textGraphicsMemeTemplates,
  ...specialTextCardTemplates,
  ...textPanelMemeTemplates,
];
