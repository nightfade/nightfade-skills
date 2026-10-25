#!/bin/sh
# 检查本地渲染所需的全部依赖。全程离线，不访问网络。
# 缺必需项时返回 1；Sarasa Fixed SC、pdfinfo 只给提示，不阻断渲染。
set -eu

export PATH="/Library/TeX/texbin:$PATH"
missing=0
for command_name in pandoc python3 xelatex kpsewhich; do
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'ok: %-10s %s\n' "$command_name" "$(command -v "$command_name")"
  else
    printf 'missing: %s\n' "$command_name" >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

for package in xeCJK.sty fontspec.sty unicode-math.sty newunicodechar.sty \
  tcolorbox.sty fancyvrb.sty adjustbox.sty titlesec.sty tocloft.sty \
  tikz.sty pgfplots.sty; do
  if kpsewhich "$package" >/dev/null 2>&1; then
    printf 'ok: TeX package %s\n' "$package"
  else
    printf 'missing: TeX package %s\n' "$package" >&2
    missing=1
  fi
done

# 字体：模板硬编码的字体缺了 XeLaTeX 会直接报错，所以都算必需。
# Sarasa Fixed SC 例外：模板检测不到会回落到 Heiti SC + Menlo，只影响框图对齐。
if command -v fc-list >/dev/null 2>&1; then
  for font in "Palatino" "Baskerville" "Menlo" "Songti SC" "Heiti SC" "Arial Unicode MS"; do
    if [ -n "$(fc-list "$font" family | head -n 1)" ]; then
      printf 'ok: font %s\n' "$font"
    else
      printf 'missing: font %s\n' "$font" >&2
      missing=1
    fi
  done
  if [ -n "$(fc-list "Sarasa Fixed SC" family | head -n 1)" ]; then
    printf 'ok: font Sarasa Fixed SC\n'
  else
    printf 'warn: font Sarasa Fixed SC not found; code blocks fall back to Heiti SC + Menlo, box-drawing diagrams may misalign\n' >&2
  fi
else
  printf 'note: fc-list unavailable; fonts will be verified by XeLaTeX\n'
fi

if command -v pdfinfo >/dev/null 2>&1; then
  printf 'ok: %-10s %s\n' pdfinfo "$(command -v pdfinfo)"
else
  printf 'note: pdfinfo not found (optional; page count will not be reported)\n'
fi

exit "$missing"
