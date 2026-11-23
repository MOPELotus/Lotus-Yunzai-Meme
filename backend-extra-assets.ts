import { anyliewSignAssets } from "./backend-anyliew-sign-assets.ts";
import { anyliewLargeAvatarAssets } from "./backend-anyliew-large-avatar-assets.ts";
import { anyliewTextDialogueAssets } from "./backend-text-dialogue-assets.ts";
import { anyliewAvatarSceneAssets } from "./backend-anyliew-avatar-scene-assets.ts";
import { anyliewFixedAnimationV2Assets } from "./backend-anyliew-fixed-animation-v2-assets.ts";
import { anyliewStaticAvatarAssets } from "./backend-anyliew-static-avatar-assets.ts";
import { anyliewTailAssets } from "./backend-anyliew-tail-assets.ts";
import { anyliewCircleDialogueAssets } from "./backend-circle-dialogue-assets.ts";
import { anyliewDialogueAssets } from "./backend-dialogue-assets.ts";
import { anyliewFixedAnimationAssets } from "./backend-fixed-animation-assets.ts";
import { anyliewFixedBatchAssets } from "./backend-anyliew-fixed-batch-assets.ts";
import { flushAssets } from "./backend-flush-assets.ts";
import { pythonOverlayAssets } from "./backend-python-overlay-assets.ts";
import { legacyTextOverlayAssets } from "./backend-legacy-text-overlay-assets.ts";
import { jumpSoldAssets } from "./backend-jump-sold-assets.ts";
import { anyliewRectangleOverlayAssets } from "./backend-rectangle-overlay-assets.ts";
import { anyliewShortAnimationAssets } from "./backend-short-animation-assets.ts";
import { anyliewTwoLayerAnimationAssets } from "./backend-two-layer-animation-assets.ts";
import { tudouShortAnimationAssets } from "./backend-tudou-short-animation-assets.ts";
import { tudouPortraitAnimationAssets, tudouWelcomeAsset } from "./backend-tudou-portrait-animation-assets.ts";

