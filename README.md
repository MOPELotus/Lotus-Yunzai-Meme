# Lotus-Yunzai 表情合成

Lotus-Yunzai 的内置 `meme` 模块。支持`#表情列表`、`#表情详情`、`#表情搜索 <关键词>`、`#表情帮助`、`#表情版本`和关键词合成。机器人主人可使用 `#表情合成设置`（简写 `#表情设置`）和 `#表情合成更新资源`。

迁移时将旧 SQLite 数据库和对应 YAML 配置的副本放入主仓的 `data/meme/data.db` 和 `data/meme/config/`。可用 `LOTUS_MEME_DB`、`LOTUS_MEME_CONFIG_DIR` 指定路径，通过 `server.yaml` 的 `backend` 选择本机或远端合成。默认 `auto` 沿用已填的地址，留空时使用内置 Skia 模板。环境变量 `LOTUS_MEME_SERVER_URL` 优先。

宿主接管后，缺失或空的表情目录会从当前来源初始化。切换来源后可使用 `#表情更新资源` 同步。本机模式只显示已移植的模板，所需原图和字体在使用时校验并缓存。默认每天 02:00 按宿主时区增量同步，沿用 `other.yaml` 的 `autoUpdateRes` 和 `autoUpdateResCron`；设 `autoUpdateRes: false` 可关闭定时同步。同步失败时保留已有目录。

## 来源与许可

本仓基于 ClarityJS 的 [清语表情](https://github.com/ClarityJS/meme-plugin) 及 [chinoyui 的续维护版本](https://github.com/chinoyui/meme-plugin/tree/39d3bd52daa4ad53d3b1586282cc1825bb66b996)，保留 Git 历史、原署名和 [GPL-3.0](LICENSE) 许可。

内置模板参考 [MemeCrafters 原版](https://github.com/MemeCrafters/meme-generator) 与 [Rust 版 v0.2.3](https://github.com/MemeCrafters/meme-generator-rs/tree/v0.2.3)，保留 [MIT 许可和作者署名](LICENSE-MemeCrafters)。

Lotus-Yunzai 从 `lotus.ts` 加载模块。表情包数据可按原配置定时更新，模块代码由宿主的 `#更新 meme` 管理。
