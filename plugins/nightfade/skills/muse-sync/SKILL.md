---
name: muse-sync
description: 生成一段可以直接贴给 Muse（或其他 AI）的 prompt，让它从公开仓库 nightfade/nightfade-skills 学会新 skill，或把已装的 skill 更新到最新版；对方回报验证结果后，核对差异并记下同步进度。用户输入 /muse-sync、说「让 Muse 更新 skill」「让 Muse 学会 X」「给另一个 AI 一个补充 prompt」「Muse 那边同步一下」时用这个。
---

# muse-sync：让 Muse 跟上 skills 仓库

下文的 `<仓库>` 指同目录 `config.local.json` 里的 `repoDir`；`targets` 记着每个对象已装哪些 skill，以及每个 skill 各自上次同步到哪个提交（不进仓库，格式见 `config.example.json`）。开始前先读出来。默认对象是 `muse`，用户点名别的 AI 时，在 `targets` 里新建一项。

## 三种用法

| 用户说的 | 做什么 |
|---|---|
| `/muse-sync`、「让 Muse 更新」 | 走「更新」：把对方已装的 skill 同步到最新 |
| `/muse-sync 学 <skill名>`、「让 Muse 学会 X」 | 走「教新 skill」 |
| 用户贴回 Muse 的验证结果 | 走「核对回报」 |

## 共同原则

- **对方从 GitHub 拉文件，不手抄代码。** prompt 里给 raw 链接：`https://raw.githubusercontent.com/nightfade/nightfade-skills/main/plugins/nightfade/skills/<skill>/<文件>`。只有对方明确上不了 GitHub 时，才把文件原文贴进 prompt
- **先确认已推送。** 生成 prompt 之前，在 `<仓库>` 跑 `git status -sb` 和 `git log origin/main..HEAD --stat`。没推送的提交或没提交的文件涉及这次要发的 skill 时，先停下，问用户要不要先提交、推送，推完再写 prompt；和这次无关的，在回复末尾提一句就行
- **文件清单以远端为准。** 用 `git ls-tree -r --name-only origin/main plugins/nightfade/skills/<skill>/` 列文件，不要按本地目录列，本地有 `config.local.json` 这类不进仓库的文件
- **对方的路径对方自己定。** 不假设 Muse 把 skill 装在哪，prompt 里写「你本地的 `<skill>` skill 目录」
- **一律附这两条提醒：**
  - SKILL.md 里以插件根目录变量开头的脚本路径（美元符加花括号包住 CLAUDE_PLUGIN_ROOT，后接 `/skills/`），只有作为 Claude Code 插件安装时才会被替换。不是插件安装的，换成对方自己的 skill 目录。写进 prompt 时，这个变量要按原样写出来
  - 本 skill 正文里不直接写出这个变量，因为 Claude Code 加载 skill 时会把它替换成本机路径
  - 不要覆盖 `config.local.json`，那是本地配置，不在仓库里
- **先查对方的平台。** skill 依赖特定系统时（比如 macOS 钥匙串、`security` 命令），prompt 里先请对方确认系统；不满足就别装，不要让对方在本地改 SKILL.md 绕过去，本地改动下次同步会被覆盖
- **验证里的提问由对方代答。** 验证步骤要写明：skill 在测试中问的问题，由对方自己编测试答案代答，不要停下来等用户
- **验证不碰真实数据。** 要测写操作，先建测试条目，测完删掉；写明用哪条命令删，命令要先在该 skill 的脚本里确认存在
- **要对方回报。** prompt 结尾请对方列出做了什么、验证结果、和 prompt 描述不一致的地方
- 仓库是公开的，但 prompt 里会出现清单 ID 这类个人配置值。只在用户要求时把 `config.local.json` 里的值写进去
- **仓库外的依赖要单独交代。** skill 依赖不在仓库里的东西时（比如 `config.example.json` 里指向的私人文档），prompt 里只写「我会单独发给你」，然后在 prompt **外面**告诉用户要另外交什么、在哪；交不交、怎么交由用户定
- **prompt 是用户对对方说的话**，用「我」指用户。只给用户看的说明（要先推送、要另交文件）放在代码块外面
- prompt 用中文，整段放进一个 ````markdown 代码块，方便复制