// Only assets used by registered templates are individually pinned.
const anyliewRevision = "33bf418ac2ccd416be70faf9a13e97befb7703a8";
const anyliewFrames = {
  catch: "9d7ff9380532fc759b41338e216c74d12e358cb22f35d9511def7c8d03bc9799",
  christmas_hat: "197c1d56fa805deea2d2167814799594f9fabbba478151bf3fcac14aa323a6c7",
  fireworks_head: "76fe5fa1b8a0f67c0766b733b382aa20079432d6da84ab7405a40f0fc7559128",
  ikun_head: "6d541e55bbc3702565c808be3febb306c7255e61f4ece6c11164466ba53bd977",
  mihoyo_amber_frame: "c91d82f2247b416183f213495f7d8ebea7ab3b3e007145e7e5f36e6005c140de",
  mihoyo_barbara_pegg_frame: "859aef4b24bb2c17a9ad0dc4a0abf93ea5061d09756f02d99e3602317a99cc43",
  mihoyo_barbatos_frame: "5b7d11f2350d589326e1ca343966082584a38b40b720cf76fbcd5cf0660c72c4",
  mihoyo_caribert_alberich_frame: "005ef33ed465da0342021767ddf558c3f91b6f9c50a1811a083156eff600eb5e",
  mihoyo_chasca_frame: "1fea62f9e4b9372ff79506879dae8f064ed03bd7bcb5abeb5e4fbec3f1fc0499",
  mihoyo_citlali_frame: "9f4168b6cfb0695e618eabf3b4951fcfcb4026292a938d97991af1d89c647230",
  mihoyo_editorial_society_frame: "aeeecd49a0e8ae85ddff58afd2ffcd1f81bb1df300bfb67a72656d92ff233b91",
  mihoyo_funina_round_head: "209c6e255e5b283498485866991460cb3eb2a2c5bb48357627d3c3ada772c740",
  mihoyo_gemini_frame: "ee60ed609bd16f256c9d5c6549a4d326aaf0e4abe14b3da0322ed2d6f2d0e52c",
  mihoyo_guoba_frame: "2d606011c44fdb582f0f3464b33da502315008767ba59e1d48d20479aa45bb5c",
  mihoyo_hilichurl_frame: "f7ddc802c6d47bbe86f03a038a94fc1bb8cde03ba71ad6f376e47893de2f5326",
  mihoyo_hutao_frame: "d7749a13f7a27ccd5c20071faf5020b270f2c8fe5f119785e35b6e4fff05ba73",
  mihoyo_kaveh_frame: "c2968124a120ddedfd5eca2a0125110a22724ffcae50c8d8f52614e652cdfe22",
  mihoyo_klee_duduke_frame: "4750d0ab29b329144684415ef1b384f8629ae8311e8caa97a3721f49ed98bdd1",
  mihoyo_klee_frame: "04174f3203e9bfba4a7f2bff0437ea90498d229f5a5396bcc683115bae1c2ddb",
  mihoyo_klee_hat_frame: "b5870f0b86f587ac60756495d9d0a220f56a26d7ea3d08452702edb3faddb06d",
  mihoyo_kujou_sara_frame: "52011b1f60ab4626b747728d273eadcd5fc98626d8b84db15a904864ddf0bb74",
  mihoyo_kuki_shinobu_frame: "1b9f8dc48341f7371dcf988fd4e0c32a1a631911bb5f9e8d584d8b5639f96669",
  mihoyo_lce_slime_frame: "341b06b36e092f44755646beb9ee739f24a7a78141e969cc9083691966d0d08a",
  mihoyo_mem_hat: "82621ec189370ff183d6148ca39d0e97e661a76799d1de78f608b60aa4fac5cf",
  mihoyo_outlander_frame: "5dc22ca65fb602f3e3fb962d24ff212b94ad28dbbe86d919045d5b2ae5d8fbd8",
  mihoyo_paimon_crown: "f5cab0022fdeae37fef6851fd2aa100480eb2b4015bb72af8267a94f7e825e9a",
  mihoyo_paimon_emergency_food_frame: "16511cd07deff4251e235c6d01ab509b869b7060d7b5704fc49a3fc0e65ed8ab",
  mihoyo_paimon_frame: "45b3047a66b1eba06c9f1c883ab6f25cdf85393616586b8ab982362d158b069e",
  mihoyo_shikanoin_heizou_frame: "686958b0566368bd6d2953e47337ebfda0a7d078fb245144ff3439d368bd82c8",
  mihoyo_tartaglia_frame: "8d3b560125f9dfd409e3d91de4afaf535f13334684ffded68dace6506d5b62fe",
  mihoyo_tepetlisauri_frame: "c26136e1c0f67ca4ea77cfadcd158b515e375b22ca7bcad5267239ea4cf8fad8",
  mihoyo_thunderbolt_slime_frame: "a2a8cdd55b01484702beafb27f3d7fc4495c976db6177ccf7fa70cb7e9123906",
  mihoyo_traveler_frame: "12329dfd8dc7678bee2cf1f1ee2350159fbc7ed1923daf3e7d0276bd3568bce9",
  mihoyo_wind_slime_frame: "dd706156df4190fc10b2ca0cef56082b69f6cfbf012c21b94390138329298c0b",
  nakano_lchika: "d0ce1f68dae50a196e7de8598476c4c28bbc90d9a30d1c694fada2e7a0d53913",
  nakano_miku: "41764055d4a8df7cd127c3d6766f0445c36579f11c110c070ae7d9a74119c53b",
  nakano_yotsuba: "68c469c316337f0f6a25baf06d1c6a911120cdd81d68b874f8b5483d4c98373d",
  ok: "39838184dce1a6c3c93be13e19d39543b41ab430abc870d62eb6f47478c92fe2",
  orange_head: "abc1c60dee4062493b8a42a9e59e33b7eb3455e9fd0a38c07ae549b4f37f8e2f",
  pierrot_plus_head: "079175534ea51b03590f6eecd3f20e14e268a5d13f113282cfa7ba29cf299d8e",
  shikanoko_noko: "e4be2f7b8f45f3a80f399d50c036d8ed2135a8f4404cc277b3bf04e9db0f2f9f",
  springframe: "ca25d4799238ff040f379a1e08206f6b0ac229f74c23ebf922749603edf8e2e9",
};
const anyliewBase = [
  `https://raw.githubusercontent.com/anyliew/meme_emoji/${anyliewRevision}/`,
  `https://cdn.jsdelivr.net/gh/anyliew/meme_emoji@${anyliewRevision}/`,
];

interface ExtraMemeAsset {
  readonly path: string;
  readonly digest: string;
  readonly sources: readonly string[];
}

const anyliewAssets = [
  ...anyliewLargeAvatarAssets,
  ...Object.entries(anyliewFrames).map(([key, digest]) => [`emoji/${key}/images/0.png`, digest] as const),
  ...anyliewDialogueAssets,
  ...anyliewCircleDialogueAssets,
  ...anyliewFixedAnimationAssets,
  ...anyliewFixedBatchAssets,
  ...anyliewFixedAnimationV2Assets,
  ...anyliewRectangleOverlayAssets,
  ...anyliewAvatarSceneAssets,
  ...anyliewStaticAvatarAssets,
  ...anyliewTailAssets,
  ...anyliewShortAnimationAssets,
  ...anyliewTwoLayerAnimationAssets,
  ...anyliewSignAssets,
  ...anyliewTextDialogueAssets,
];

export const extraMemeAssets: ReadonlyMap<string, ExtraMemeAsset> = new Map([
  ...anyliewAssets.map(([path, digest]) => [`images/anyliew/${path}`, { path, digest, sources: anyliewBase }] as const),
  ...pythonOverlayAssets,
  ...legacyTextOverlayAssets,
  ...flushAssets,
  ...jumpSoldAssets,
  ...tudouShortAnimationAssets,
  ...tudouPortraitAnimationAssets,
  tudouWelcomeAsset,
]);
