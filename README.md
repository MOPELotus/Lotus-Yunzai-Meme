# Lotus-Yunzai 表情合成

Lotus-Yunzai 的内置 `meme` 模块。支持`#表情列表`、`#表情详情`、`#表情搜索 <关键词>`、`#表情帮助`、`#表情版本`和关键词合成。机器人主人可使用 `#表情合成设置`（简写 `#表情设置`）和 `#表情合成更新资源`。

迁移保留旧预设、统计和本机设置。默认使用主仓的 `data/meme/data.db` 和 `data/meme/config/`，可用 `LOTUS_MEME_DB`、`LOTUS_MEME_CONFIG_DIR` 指定路径。

模板、原图和字体随模块提供，由机器人在本机用 Skia 合成。表情目录由内置模板生成，可用 `#表情更新资源` 重新载入。

## 来源与许可

本仓基于 ClarityJS 的 [清语表情](https://github.com/ClarityJS/meme-plugin) 及 [chinoyui 的续维护版本](https://github.com/chinoyui/meme-plugin/tree/39d3bd52daa4ad53d3b1586282cc1825bb66b996)，保留 Git 历史、原署名和 [GPL-3.0](LICENSE) 许可。

内置模板参考 [MemeCrafters 原版](https://github.com/MemeCrafters/meme-generator) 与 [Rust 版 v0.2.3](https://github.com/MemeCrafters/meme-generator-rs/tree/v0.2.3)，头像框沿用 [anyliew 的素材和原构图](https://github.com/anyliew/meme_emoji/tree/33bf418ac2ccd416be70faf9a13e97befb7703a8)，保留 [MIT 许可和作者署名](LICENSE-MemeCrafters)。

Lotus-Yunzai 从 `lotus.ts` 加载模块。表情包数据可按原配置定时更新，模块代码由宿主的 `#更新 meme` 管理。
