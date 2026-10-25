# Claude Code skills

个人自用的 Claude Code skills。

| skill | 用途 |
|---|---|
| dida-tasks | 维护滴答清单里的一个看板，收纳杂乱想法和待办 |
| dida-jot | 把零散想法整理通顺、自动分类后记进滴答的笔记清单 |
| brainstorming-zh | 中文版头脑风暴：通过结构化对话把模糊想法磨成可执行的设计，不限于代码 |
| annie-decide | 按 Annie Duke 的决策体系带着做决定、写记录、复盘 |
| share-html | 把 HTML 加密后发布到 Cloudflare Pages，生成带密码的链接 |
| md2pdf | Markdown 转出版风格 PDF（XeLaTeX，支持书籍版式，图表本地转 TikZ，完全离线） |

## 安装

1. 把需要的 skill 目录软链接到 `~/.claude/skills/`：`ln -s "$PWD/dida-tasks" ~/.claude/skills/dida-tasks`
2. 有 `config.example.json` 的 skill，复制成 `config.local.json` 并填好。`config.local.json` 已在 `.gitignore` 里，不会提交
3. dida 相关 skill 依赖 npm 包 `@suibiji/dida-cli`（命令 `dida`），先 `dida auth login`
