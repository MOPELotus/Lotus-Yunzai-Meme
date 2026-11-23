// Only assets used by registered templates are individually pinned.
const anyliewRevision = "33bf418ac2ccd416be70faf9a13e97befb7703a8";
const anyliewFrames = {
  chasca: "1fea62f9e4b9372ff79506879dae8f064ed03bd7bcb5abeb5e4fbec3f1fc0499",
  kaveh: "c2968124a120ddedfd5eca2a0125110a22724ffcae50c8d8f52614e652cdfe22",
  kujou_sara: "52011b1f60ab4626b747728d273eadcd5fc98626d8b84db15a904864ddf0bb74",
  paimon: "45b3047a66b1eba06c9f1c883ab6f25cdf85393616586b8ab982362d158b069e",
  shikanoin_heizou: "686958b0566368bd6d2953e47337ebfda0a7d078fb245144ff3439d368bd82c8",
  thunderbolt_slime: "a2a8cdd55b01484702beafb27f3d7fc4495c976db6177ccf7fa70cb7e9123906",
  wind_slime: "dd706156df4190fc10b2ca0cef56082b69f6cfbf012c21b94390138329298c0b",
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

export const extraMemeAssets: ReadonlyMap<string, ExtraMemeAsset> = new Map(Object.entries(anyliewFrames).map(([name, digest]) => {
  const path = `emoji/mihoyo_${name}_frame/images/0.png`;
  return [`images/anyliew/${path}`, { path, digest, sources: anyliewBase }] as const;
}));
