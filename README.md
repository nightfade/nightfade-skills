# nightfade-skills

个人自用的 Claude Code skills，打包成一个插件 `nightfade`，安装后以 `/nightfade:<skill>` 调用；名字不冲突时也可以直接用 `/<skill>`。

| skill | 用途 |
|---|---|
| dida-tasks | 维护滴答清单里的执行看板和目标清单，收纳杂乱想法、待办，并让执行项对齐目标 |
| dida-jot | 把零散想法整理通顺、自动分类后记进滴答的笔记清单 |
| annie-decide | 按 Annie Duke 的决策体系带着做决定、写记录、复盘 |
| brainstorming-zh | 中文版头脑风暴：通过结构化对话把模糊想法磨成可执行的设计，不限于代码 |
| md2pdf | Markdown 转出版风格 PDF（XeLaTeX，支持书籍版式，图表本地转 TikZ，完全离线） |
| share-html | 把 HTML 加密后发布到 Cloudflare Pages，生成带密码的链接 |

## 结构

```
.claude-plugin/marketplace.json      # 插件市场：nightfade-skills
plugins/nightfade/
├── .claude-plugin/plugin.json       # 插件：nightfade
└── skills/<skill>/SKILL.md
```

## 安装

从 GitHub 安装：

```
/plugin marketplace add nightfade/nightfade-skills
/plugin install nightfade@nightfade-skills
```

本地开发时，从本地目录添加市场，插件会直接从源目录加载，改完运行 `/reload-plugins` 生效：

```
/plugin marketplace add /path/to/nightfade-skills
/plugin install nightfade@nightfade-skills
```

## 配置

有 `config.example.json` 的 skill，在同目录复制一份 `config.local.json` 并填好（已在 `.gitignore` 里，不会提交）。dida 相关 skill 依赖 npm 包 `@suibiji/dida-cli`（命令 `dida`），先 `dida auth login`。
