// Only image files used by the registered layouts, from the fixed Python revision.
const revision = "619fa10518fc2eca4fa1053af37f0a00a839f062";
const sources = [
  `https://raw.githubusercontent.com/MemeCrafters/meme-generator/${revision}/`,
  `https://cdn.jsdelivr.net/gh/MemeCrafters/meme-generator@${revision}/`,
];

const captions = [
  ["meme_generator/memes/teach/images/0.png", "65b6a5fd34a357e14875deda53e6952a87ea7e970536f4a87c1e10e69e236565"],
  ["meme_generator/memes/thermometer_gun/images/0.png", "3f35043aa60692dd095aa93a79507dfacfa25e2c702dae786387b35ac92c71eb"],
  ["meme_generator/memes/time_to_go/images/0.png", "2f1a231e53b24b370501b9f9a11e79ccff7fc6174cc1e592b2b52c25b0058a00"],
  ["meme_generator/memes/safe_sense/images/0.png", "83f14a15818632417e14170e07ba15a4e15f39b3133b11bf96297ebbeb85e09c"],
  ["meme_generator/memes/caused_by_this/images/0.png", "ccf0f91cfe33ddcb75a5b70d3408b4da022deac9cd149199f2f47e5b6c8d8dcd"],
  ["meme_generator/memes/look_this_icon/images/nmsl.png", "496a3ab46d40757d40b38c50194c479be7755511c9194465a4669f15fbd2dee9"],
  ["meme_generator/memes/emperor_dragon/images/0.png", "a59113b07e8a459000ca98a1620cd71a7c0d580c6b1f9799b52762fb943379ca"],
  ["meme_generator/memes/imprison/images/0.jpg", "3dd3e6b71cab68f8a6c75893030ba5ae1062fedd632faaaf6ecd767c8fa196cb"],
  ["meme_generator/memes/murmur/images/0.jpg", "06fb5a38ef63b70d605ef768e43bd32d7d78dedbcca6026dafb4e07cced2552b"],
  ["meme_generator/memes/osu/images/osu.png", "f1e7e9a0683b4520814ee62732db30f2164811c06821e0f373917141c73627af"],
  ["meme_generator/memes/shutup/images/0.jpg", "8174ebd8ec250ec64f4a6a36356aa39741d93fe72dec1451608a489cdfa9143b"],
  ["meme_generator/memes/slap/images/0.jpg", "aa45500529d859d8b8dadf0a76a929b28c6a5391e3664173b864f67e49304e5c"],
  ["meme_generator/memes/high_EQ/images/0.jpg", "064066fa7a2a18423bfb91af1ae2ca5f43a77d86873173b87cf2eadbd8f6d15d"],
  ["meme_generator/memes/intel_inside/images/0.jpg", "f40440bbfc8dfba336ad315a7f99ed7375113105fdf9588818cf7a59ddf8ddd7"],
  ["meme_generator/memes/scratchcard/images/0.png", "983d4e609d5d0755b9b5593d848adaa79860194ab3cc6cf38745d92e7738cb43"],
  ["meme_generator/memes/scratchcard/images/1.png", "58868a7eb9be598ae4730848e764990db4adf4375bfcdcc0cf4a3b1e5acda6f7"],
  ["meme_generator/memes/wakeup/images/0.jpg", "10c8d9052e3599c423a430c0b587819865f1c3cc66b75c75fa9f3c4286bf2dcf"],
  ["meme_generator/memes/wujing/images/0.jpg", "2b58fb75d5687c5c6c5ca20b9b4b618756c1b607ee476b96ff38acf0bed1a82e"],
  ["meme_generator/memes/bluearchive/images/cross.png", "cf1937d922cdf72c49e65760bfef420335d59d953cf084ad195dd0f84066ab0f"],
  ["meme_generator/memes/bluearchive/images/halo.png", "90f2e2ea6b0dbe30b7e51577e03e78542865f23d21d2bafcd8a96e8806bdee89"],
  ["meme_generator/memes/nokia/images/0.jpg", "5dda5c9916f762ea6420ff71f8e3ca4f30e012a1df6d62860537793626024330"],
  ["meme_generator/memes/p5letter/images/background.png", "28328b764181bfb3ae5e61795a35552d5f967cfb9f554358a76856f34b16624a"],
  ["meme_generator/memes/atri_pillow/images/border.png", "5eb460faa1c45562f25ebca46f8cbb8131d084a8e636257f861da870ac05d65c"],
  ["meme_generator/memes/atri_pillow/images/no.png", "0bf6b0546133fa5a10caf67d49ffb7c67dd243106c6eb9b620945309052b91f0"],
  ["meme_generator/memes/atri_pillow/images/yes.png", "ac084d8002d9ab5702307ba93601940c860b3180b6de3b96966c1773ded7ebc3"],
  ["meme_generator/memes/certificate/images/0.png", "ce64522d264c0d415afe32a633143054d5c0711a5b30cf1c75a2947c50b2a481"],
  ["meme_generator/memes/kokona_seal/images/1.png", "678d5b2ee0a3a52663d251fb726788698edf2364985e9e6324e701b664778a71"],
  ["meme_generator/memes/kokona_seal/images/10.png", "3a339998630b64efba30d77abfa49398b18899e06777f04bbaada5242ef84516"],
  ["meme_generator/memes/kokona_seal/images/11.png", "6fe601195d7e7b5a36e1c5335a828e0450967c5a6f94688190b842952e834258"],
  ["meme_generator/memes/kokona_seal/images/12.png", "b8c2833cc5755b8c277495f5207cd2fa0828a3dac04b3fb0077c4b8666e8f5be"],
  ["meme_generator/memes/kokona_seal/images/2.png", "f5b9d6927237b96e868f1260917776c4358bd7056c2b2385c2e804e17828f150"],
  ["meme_generator/memes/kokona_seal/images/3.png", "aa52b0d1e7132b0e414b11078be0992ce8b63650293d682587890f5369ed4655"],
  ["meme_generator/memes/kokona_seal/images/4.png", "2f26dd88bb83abbb99d24b64f4936e9f1cc1ac43c04d6f792f28e2ea2095407c"],
  ["meme_generator/memes/kokona_seal/images/5.png", "78bdd991cbe6be53ae493cf313a411badecf57bc7c6142c2cc7ef66f12c27499"],
  ["meme_generator/memes/kokona_seal/images/6.png", "6cddfc19fae0feca907cec7414fe7e6ca7a2a04fa595d3b447a8116d1d9f22f2"],
  ["meme_generator/memes/kokona_seal/images/7.png", "f049ffdcb132869681fc3ac960ee6dceb33fcd9dd16d0f40b21de9faf8dd07af"],
  ["meme_generator/memes/kokona_seal/images/8.png", "3482005657c551eb58ad66f9922f8c0c6189ebe99b149338a5c6e035f58b6ea7"],
  ["meme_generator/memes/kokona_seal/images/9.png", "4d5d7f2879548eff16739df5726c3c11fc6f6713424e67691969ef2009b81d85"],
  ["meme_generator/memes/panda_dragon_figure/images/0.png", "5740ef0a6f3238ea33c391b2f78f628c82506ebbf3c3979651caee741226f3b2"],
] as const;

export const legacyTextOverlayAssets = captions.map(([path, digest]) =>
  [`images/python/${path}`, { path, digest, sources }] as const,
);
