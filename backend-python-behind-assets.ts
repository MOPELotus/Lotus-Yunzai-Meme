// Original artwork from fixed MemeCrafters Python and contrib revisions.
const frames = [
  ["memes/forbid/images/0.png", "ee7ab807242466495666c51e79c3b3b20e71873c45e56da8c017b0fad64d1cc6", "https://raw.githubusercontent.com/MemeCrafters/meme-generator-contrib/8547f2e5718bfbb3328d700fe2c21d2ec5962500/"],
  ["memes/grab/images/0.png", "eecb51958f3d16bc4ddd0a5e1b178b3461464304455d65153d8ce7e29a4b984e", "https://raw.githubusercontent.com/MemeCrafters/meme-generator-contrib/8547f2e5718bfbb3328d700fe2c21d2ec5962500/"],
  ["meme_generator/memes/rip/images/0.png", "96cf95492db0623d6e7600e622bc7379cab04a864e19c62bafe1b8691b760b87", "https://raw.githubusercontent.com/MemeCrafters/meme-generator/619fa10518fc2eca4fa1053af37f0a00a839f062/"],
  ["meme_generator/memes/rip/images/1.png", "02d64e18ba35b70793cb8fb7d4f144837f28cc901c5cd8551269c59f8be39e8c", "https://raw.githubusercontent.com/MemeCrafters/meme-generator/619fa10518fc2eca4fa1053af37f0a00a839f062/"],
] as const;
export const pythonBehindAssets = frames.map(([path, digest, source]) =>
  [`images/python/${path}`, { path, digest, sources: [source] }] as const);
