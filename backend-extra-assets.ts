// Only assets used by registered templates are individually pinned.
const anyliewRevision = "33bf418ac2ccd416be70faf9a13e97befb7703a8";
const anyliewFrames = {
  mihoyo_amber_frame: "c91d82f2247b416183f213495f7d8ebea7ab3b3e007145e7e5f36e6005c140de",
  mihoyo_barbara_pegg_frame: "859aef4b24bb2c17a9ad0dc4a0abf93ea5061d09756f02d99e3602317a99cc43",
  mihoyo_barbatos_frame: "5b7d11f2350d589326e1ca343966082584a38b40b720cf76fbcd5cf0660c72c4",
  mihoyo_caribert_alberich_frame: "005ef33ed465da0342021767ddf558c3f91b6f9c50a1811a083156eff600eb5e",
  mihoyo_chasca_frame: "1fea62f9e4b9372ff79506879dae8f064ed03bd7bcb5abeb5e4fbec3f1fc0499",
  mihoyo_citlali_frame: "9f4168b6cfb0695e618eabf3b4951fcfcb4026292a938d97991af1d89c647230",
  mihoyo_editorial_society_frame: "aeeecd49a0e8ae85ddff58afd2ffcd1f81bb1df300bfb67a72656d92ff233b91",
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
  mihoyo_outlander_frame: "5dc22ca65fb602f3e3fb962d24ff212b94ad28dbbe86d919045d5b2ae5d8fbd8",
  mihoyo_paimon_emergency_food_frame: "16511cd07deff4251e235c6d01ab509b869b7060d7b5704fc49a3fc0e65ed8ab",
  mihoyo_paimon_frame: "45b3047a66b1eba06c9f1c883ab6f25cdf85393616586b8ab982362d158b069e",
  mihoyo_shikanoin_heizou_frame: "686958b0566368bd6d2953e47337ebfda0a7d078fb245144ff3439d368bd82c8",
  mihoyo_tartaglia_frame: "8d3b560125f9dfd409e3d91de4afaf535f13334684ffded68dace6506d5b62fe",
  mihoyo_tepetlisauri_frame: "c26136e1c0f67ca4ea77cfadcd158b515e375b22ca7bcad5267239ea4cf8fad8",
  mihoyo_thunderbolt_slime_frame: "a2a8cdd55b01484702beafb27f3d7fc4495c976db6177ccf7fa70cb7e9123906",
  mihoyo_traveler_frame: "12329dfd8dc7678bee2cf1f1ee2350159fbc7ed1923daf3e7d0276bd3568bce9",
  mihoyo_wind_slime_frame: "dd706156df4190fc10b2ca0cef56082b69f6cfbf012c21b94390138329298c0b",
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

export const extraMemeAssets: ReadonlyMap<string, ExtraMemeAsset> = new Map(Object.entries(anyliewFrames).map(([key, digest]) => {
  const path = `emoji/${key}/images/0.png`;
  return [`images/anyliew/${path}`, { path, digest, sources: anyliewBase }] as const;
}));
