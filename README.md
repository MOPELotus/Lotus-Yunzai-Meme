# <h1 align="center">清语表情</h1>

<div align="center">
<img src="https://api.wuliya.cn/api/count?name=meme-plugin&type=img&theme=gelbooru" alt="清语表情">

<a href="https://github.com/ClarityJS/meme-plugin"><img src="https://img.shields.io/badge/Github-清语表情-black?style=flat-square&logo=github" alt="Github"></a><a href="https://gitee.com/Le-niao/Yunzai-Bot"><img src="https://img.shields.io/badge/云崽-v3.0.0-black?style=flat-square&logo=dependabot" alt="Yunzai"></a><a href="https://qm.qq.com/q/gBs8Ri3nIQ"><img src="https://img.shields.io/badge/group-272040396-blue" alt="Group"></a>

<img alt="Star" src="https://badgen.net/github/stars/ClarityJS/meme-plugin"><img alt="Fork" src="https://badgen.net/github/forks/ClarityJS/meme-plugin"><img alt="Tag Version" src="https://badgen.net/github/tag/ClarityJS/meme-plugin"><img alt="Release" src="https://badgen.net/github/release/ClarityJS/meme-plugin/stable"><img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/ClarityJS/meme-plugin">


</div>

## Lotus-Yunzai

作为 Lotus-Yunzai 的内置模块提供 `#表情列表 [页码]` 和 `#表情详情 <编号>`。将旧清语表情数据库的副本放在主仓 `data/meme/data.db`，也可用环境变量 `LOTUS_MEME_DB` 指定路径。目录查询以只读方式打开数据库。

本仓由 ClarityJS 的清语表情衍生，保留 GPL-3.0 许可及原有历史。Lotus-Yunzai 入口只使用 Bun 自带的 SQLite。

`package.legacy.json` 保留上游发布版的依赖和模块别名，供旧云崽的 `index.js` 使用。Sequelize 和 sqlite3 用于旧数据库操作，Axios 和 Markdown 相关包供旧插件功能使用，ESLint 用于旧代码检查。在独立的旧云崽部署副本中使用本仓时，先运行 `cp package.legacy.json package.json`，再按下方上游说明安装依赖。

## 介绍 📝
`清语表情` 是一个 `Yunzai-Bot`的扩展插件，提供表情包合成等功能。
雾公主已跑路不再进行任何维护
皮皮自用版本
安装即用内置api
安装完成后先#清语更新表情资源、第一次更新会因为表情过多报错，多更新几次直到无报错即可

如有问题请卸载

>[!TIP]
>皮皮自用api：https://meme.pippi.top/

> [!WARNING]
> 主体内容已完成，不再更新新内容，已跑路

## 安装与更新 🔧

### <code>Yunzai-Bot</code> 🚀

```bash
git clone --depth=1 https://github.com/chinoyui/meme-plugin ./plugins/meme-plugin/
```
</details>
<details>
<summary> 使用 <code>Release</code> 🔨</summary>

**虽然此方式能够使用，不利于后续升级，故不推荐使用 🔔**
</details>

### <code>Karin</code> 🤖
请前往 [Karin仓库](https://github.com/ClarityJS/karin-plugin-meme)

### 安装依赖 📦
```bash
pnpm install --filter=meme-plugin
```

## 贡献者 👨‍💻👩‍💻

<a href="https://github.com/ClarityJS/meme-plugin/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ClarityJS/meme-plugin" />
</a>

![Alt](https://repobeats.axiom.co/api/embed/04d06e4e2d0cdfb7ef436a681dee7a2c83f199a6.svg "Repobeats analytics image")

# 资源 📚

- [Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) : 喵版 Yunzai [Gitee](https://gitee.com/yoimiya-kokomi/Miao-Yunzai) / [Github](https://github.com/yoimiya-kokomi/Miao-Yunzai)
- [Yunzai-V3](https://github.com/yoimiya-kokomi/Yunzai-Bot) ：Yunzai V3 - 喵喵维护版（使用 icqq）
- [Yunzai-V3](https://gitee.com/Le-niao/Yunzai-Bot) ：Yunzai V3 - 乐神原版（使用 oicq）
- [meme-generator](https://github.com/MeetWq/meme-generator): 表情包生成器，用于制作各种沙雕表情包 ***本插件的来源***
