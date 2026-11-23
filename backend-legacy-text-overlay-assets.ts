// Only image files used by the registered layouts, from the fixed Python revision.
const revision = "619fa10518fc2eca4fa1053af37f0a00a839f062";
const sources = [
  `https://raw.githubusercontent.com/MemeCrafters/meme-generator/${revision}/`,
  `https://cdn.jsdelivr.net/gh/MemeCrafters/meme-generator@${revision}/`,
];

const captions = [
  ["meme_generator/memes/emperor_dragon/images/0.png", "a59113b07e8a459000ca98a1620cd71a7c0d580c6b1f9799b52762fb943379ca"],
  ["meme_generator/memes/imprison/images/0.jpg", "3dd3e6b71cab68f8a6c75893030ba5ae1062fedd632faaaf6ecd767c8fa196cb"],
  ["meme_generator/memes/murmur/images/0.jpg", "06fb5a38ef63b70d605ef768e43bd32d7d78dedbcca6026dafb4e07cced2552b"],
  ["meme_generator/memes/osu/images/osu.png", "f1e7e9a0683b4520814ee62732db30f2164811c06821e0f373917141c73627af"],
  ["meme_generator/memes/shutup/images/0.jpg", "8174ebd8ec250ec64f4a6a36356aa39741d93fe72dec1451608a489cdfa9143b"],
  ["meme_generator/memes/slap/images/0.jpg", "aa45500529d859d8b8dadf0a76a929b28c6a5391e3664173b864f67e49304e5c"],
] as const;

export const legacyTextOverlayAssets = captions.map(([path, digest]) =>
  [`images/python/${path}`, { path, digest, sources }] as const,
);
