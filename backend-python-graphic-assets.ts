// Original graphics from a pinned MemeCrafters Python tree.
const revision = "619fa10518fc2eca4fa1053af37f0a00a839f062";
const sources = [`https://raw.githubusercontent.com/MemeCrafters/meme-generator/${revision}/`];
const frames = [
  ["meme_generator/memes/dont_touch/images/0.png", "31d17a151e7863bb1bb20d84d4e2f5ee8885148ef8069eaa1d5a03a387e2ecf8"],
  ["meme_generator/memes/dont_touch/images/mask.png", "dce01a27495b76bb5583d1be53e55a2c65f8a94af138eb7c842ce01b0db6f608"],
  ["meme_generator/memes/loading/images/icon.png", "6f8bdc1a5771a86278c8b0c6c695532472de254c1c0e509de436c227e471de43"],
  ["meme_generator/memes/lost_dog/images/0.png", "5669c59c949284e9fdb71a1c0ea9c1de5385937bd690257606fe3518c38cdfc8"],
  ["meme_generator/memes/pepe_raise/images/0.png", "9555f6964ab633089b00c26e7ea120e25fc241462a7a4c68cf7f5c4e69d3d2eb"],
  ["meme_generator/memes/pepe_raise/images/1.png", "9555f6964ab633089b00c26e7ea120e25fc241462a7a4c68cf7f5c4e69d3d2eb"],
  ["meme_generator/memes/pepe_raise/images/2.png", "1717a4e4cfe071fc411787b60fc00290ad9a736309f3b88b5d8ad9f566216466"],
  ["meme_generator/memes/pepe_raise/images/3.png", "de8893985be985257844a95bab7c872f8b38bd8eff5f880f333456235e6e3ac9"],
  ["meme_generator/memes/pepe_raise/images/4.png", "de8893985be985257844a95bab7c872f8b38bd8eff5f880f333456235e6e3ac9"],
  ["meme_generator/memes/pepe_raise/images/5.png", "6c67bba44470a670c23fcfe9da413015315cff6e5da7c148d025b117d266be81"],
  ["meme_generator/memes/play_baseball/images/0.png", "2cc6249e5c5666b0572e6b204ab10b756d365ed131016b952466db4489f3256e"],
  ["meme_generator/memes/play_baseball/images/1.png", "583dcdd0c27e50b26d1aa1ef8380f610ead06cf45fd3f614f12e4d85ce41e5de"],
  ["meme_generator/memes/play_baseball/images/2.png", "83c5a74b09bd9b356847164abf0809a1f9f43c6784a6ef0c41d048e23419d47e"],
  ["meme_generator/memes/play_baseball/images/3.png", "6b79175c7b9452aa994cc3f8ff44120d307e62552899cab2354e2a0249ae653d"],
  ["meme_generator/memes/play_baseball/images/4.png", "e7de8a4d909ca684474e19cd364f942136e51ff419a69c17d2aab86fd77265bb"],
  ["meme_generator/memes/play_baseball/images/5.png", "f7f0fca6be624041da19cb001055fb2e53706e394af53e369aad7ee13a4a7cbe"],
  ["meme_generator/memes/step_on/images/0.png", "e07965b21a4c318613409b66b783de8fe9e373f88e92d7e8bd69277b70765069"],
  ["meme_generator/memes/step_on/images/1.png", "ecf2e22dc76f6b3f8d84b6083289186c7ba7cbb5c47156680b1c2ab7de075463"],
  ["meme_generator/memes/step_on/images/2.png", "eea1044c7e05cddda7d6089eeadc27df9ce4083509337154e04b664e655c6f0b"],
  ["meme_generator/memes/step_on/images/3.png", "e74c6bb9263cc7913b2ea51724778a4829a39042f7fbddfcd00807afb4605da5"],
  ["meme_generator/memes/step_on/images/4.png", "834ffcb5550ffc38a22b78ad1cacdad18015b8787152ed11f92c84c8d1255aaa"],
] as const;
export const pythonGraphicAssets = frames.map(([path, digest]) => [`images/python/${path}`, { path, digest, sources }] as const);
