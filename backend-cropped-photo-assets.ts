// SHA-256 for the exact image blobs used by the Python v0.1.14 crop templates.
const revision = "619fa10518fc2eca4fa1053af37f0a00a839f062";
const sources = [
  `https://raw.githubusercontent.com/MemeCrafters/meme-generator/${revision}/`,
  `https://cdn.jsdelivr.net/gh/MemeCrafters/meme-generator@${revision}/`,
];
const images = {
  "captain/images/0.png": "038f1c45931637f19be9f30b0b508142b3f3ba8051bdb8ba6574fb3fcc8d3248",
  "captain/images/1.png": "5328caaa92c550b832a57e151ded881c0a10e310204253549909c748a70ba333",
  "captain/images/2.png": "352e1f3cb50729c38efaef155c940eebefc956877ba90f5ff849668b8816e920",
  "china_flag/images/0.png": "18b312820efe7617f9546d2fbf48e9b94d332044db5a0847878d7db2fc2e7ce6",
  "erised_mirror/images/0.png": "7318263ae78bb1b9f19963a7a7e853bdc6e9a61e70d50da77dc5ba7f1968c9ba",
  "jerry_stare/images/0.png": "4bebaab0299f5a1c76b12d2360248d52f2a74b94d10f392b3d61abae0c55904f",
  "karyl_point/images/0.png": "1daf8e339ed5ad5d535e23f996f5a1bda49d6468273fddfc12697ad795060fd5",
  "maimai_awaken/images/0.png": "4120b665e8afb330248a62a3ee8263018cdb8254ea69c89982003ff8563b20a8",
  "marriage/images/0.png": "e674be2952d86626843a7cbdf8952d96d065e889aeb70c7b355e901f94ba22a4",
  "marriage/images/1.png": "e49ab7ff2fb99837e82d9c1956ae3b25db71983c067ba8f311bf09a444b97a70",
  "perfect/images/0.png": "b61a5fbe5ff389eb158dd959e728cc8093d101416540598f41e858082ba18d26",
  "raise_image/images/raise_image.png": "55b39e09a962b78fba41bd402827ec3cd94b6faf195602cf04c24c0794a526df",
  "saimin_app/images/0.png": "f940569a63978b1e21124d380a952e1b8847680d95999036d12f192c704fdad6",
  "saimin_app/images/1.png": "702b23bcfbe313bc2d2c6eb45a4cc6393c9781fac0dfb4d6b73aea7e3c7a1c6e",
  "saimin_app/images/10.png": "b8404027db044a3c57bd7cbd23760d9b8d78c1eb3d6d0be8e0b88eb6ac36f2a6",
  "saimin_app/images/11.png": "40e01f2efa87334e6f5e19678d50827ac843e83f4519e0dc3c17ad4628055f70",
  "saimin_app/images/12.png": "75d5f0f0a24177b3709b1958479a6f8200c0152a10b2503c529a0ce40c398161",
  "saimin_app/images/13.png": "2874eaae5ce5a1593080f144518d67e3bbde24ad29854317036f9776ff4241d8",
  "saimin_app/images/14.png": "ae6c1a7c18bdac7a4facbc4985b720943975c0223ae9d45e304c52ec1875cb2e",
  "saimin_app/images/15.png": "1dc86f70781059bbb9868fb6424d6d8d39a4ae947a7185b499ca84fed87963f4",
  "saimin_app/images/16.png": "6fc21b3706753fd341c62e9f3cae99298ecbc25c256b675f1a3caed85bcc9c76",
  "saimin_app/images/17.png": "26781325fe1bd21b0aee797e53417c1763a3839f40d7a28640d2d447cb042335",
  "saimin_app/images/18.png": "51207d954f7acdeb71ecbe3aa0d171b44ecbeb9c37756f50b84fdfa5156606ba",
  "saimin_app/images/19.png": "9899bf58929375f7267c8b06bb3c4eb4704d0401ae7f5c35d348e2a4ab738eb4",
  "saimin_app/images/2.png": "e041a7d7fd7d36a83676e61049bf9bd317853411aef8d7f831b39413364d2ebf",
  "saimin_app/images/20.png": "675c1ec3077b618e1131a6124c43dba7ced8c55a2c099e08f25b08abf330c7a0",
  "saimin_app/images/21.png": "8e7299141eeef82e1695585c30554eba70851071ac98fd390cba4f3f002b3e72",
  "saimin_app/images/22.png": "dd84d34ba6d851c97e9d97e6c4e65d71a1576a2642640c8ac2b3875670dd6656",
  "saimin_app/images/23.png": "e284835124d1d12c9b30e8157d0b48bf524bcdfb88478c45cf911dd0f2e20066",
  "saimin_app/images/24.png": "0221c1615eb8be7aa8a2e34b6e81419a0efa215f400918b0ad3f020464e668cf",
  "saimin_app/images/3.png": "3036f8960ea5d35c29119684eff843936eb908f37150ddd0dbd3d50e7362b81f",
  "saimin_app/images/4.png": "badec2f8eefeb6002b804b08c784cb0b0c9756f326996cfd9ffbd57b75b673cd",
  "saimin_app/images/5.png": "3f9788ca4584fecfed515d90bff675ac23054083f6a6010ec6a265811d479178",
  "saimin_app/images/6.png": "4c5ef3525674a8a0e3c98efe8e041173a7dfab70f52d593db1f65a0799cafe8d",
  "saimin_app/images/7.png": "a857a1415c9a22137dfbb01e71ebe199b9b10e0065463ca68b43eb44e140bd1f",
  "saimin_app/images/8.png": "63f6598b5549b513e8a01e68ba637d325208f10ab1c5a518651b05c9aa7e52af",
  "saimin_app/images/9.png": "4af8d6aa992db176c9ec968d25b047b3e025539789d898b0b20f31950edb7e7a",
  "what_I_want_to_do/images/0.png": "ea1edcbffe60212b36f17aac9da557b3a40de7779c434efdc1971bb83a799d0b",
};

export const croppedPhotoAssets = Object.entries(images).map(([relative, digest]) => {
  const path = `meme_generator/memes/${relative}`;
  return [`images/python/${path}`, { path, digest, sources }] as const;
});
