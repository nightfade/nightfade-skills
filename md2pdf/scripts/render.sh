#!/bin/sh
set -eu

usage() {
  printf 'Usage: %s [--book] [--no-toc] [--toc-depth N] [--resource-dir DIR] INPUT.md [OUTPUT.pdf]\n' "$0" >&2
  exit 2
}

with_toc=1
book=0
toc_depth=2
resource_dir=
while [ "$#" -gt 0 ]; do
  case "${1:-}" in
    --book) book=1; shift ;;
    --no-toc) with_toc=0; shift ;;
    --toc-depth) [ "$#" -ge 2 ] || usage; toc_depth=$2; shift 2 ;;
    # 渲染临时副本时指回源文档目录，让相对图片路径照常解析
    --resource-dir) [ "$#" -ge 2 ] || usage; resource_dir=$2; shift 2 ;;
    *) break ;;
  esac
done
[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
case "$toc_depth" in
  [1-6]) ;;
  *) printf 'error: --toc-depth must be 1-6\n' >&2; exit 2 ;;
esac

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
skill_dir=$(dirname "$script_dir")
input_arg=$1

if [ ! -s "$input_arg" ]; then
  printf 'error: input must be a non-empty file: %s\n' "$input_arg" >&2
  exit 2
fi

input_dir=$(CDPATH= cd "$(dirname "$input_arg")" && pwd -P)
input="$input_dir/$(basename "$input_arg")"
if [ -n "$resource_dir" ]; then
  [ -d "$resource_dir" ] || { printf 'error: --resource-dir is not a directory: %s\n' "$resource_dir" >&2; exit 2; }
  resource_dir=$(CDPATH= cd "$resource_dir" && pwd -P)
else
  resource_dir=$input_dir
fi
if [ "$#" -eq 2 ]; then
  output_arg=$2
else
  input_name=$(basename "$input")
  output_arg="$input_dir/${input_name%.*}.pdf"
fi

mkdir -p "$(dirname "$output_arg")"
output_dir=$(CDPATH= cd "$(dirname "$output_arg")" && pwd -P)
output="$output_dir/$(basename "$output_arg")"
if [ "$input" = "$output" ]; then
  printf 'error: output must not overwrite source Markdown\n' >&2
  exit 2
fi

"$script_dir/check-deps.sh"
export PATH="/Library/TeX/texbin:$PATH"
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/md2pdf.XXXXXX")
cleanup() { rm -rf "$temp_dir"; }
trap cleanup EXIT HUP INT TERM

prepared="$temp_dir/input.md"
temporary_pdf="$temp_dir/output.pdf"
# 残留 Mermaid block 时 preprocess.py 以退出码 3 拒绝，set -e 让渲染就此停止
python3 "$script_dir/preprocess.py" "$input" "$prepared"

set -- "$prepared" --output="$temporary_pdf" \
  --from=markdown+task_lists --pdf-engine=xelatex \
  --template="$skill_dir/assets/template.tex"
if [ "$book" -eq 1 ]; then
  # 封面和目录由 book.lua 插入正文最前面，所以这里不传 --toc
  set -- "$@" --include-in-header="$skill_dir/assets/book.tex" \
    --lua-filter="$skill_dir/assets/book.lua" \
    --metadata=toc-depth:"$toc_depth" --metadata=book-toc:"$([ "$with_toc" -eq 1 ] && echo true || echo false)"
fi
set -- "$@" --lua-filter="$skill_dir/assets/layout.lua" \
  --lua-filter="$script_dir/tikz.lua" \
  --resource-path="$resource_dir"
if [ "$with_toc" -eq 1 ] && [ "$book" -eq 0 ]; then
  set -- "$@" --toc --toc-depth="$toc_depth" --metadata=toc-depth:"$toc_depth"
fi
pandoc "$@"

[ -s "$temporary_pdf" ] || { printf 'error: renderer did not produce a PDF\n' >&2; exit 1; }
mv -f "$temporary_pdf" "$output"
if command -v pdfinfo >/dev/null 2>&1; then
  pages=$(pdfinfo "$output" | awk '/^Pages:/ {print $2}')
  printf 'PDF: %s (%s pages)\n' "$output" "${pages:-unknown}"
else
  printf 'PDF: %s\n' "$output"
fi
