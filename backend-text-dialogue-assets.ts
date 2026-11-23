// Only used artwork, from the fixed AnyLiew source in backend-extra-assets.ts.
export const anyliewTextDialogueAssets = [
  ["emoji/mihoyo_funina_card/images/0.png", "1b158c386f08173fb94f2718e5b1e4b450c96ab6ddd8d40180845a033bf8e806"],
  ["emoji/mihoyo_liuwei_say/images/0.jpg", "5ffd97c8de0de56aa7b641078422324b30ef93a78c83dd593549600202412d66"],
  ["emoji/mihoyo_neuvillette_say/images/0.png", "e818658eb39733a8df5766730390770c2813a47c3dc4ba315fed6d0d46702bba"],
  ["emoji/mihoyo_paimon_say/images/0.png", "3102b9a91801c3b9e7961caf8b68d0f01b8e8bffb59d10e2d30227e2117857e3"],
  ["emoji/miku_say/images/0.png", "e008b72662899ad1939ab3a5deef66c1c8369467d2ceb238bc59e13b6024c983"],
  ["emoji/moria_ruruka_say/images/0.png", "d3397591ab7b2408c6f57c732090a9d8bbc1a0bfdf5983ab5e75ec9c8ffa4d3d"],
  ["emoji/mygo_chihaya_anon_say/images/0.png", "3bb0d5b999ea215291b1a433b9a858a0ea5fb795e320f598e03e5ebe5d177bb0"],
  ["emoji/mygo_togawa_sakiko_say/images/1.png", "0c7091e700f9b8b298c8de7ee640d18ec55ab8368fb497d78fc15440f02765e6"],
  ["emoji/mygo_togawa_sakiko_say/images/2.png", "e32a31f7acc7d2c7a1d95014e0169903683d7e3a62eb1120955c955bf0d08253"],
  ["emoji/mygo_togawa_sakiko_say/images/3.png", "e84ea4baed38d77292dbc828b06cef627b6ba38493f35e48e8e45016c592be6a"],
  ["emoji/mygo_wakaba_mutsumi_say/images/1.png", "53aa9d68292f983b9a1de56fa0b64d31282b162a8638ea96b98b4309d1a5c3ab"],
  ["emoji/mygo_wakaba_mutsumi_say/images/2.png", "11b4ee8301d281cae876c0c8c39589003bb5c0987979b59fd76fdda2bd6e8191"],
  ["emoji/mygo_wakaba_mutsumi_say/images/3.png", "788403aab2b60582a5773907363b67b45dcc9a51ccea50726b866928de84567b"],
  ["emoji/mygo_wakaba_mutsumi_say/images/4.png", "a7c4479d43da217643aabfad166983bb9e3198170a54795e9b55e13fa80d80fd"],
  ["emoji/admission_letter/images/0.png", "5d9ed65f9ffd9759c0987ec1efa8de9baefc45c3a6d5d4836af53d17a8867d3c"],
  ["emoji/aima_say/images/0.jpg", "b980f05fd85cd202386ce82ac4861cb9e9ad9e7a5b169128b47f58d038ac8cdb"],
  ["emoji/aima_say/images/1.jpg", "4d65b9fe4fd585d09f444bb268b8357ac32c951d779659e5375727322372f4ea"],
  ["emoji/atri_say/images/0.png", "7ea9e857d77df76ef46ebd5d2dc862f034b84b8ffff5a862b95390a80dfcd7be"],
  ["emoji/deepseek_say/images/1.png", "5c87b1441c53adc3b4a429ede9536ab401df033c834035b73058cc309f66af27"],
  ["emoji/deepseek_say/images/2.png", "f709cc2237d784a09761c6ec4f33e4e756ca4ed58c6e63d9d82b370555a274a3"],
  ["emoji/deepseek_say/images/3.png", "661b727252a56826a45ed79371b2cde063d1e49a0949162f5330e688238d71dc"],
  ["emoji/deepseek_say/images/4.png", "72db972a233bcdc75c053bbbd20c9ab60a33be94e4a1ce1ff940c929eb88d4b8"],
  ["emoji/handwriting/images/0.jpg", "bd4b2bdc96014c18b2a82c4c492c14cf962f730849c592b1af69694ecb97f77a"],
  ["emoji/naruto_uchiha_itachi_say/images/0.png", "0dbec9ed4123b4987feb169a41e8ba9af9fd5e88701e423256e71757daf2f2df"],
  ["emoji/naruto_yakushi_kabuto_say/images/0.png", "d418dc4c3ca91003bb58c206eedce032c2be71ea26b2eb85f7a8e99af2195209"],
] as const;

const originalLetterRevision = "1d69c0376e5538c60c40974f509e4c2f895752ca";
export const originalAdmissionLetterAsset = [
  "images/anyliew/emoji/admission_letter/images/legacy-0.png",
  {
    path: "emoji/admission_letter/images/0.png",
    digest: "092768a26961456c09af3bc449c9eb481ac34f40dd940f7b409471303e8ecf50",
    sources: [
      `https://raw.githubusercontent.com/anyliew/meme_emoji/${originalLetterRevision}/`,
      `https://cdn.jsdelivr.net/gh/anyliew/meme_emoji@${originalLetterRevision}/`,
    ],
  },
] as const;
