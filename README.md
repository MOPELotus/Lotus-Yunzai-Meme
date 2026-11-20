# Lotus-Yunzai 表情合成

Lotus-Yunzai 的内置 `meme` 模块。支持 `#表情列表`、`#表情详情`、`#表情搜索 <关键词>` 和关键词合成。机器人主人可使用 `#表情合成设置`（简写 `#表情设置`）和 `#表情合成更新资源`。

迁移时将旧 SQLite 数据库和对应 YAML 配置的副本放入主仓的 `data/meme/data.db` 和 `data/meme/config/`。可用 `LOTUS_MEME_DB`、`LOTUS_MEME_CONFIG_DIR` 指定路径，通过 `server.yaml` 或 `LOTUS_MEME_SERVER_URL` 配置合成服务。

宿主接管后，缺失或空的表情目录会从已配置的合成服务初始化。已有目录可直接使用，缺少的预设从本地补齐。默认每天 02:00 按宿主时区增量同步，沿用 `other.yaml` 的 `autoUpdateRes` 和 `autoUpdateResCron`；设 `autoUpdateRes: false` 可关闭定时同步。同步失败时保留已有目录。

## 上游与旧版入口

本仓基于 ClarityJS 的 [清语表情](https://github.com/ClarityJS/meme-plugin) 及 [chinoyui 的续维护版本](https://github.com/chinoyui/meme-plugin/tree/39d3bd52daa4ad53d3b1586282cc1825bb66b996)，保留 Git 历史、原署名和 [GPL-3.0](LICENSE) 许可。

Lotus-Yunzai 从 `lotus.ts` 加载本模块。旧版云崽入口 `index.js` 及其 `apps/`、`components/`、`resources/` 仍随仓保留，其中的界面及定时任务由旧版宿主加载。需要在独立的旧版云崽部署使用时，先将 `package.legacy.json` 复制为 `package.json`，再安装其中的旧版依赖。
