#!/usr/bin/env python3
"""Apply conservative Markdown fixes for the XeLaTeX/TikZ renderer."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


GREEK = (
    "Sigma", "Lambda", "Omega", "Gamma", "Delta", "Theta", "Pi", "Phi", "Psi",
    "sigma", "lambda", "omega", "gamma", "delta", "theta", "pi", "phi", "psi",
    "alpha", "beta", "epsilon", "mu", "nu", "rho", "tau", "chi", "eta", "zeta",
)
REPLACEMENTS = {
    "𝛴": "Σ",
    "𝛬": "Λ",
    "✓": r"$\checkmark$",
    "✗": r"$\times$",
    "⟺": "当且仅当",
    "⚠️": "【注意】",
    "⚠": "【注意】",
    "✅": r"$\checkmark$",
    "❌": r"$\times$",
    "✔️": r"$\checkmark$",
    "✔": r"$\checkmark$",
    "❎": r"$\times$",
    "✖️": r"$\times$",
    "✖": r"$\times$",
    "❓": "？",
    "❔": "？",
    "❗": "！",
    "❕": "！",
    "‼️": "！！",
    "‼": "！！",
    "💡": "【提示】",
    "📌": "【标注】",
    "📍": "【标注】",
    "🎯": "【目标】",
    "🔑": "【关键】",
    "🔥": "【重点】",
    "📝": "【笔记】",
    "📋": "【清单】",
    "📊": "【数据】",
    "📈": "【上升】",
    "📉": "【下降】",
    "🚀": "",
    "✨": "",
    "🎉": "",
    "🎊": "",
    "⭐": "★",
    "🌟": "★",
    "👉": "→",
    "👆": "↑",
    "👇": "↓",
    "👈": "←",
    "➡️": "→",
    "⬅️": "←",
    "⬆️": "↑",
    "⬇️": "↓",
    "➡": "→",
    "⬅": "←",
    "⬆": "↑",
    "⬇": "↓",
    "🔴": "●",
    "🟢": "●",
    "🟡": "●",
    "🟠": "●",
    "🔵": "●",
    "⚫": "●",
    "⚪": "○",
    "🟥": "■",
    "🟩": "■",
    "🟨": "■",
    "🟦": "■",
    "⬛": "■",
    "⬜": "□",
    "✏️": "【编辑】",
    "✏": "【编辑】",
    "🔒": "【锁】",
    "🔓": "【解锁】",
    "⏰": "【时间】",
    "⌛": "【等待】",
    "⏳": "【等待】",
    "💰": "【$】",
    "💵": "【$】",
    "💴": "【¥】",
    "💶": "【€】",
    "💷": "【£】",
    "🛑": "【停】",
    "🆕": "【新】",
    "🆗": "【OK】",
    "🆙": "【UP】",
}

EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FAFF"
    "\U0001F1E6-\U0001F1FF"
    "\uFE0E\uFE0F\u200D"
    "]"
)

MERMAID_FENCE_RE = re.compile(
    r"^\s*(?:`{3,}|~{3,})\s*(?:mermaid(?:\s|$)|\{[^}]*\.mermaid(?:\s|[.#}]))",
    re.IGNORECASE,
)

SEQUENCE_HEADERS = {"#", "序号", "序", "no.", "no", "编号"}
BOX_CHARS = set("┌─┐│└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╯╰")
CJK_PATTERN = r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]"


def mermaid_lines(text: str) -> list[int]:
    return [
        number
        for number, line in enumerate(text.splitlines(), start=1)
        if MERMAID_FENCE_RE.match(line)
    ]


def _pad_math_segment(current: str) -> str:
    """Put a space between CJK text and inline `$...$` math.

    xeCJK inserts CJK/Latin glue around text but not around math, so
    `规模为$N=4$时` renders with the formula glued to the characters.
    """
    current = current.replace("$$", "\x00DISPLAY_DOLLARS\x00")
    current = re.sub(
        rf"({CJK_PATTERN})\$([^$\n]+?)\$",
        r"\1 $\2$",
        current,
    )
    current = re.sub(
        rf"\$([^$\n]+?)\$({CJK_PATTERN})",
        r"$\1$ \2",
        current,
    )
    current = re.sub(
        r"\$(\S[^$\n\u4e00-\u9fff—–]*?[\\^_A-Za-z][^$\n\u4e00-\u9fff—–]*?)\$(?=[0-9A-Za-z])",
        r"$\1$ ",
        current,
    )
    return current.replace("\x00DISPLAY_DOLLARS\x00", "$$")


def pad_inline_math(text: str) -> str:
    lines = text.split("\n")
    result: list[str] = []
    in_fence = False

    for line in lines:
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            result.append(line)
            continue
        if in_fence:
            result.append(line)
            continue
        # Inline code spans (odd segments between backticks) stay untouched.
        segments = line.split("`")
        for position in range(0, len(segments), 2):
            segments[position] = _pad_math_segment(segments[position])
        result.append("`".join(segments))

    return "\n".join(result)


def mark_ascii_art_blocks(text: str) -> str:
    lines = text.split("\n")
    result: list[str] = []
    in_fence = False
    opening_index = -1
    language = ""
    body: list[str] = []

    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("```"):
            if not in_fence:
                in_fence = True
                language = stripped[3:].strip()
                opening_index = len(result)
                body = []
                result.append(line)
            else:
                if not language and any(char in BOX_CHARS for row in body for char in row):
                    indent = result[opening_index][:-len(result[opening_index].lstrip())]
                    result[opening_index] = indent + "```ascii"
                in_fence = False
                language = ""
                result.append(line)
        else:
            if in_fence:
                body.append(line)
            result.append(line)

    return "\n".join(result)


def strip_sequence_column(text: str) -> str:
    lines = text.split("\n")
    result: list[str] = []
    separator = re.compile(r"^\s*\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|\s*$")
    index = 0
    while index < len(lines):
        line = lines[index]
        if (
            line.lstrip().startswith("|")
            and index + 1 < len(lines)
            and separator.match(lines[index + 1])
        ):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if cells and cells[0].lower() in SEQUENCE_HEADERS:
                while index < len(lines) and lines[index].lstrip().startswith("|"):
                    row = lines[index].strip().strip("|").split("|")
                    result.append("| " + " | ".join(cell.strip() for cell in row[1:]) + " |")
                    index += 1
                continue
        result.append(line)
        index += 1
    return "\n".join(result)


def ensure_blank_before_lists(text: str) -> str:
    lines = text.split("\n")
    result: list[str] = []
    in_fence = False
    list_item = re.compile(r"^(\s*)([-*+]\s|\d+\.\s)")
    for index, line in enumerate(lines):
        result.append(line)
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence or index + 1 >= len(lines) or not list_item.match(lines[index + 1]):
            continue
        if not line.strip() or list_item.match(line) or line.lstrip().startswith(("|", "#", ">")):
            continue
        result.append("")
    return "\n".join(result)


def pair_quotes(text: str) -> str:
    """Turn straight quotes into paired curly quotes.

    Pandoc's `smart` extension decides open-vs-close from the neighbouring
    character, so in CJK text — which has no inter-word spaces — every quote
    looks like a closing one and `"团体的"` renders as `''团体的''`. Alternating
    per line is reliable here because quotes come in pairs within a paragraph,
    and markdown paragraphs are single lines in these documents.

    Single quotes only alternate next to non-ASCII text, so English
    apostrophes (`don't`, `family's`) stay straight for pandoc's own smart
    handling, which already gets them right.

    Code is left alone: fenced blocks, indented blocks and inline spans.
    """
    lines = text.split("\n")
    result: list[str] = []
    in_fence = False
    in_front_matter = False
    for index, line in enumerate(lines):
        if index == 0 and line.strip() == "---":
            in_front_matter = True
            result.append(line)
            continue
        if in_front_matter:
            if line.strip() in ("---", "..."):
                in_front_matter = False
            result.append(line)
            continue
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            result.append(line)
            continue
        if in_fence or line.startswith(("    ", "\t")) or not set(line) & {'"', "'"}:
            result.append(line)
            continue

        rebuilt: list[str] = []
        in_code_span = False
        opening = {'"': True, "'": True}
        curly = {'"': ("“", "”"), "'": ("‘", "’")}
        for position, char in enumerate(line):
            if char == "`":
                in_code_span = not in_code_span
                rebuilt.append(char)
                continue
            if in_code_span or char not in curly:
                rebuilt.append(char)
                continue
            if char == "'":
                before = line[position - 1] if position else ""
                after = line[position + 1] if position + 1 < len(line) else ""
                if before.isascii() and after.isascii():
                    rebuilt.append(char)
                    continue
            rebuilt.append(curly[char][0 if opening[char] else 1])
            opening[char] = not opening[char]
        result.append("".join(rebuilt))
    return "\n".join(result)


def preprocess(text: str) -> str:
    for name in GREEK:
        text = text.replace(rf"\mathbf{{\{name}}}", rf"\boldsymbol{{\{name}}}")
    for source, replacement in REPLACEMENTS.items():
        text = text.replace(source, replacement)
    text = EMOJI_RE.sub("", text)
    text = strip_sequence_column(text)
    text = ensure_blank_before_lists(text)
    text = pad_inline_math(text)
    text = mark_ascii_art_blocks(text)
    return pair_quotes(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source = args.input.expanduser().resolve(strict=True)
    output = args.output.expanduser().resolve()
    if source == output:
        print("error: output must not overwrite source Markdown", file=sys.stderr)
        return 2
    if not source.is_file() or source.stat().st_size == 0:
        print(f"error: input is not a non-empty file: {source}", file=sys.stderr)
        return 2

    content = source.read_text(encoding="utf-8")
    found = mermaid_lines(content)
    if found:
        locations = ", ".join(str(line) for line in found)
        print(
            "error: Mermaid blocks remain at line(s) "
            f"{locations}; translate them to TikZ in a temporary copy before rendering",
            file=sys.stderr,
        )
        return 3

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(preprocess(content), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
