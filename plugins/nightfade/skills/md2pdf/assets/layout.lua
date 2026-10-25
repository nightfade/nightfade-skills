-- Drop decorative horizontal rules so long documents keep their information
-- density. A `---` that only separates two sections costs a ruled line plus the
-- vertical space around it; the heading that follows already marks the break.
-- When no heading follows, leave a small gap instead of the rule.

-- Bold every header cell. Body rows carry a zebra stripe (see template.tex);
-- whether the header row itself lands on a striped or plain band depends on
-- how long the table is, so weight — not colour — is what marks it as a header.
function Table(tbl)
  for _, row in ipairs(tbl.head.rows) do
    for _, cell in ipairs(row.cells) do
      cell.contents = pandoc.walk_block(pandoc.Div(cell.contents), {
        Plain = function(p) return pandoc.Plain{pandoc.Strong(p.content)} end,
        Para = function(p) return pandoc.Para{pandoc.Strong(p.content)} end,
      }).content
    end
  end
  return tbl
end

function Blocks(blocks)
  local kept = pandoc.List()
  for index, block in ipairs(blocks) do
    if block.t == "HorizontalRule" then
      local following = blocks[index + 1]
      if following and following.t ~= "Header" then
        kept:insert(pandoc.RawBlock("latex", "\\vspace{0.4\\baselineskip}"))
      end
    else
      kept:insert(block)
    end
  end
  return kept
end
