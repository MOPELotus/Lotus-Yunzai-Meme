const sources = [
  "https://raw.githubusercontent.com/MemeCrafters/meme-generator/619fa10518fc2eca4fa1053af37f0a00a839f062/",
];

const art = [
  ["meme_generator/memes/flick/images/0.png", "e1cba974d685b74f5515da61cb0dfcfb43d4980dec2af8c1f084239fce1e1729"],
  ["meme_generator/memes/flick/images/1.png", "b598261a7252b837ce2ecf847416133707f7b013666921a99c193fe0b8f5db5c"],
  ["meme_generator/memes/flick/images/2.png", "8585b6ea44ffe4b116ccdca0665869319457deaa5f52f64f0aa2e87dc7cbbc7c"],
  ["meme_generator/memes/flick/images/3.png", "175de4617eca94ec837151ce27bb731186e40bd1e43afa62185e2afc0eda9ade"],
  ["meme_generator/memes/flick/images/4.png", "daa6e4894a1bbee29b111599a9c5e01a95912e8ce5075d0d42071d6d9382d9a9"],
  ["meme_generator/memes/flick/images/5.png", "82d110bd30a425b1bd1510e3ebc9db5f97c06e34fd49a4935256673b80a50fa9"],
  ["meme_generator/memes/flick/images/6.png", "c6a35876551eb5f0f54182ba0c08a28d42c43d559f7a8befdf1b237652bdd6fd"],
  ["meme_generator/memes/flick/images/7.png", "34f6429db61a19677991de373ebc78e30d67b9dfa7f830d1fa0da3512b95df66"],
  ["meme_generator/memes/flick/images/8.png", "0ed8988a099af211e664348a0a744b90c89bcb8a09fab8e3a079358ecbb2ffe4"],
  ["meme_generator/memes/flick/images/9.png", "23586e3f1c08b428f82bdbd6c1bfead45150b547fb67cdbaa01e53c95738bac9"],
] as const;

export const pixelEffectAssets = art.map(([path, digest]) =>
  [`images/python/${path}`, { path, digest, sources }] as const,
);
