---
name: md2pdf
description: "用 Pandoc 和 XeLaTeX 将 Markdown 转为出版风格 PDF。适合长文档、复杂数学、中英混排，读书笔记和教材可用 --book 版式；Mermaid 图先在临时副本里转成原生 TikZ 再本地渲染。全程离线，不依赖任何网络服务。"
argument-hint: "[--book] [--no-toc] [--toc-depth N] <markdown-file> [output-pdf]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Markdown to PDF（XeLaTeX + TikZ）

从当前 `SKILL.md` 的实际位置解析 `SKILL_DIR`，不要假设全局安装路径。renderer 在
`mktemp -d` 临时目录中预处理和编译，不修改源 Markdown，成功后才把 PDF 移到目标位置。

## 使用

```bash
"$SKILL_DIR/scripts/check-deps.sh"
"$SKILL_DIR/scripts/render.sh" "$INPUT" "$OUTPUT"
```

第二个参数可省略，默认输出到输入文件旁的同名 `.pdf`。可选参数放在输入文件之前：

| 参数 | 作用 |
|---|---|
| `--no-toc` | 不生成目录，适合短文档 |
| `--toc-depth N` | 目录深度 1-6，默认 2；章节多的长文档用 3 |
| `--book` | 分部分、分章的长文档版式（读书笔记、教材），见下节 |
| `--resource-dir DIR` | 相对图片路径的解析目录，默认是输入文件所在目录；渲染临时副本时用 |

```bash
"$SKILL_DIR/scripts/render.sh" --no-toc "$INPUT" "$OUTPUT"
"$SKILL_DIR/scripts/render.sh" --toc-depth 3 "$INPUT" "$OUTPUT"
"$SKILL_DIR/scripts/render.sh" --book "$INPUT" "$OUTPUT"
```

输入含 ```` ```mermaid ```` 时不能直接渲染，先走下面「图表」流程。

## `--book` 版式

各级标题样式拉开差距，翻页时一眼能分出层级。文档以唯一的 `#` 开头时：

| Markdown | 样式 |
|---|---|
| `#` 及其下到第一个 `##` 之前的内容 | 封面页（书名 + 副标题），后接目录页 |
| `##` | 另起一页，深棕色通栏色块，白色大字 |
| `###` | 左侧棕色色条 + 浅色细下划线 |
| `####` | 棕色粗体 |
| `#####` | 独立成行，前加棕色方块 |
| `######` | 与正文同行的棕色粗体 |

- 有多个 `#` 时不做封面，层级不上提：`#` 用通栏色块，`##` 用色条，依此类推
- 目录由 `assets/book.lua` 插在封面之后，不走 pandoc `--toc`（那样会排在封面前）。
  `--no-toc`、`--toc-depth` 照常生效，目录里 section 一级加粗着色
- 「第 1 章 标题」这类标题，汉字间的空格会被 xeCJK 吞掉，`book.lua` 换成 `\quad`
- 样式在 `assets/book.tex`，经 `--include-in-header` 叠加，所以**文档 YAML 里的
  `header-includes` 在 `--book` 下不生效**；非 `--book` 模式下照常生效
- 每个 `##` 都另起一页，短文档会很空，不要用

## 图表（Mermaid → TikZ）

图只走本地 TikZ，没有在线渲染。

