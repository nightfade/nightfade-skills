---
name: share-html
description: 把 HTML 文档加密后发布到 Cloudflare Pages，生成带密码的分享链接；也负责查看已分享的文档、找回密码、更新内容和下线。用户说「分享这个 HTML」「发布加密文档」「生成分享链接」「这份文档要发给别人看」，或要找回、更新、下线之前分享的文档时用这个。
---

# share-html：加密 HTML 分享

HTML 在本机用 AES-256-GCM 加密（PBKDF2-SHA256 60 万次派生密钥，先 gzip 再加密），套进一个自带解密逻辑的页面，发布到 Cloudflare Pages 的随机路径下。对方打开链接、输入密码，在浏览器里解密。Cloudflare 上只有密文。

脚本：`~/.claude/skills/share-html/scripts/share.mjs`，下面用 `share` 代指 `node ~/.claude/skills/share-html/scripts/share.mjs`。

## 命令

| 场景 | 命令 |
|------|------|
| 发布新文档 | `share publish <文件.html> [--title 标题]` |
| 更新已发布的文档（链接和密码不变） | `share publish <文件.html> --slug <slug>` |
| 列出已发布的文档 | `share list` |
| 找回某份文档的密码 | `share password <slug>` |
| 下线 | `share remove <slug>` |
| 只重新部署 | `share deploy` |

- 密码每份自动生成，格式 `xxxx-xxxx-xxxx-xxxx`，存在 macOS 钥匙串（服务名 `share-html`，账户名为 slug）
- `--password` 可以手动指定密码，只在用户明确要求时用
- 标题默认取 HTML 的 `<title>`，只出现在本地清单里，不会上传明文

## 发布流程

1. 确认要发的是自包含的单个 HTML。解密后整页替换，相对路径的图片、CSS、JS 都会失效。脚本发现本地引用会打警告，这时先把资源内联成 data URI 或 `<style>`/`<script>`，再发布
2. 运行 `share publish`
3. 把脚本输出的「链接」「密码」「免输密码链接」原样交给用户，并提醒：
   - 链接和密码分开发更安全
   - 免输密码链接里 `#` 后面就是密码，不会发到服务器，但对方转发链接等于转发密码

## 本地数据

| 内容 | 位置 |
|------|------|
| 配置（Pages 项目名） | `~/.config/share-html/config.json` |
| 站点目录（只有密文） | `~/.local/share/share-html/site/` |
| 已发布清单 | `~/.local/share/share-html/registry.json` |
| 密码 | macOS 钥匙串 |

每次部署都上传整个站点目录，所以**站点目录就是线上内容的唯一来源**。

下线一律用 `share remove`，不要手动删站点目录里的文件：
- Pages 边缘缓存不认 `Cache-Control`，路径被删掉后，缓存会继续返回旧密文（实测 7 分钟以上未失效）。用「已下线」占位页覆盖同一路径，缓存会立刻更新，所以 `remove` 留下的是占位页，不是空路径
- 部署完脚本会删掉 Pages 的旧部署。Pages 给每次部署留一个独立网址，不删的话，下线的文档还能从旧网址拿到密文

## 首次配置

只需做一次，已经有 `~/.config/share-html/config.json` 就跳过。

1. 用户在 Claude 里执行 `! npx -y wrangler@4 login`，浏览器里授权 Cloudflare
2. `share setup <项目名>`：创建 Pages 项目，域名为 `<项目名>.pages.dev`。项目名全局唯一，被占用就换一个

新版 wrangler 默认把 Pages 命令转给 Workers，创建项目时要加 `--force` 才会建成 Pages 项目，脚本已经处理。项目建好以后，部署等命令直接走 Pages，不用再加。

当前的项目名和域名见 `~/.config/share-html/config.json`。

## 安全边界

- 安全性完全取决于密码。拿到页面的人可以离线暴力破解，所以不要换成短密码
- 不能撤回已经被打开过的内容，对方可以另存。下线只阻止之后的访问
- 站点带 `noindex` 和 `robots.txt`，路径是 10 位随机串，不会被搜索引擎收录或猜到