## 更新

1. 在 `<仓库>` 里，对每个已装 skill，从它自己记的 `commit` 起看变化：

```bash
git log --oneline <commit>..origin/main -- plugins/nightfade/skills/<skill>/
git diff <commit>..origin/main -- plugins/nightfade/skills/<skill>/
```

2. 有变化的，按「更新 prompt 模板」写。「主要变化」用平白的话写行为差异（多了什么命令、规则改成什么），不贴 diff。`config.example.json` 有新字段的，列出字段名和含义，值请对方按自己的环境填，或问用户
3. 已装的全都没变时，告诉用户不用更新，但继续第 4 步
4. 列出仓库里有、对方没装的全部 skill（用 `git ls-tree --name-only origin/main plugins/nightfade/skills/`），各附一句用途，问要不要顺带让对方学
5. 把 prompt 给用户。**这时还不改记录**，等对方回报验证通过再改

## 教新 skill

1. 读该 skill 的 `SKILL.md`、`config.example.json` 和它引用的同目录文件，看依赖：命令行工具、登录、本地配置、操作系统。prompt 里提到的格式（表头、模板）要先在文件里找到原文，找不到就不写
2. 按「新 skill prompt 模板」写：远端该 skill 目录下全部文件的 raw 链接、依赖怎么装、配置怎么填、一句话说这个 skill 做什么、怎么触发
3. 对方回报成功后，把 skill 加进 `targets.<对象>.skills`，`commit` 记成写 prompt 时的 `origin/main`（`git rev-parse --short origin/main`），`at` 记今天

## 核对回报

1. 逐条对照对方的回报和 prompt 的描述
2. 不一致时分清是谁的问题：
   - prompt 写错或过时（比如用户自己在 App 里调过顺序）：以现实为准，回一段更正
   - 对方发现了仓库里的真 bug：先在 `<仓库>` 里修好、提交，问用户要不要推送，再回一段让对方拉新版
   - 对方没照做：回一段指出漏了哪步
3. 回复也放进 ````markdown 代码块
4. 全部验证通过后，把这次涉及的每个 skill 的 `commit` 改成写 prompt 时的 `origin/main`，`at` 改成今天

## 更新 prompt 模板

````markdown
请把你本地的 <skill 名，多个用顿号> skill 更新到 GitHub 上的最新版本。

## 1. 拉最新文件

仓库：https://github.com/nightfade/nightfade-skills（公开）

下载这些文件，覆盖你本地对应 skill 目录里的同名文件：

- `<skill>/SKILL.md`：<raw 链接>
- `<skill>/scripts/<脚本>`：<raw 链接>

注意：
- <插件根目录变量提醒：按「共同原则」写出原样的变量名>
- 不要覆盖 `config.local.json`

## 2. 配置变化

<没有就写「无」；有就列字段名、含义、怎么填>

## 3. 主要变化

<逐条写行为差异，读完新 SKILL.md 确认>

## 4. 验证

<具体怎么验，不碰真实数据>

做完告诉我：改了哪些文件、验证结果、有没有和上面描述不一致的地方。
````

## 新 skill prompt 模板

````markdown
请学会一个新 skill：<skill 名>。<一句话说它做什么>。

## 1. 安装

在你的 skill 目录下新建 `<skill>/`，从 GitHub 下载这些文件放进去：

- `SKILL.md`：<raw 链接>
- <其他文件>：<raw 链接>

注意：
- <插件根目录变量提醒：按「共同原则」写出原样的变量名>
- 照 `config.example.json` 新建 `config.local.json`，<各字段怎么填>

## 2. 依赖

<命令行工具、登录；没有就写「无」>

## 3. 怎么用

<触发方式，一两个例子>

## 4. 验证

<具体怎么验，不碰真实数据>

做完告诉我：装了哪些文件、配置怎么填的、验证结果、有没有卡住的地方。
````