1. 检查输入的 fenced code block 是否有 `mermaid`。没有就直接渲染。
2. 有 Mermaid 时：
   - `mktemp -d` 建临时目录，把输入复制进去。
   - 只编辑副本，按 [references/mermaid-to-tikz.md](references/mermaid-to-tikz.md)
     把每个 Mermaid block 语义转换为 ```` ```tikz ```` block，转换后核对节点、边、方向和标签。
   - 有图无法可靠转换时，报告是哪一张、为什么，然后停止。不生成缺图的 PDF。
   - 渲染副本时显式给出输出路径（默认会落到临时目录里），并用 `--resource-dir`
     指回源文档目录：

     ```bash
     "$SKILL_DIR/scripts/render.sh" --resource-dir "$(dirname "$INPUT")" \
       "$TMP_DIR/input.md" "$OUTPUT"
     ```

   - 结束后删除临时目录。
3. `render.sh` 会再检查一次：残留 Mermaid 时 `preprocess.py` 报出行号并以退出码 3 中止。

TikZ block 可以只写绘图命令，也可以写完整 `tikzpicture`，支持以下属性：

````markdown
```{.tikz scale="0.8" caption="流程_1 & 验证" nocenter=false}
\node[draw, circle] (a) at (0,0) {A};
\node[draw, circle] (b) at (3,0) {B};
\draw[->] (a) -- (b);
```
````

- `scale` 必须是大于 0 且不超过 100 的有限数字；非法值会终止转换
- `caption` 会按 LaTeX 文本转义，有 caption 时进 `figure` 环境
- `nocenter=true` 才关闭居中；`false`、`0`、`no` 均保持居中
- 模板内置暖色 palette：`tikzboxfill`、`tikzboxstroke`、`tikzaccent`、
  `tikzaccept`、`tikzreject`、`tikzdecision`；已加载 pgfplots 和常用 TikZ 库

## 行为

- 模板 `assets/template.tex`：Palatino、Songti SC、Baskerville。中文粗体映射到
  Heiti SC（黑体），否则 `**bold**` 和表头在正文里看不出来。
- 代码块用 Sarasa Fixed SC（CJK 与 ASCII 严格 2:1 等宽），box-drawing 和箭头字符
  按西文宽度排，ASCII 框图不会错位。未安装 Sarasa Fixed SC 时模板自动回落到
  Heiti SC + Menlo，照常出 PDF，只是框图可能错位；`check-deps.sh` 会给出 warn。
- 版面按信息密度设定：行距 1.28、表格内行距 1.08、标题下不画横线、页眉不画横线、
  页码只出现在页眉右侧。
- 表格用斑马纹底色区分行，不加逐行横线；表头由 `layout.lua` 统一加粗。
- `assets/layout.lua` 丢弃 Markdown 的 `---` 分隔线：后面紧跟标题时整条去掉，否则
  换成小段空隙。确需横线时在源文件里显式写 LaTeX。
- `scripts/preprocess.py`：
  - 处理常见数学字符、表格序号列、列表前空行
  - 常见 emoji 换成文字标记或符号，其余 emoji 删除（字体里没有）
  - 中文与行内 `$...$` 之间补空格
  - 无语言标签且含 box-drawing 字符的代码块标成 `ascii`，用更紧的行距排
  - 直引号按行交替配对成弯引号。pandoc 的 `smart` 在中文里会把两边都判成右引号；
    英文撇号（`don't`）保持原样交给 pandoc

## 约束

- 不修改输入 Markdown；中间文件只放在 `mktemp -d` 目录中并在结束时删除。
- 不把 Mermaid 当普通代码块悄悄输出，也不调用任何在线图表服务。
- 依赖检查通过后再渲染。
- 路径始终加双引号。

## 验证

变更本 skill 后至少运行：

```bash
"$SKILL_DIR/scripts/check-deps.sh"
"$SKILL_DIR/scripts/render.sh" "$SKILL_DIR/tests/smoke.md" "/tmp/md2pdf-smoke.pdf"
"$SKILL_DIR/scripts/render.sh" --book "$SKILL_DIR/tests/smoke.md" "/tmp/md2pdf-smoke-book.pdf"
pdfinfo "/tmp/md2pdf-smoke.pdf"
pdfinfo "/tmp/md2pdf-smoke-book.pdf"
```

smoke 覆盖中文、数学、表格、代码块、ASCII 框图和一张已转换好的 TikZ 图。渲染失败时
保留终端里的 Pandoc/XeLaTeX 错误用于定位，不要把临时构建文件写回源文档目录。
