# md2pdf Smoke Test

本文件验证中文与 English 混排、**黑体粗体**、inline code `render.sh`、"弯引号配对"，
以及数学公式：网络规模为$N=4$，求和 $\sum_{i=1}^{n} x_i$。

$$
\mathbb{E}[X] = \int_{-\infty}^{\infty} x\, f(x)\, \mathrm{d}x
$$

> 这是 blockquote。

## 表格与代码

| # | 检查项 | 结果 |
|---:|---|---|
| 1 | 字体 | 正常 ✅ |
| 2 | 公式 | 正常 |
| 3 | 矢量图 | 正常 → 见下图 |

```python
print("pdf")  # 中文注释
```

```
┌──────┐
│ 框图 │ → ok
└──────┘
```

## TikZ 图

下图是 Mermaid 已按 `references/mermaid-to-tikz.md` 转换后的形式。

```{.tikz scale="0.85" nocenter=false caption="Smoke_1 & 100% #ok"}
\begin{tikzpicture}[
  node distance=2.2cm,
  box/.style={draw=tikzboxstroke, fill=tikzboxfill, rounded corners,
    minimum width=2.4cm, minimum height=0.8cm, align=center},
  arrow/.style={-{Stealth[length=2.5mm]}, thick, draw=tikzaccent}
]
\node[box, fill=tikzaccept] (source) {Markdown};
\node[box, right=of source] (pandoc) {Pandoc};
\node[box, right=of pandoc, fill=tikzdecision] (pdf) {PDF 输出};
\draw[arrow] (source) -- (pandoc);
\draw[arrow] (pandoc) -- (pdf);
\end{tikzpicture}
```
