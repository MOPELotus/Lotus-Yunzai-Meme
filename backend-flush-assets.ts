const revision = "619fa10518fc2eca4fa1053af37f0a00a839f062";
const sources = [
  `https://raw.githubusercontent.com/MemeCrafters/meme-generator/${revision}/`,
  `https://cdn.jsdelivr.net/gh/MemeCrafters/meme-generator@${revision}/`,
];

const frames = [
  "46aabc4dc494db27c78aeaef26526342c24cf20337dec0b5aac4be7e0b0129ff",
  "0e9e8c2985c6d0ac22d7de8c3de6430c50fb198cf5ccea37fdd45627ec82c4f4",
  "7bd612d9ff35dd1ea63e50a40f5c6525bfe9ce1995f88ef080b46cc604e4a87a",
  "110bfd7edcac5bed1beaae9f7c1452eb6917d52e4da0492a8ea7c16fff035eac",
  "fc4590da920b9ef1d3e9d045d52c322cf3d6f8edc3c27182f6ade3fc0d27577d",
  "760f8f12f1f29607f10cd5ed0e7620ce4f6f12214196c28b73d0c76a7a3d848f",
  "760994102812d71ae43a1a05063aa643662b5e88adc325954ed154d107f48ad3",
  "d3e9e47e12eecb83ab1f95e2cdfccc2deed7e5cafef481d3c60f8ad00ab78225",
  "9a1a0a62b97a195699f6b06ecc8ce256cd56998417184edc43fca8a58cfe192d",
  "5f26b0d0b942f23823bbadc5ff0653c193ad39b80b60fe22d07cd8ffbef4e032",
  "ba9cfc5eb703ebdb7cdf5fc30465057611f1a2808eee85fa518ed9371ca16f58",
  "6220b9a7f8e68b7863c06ecb1a2adf5db6f87351b98a7a7d467ed800bef94d27",
];

export const flushAssets = frames.map((digest, frame) => {
  const path = `meme_generator/memes/flush/images/${frame}.png`;
  return [`images/python/${path}`, { path, digest, sources }] as const;
});
