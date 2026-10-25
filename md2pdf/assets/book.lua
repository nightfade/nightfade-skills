-- --book 版式。文档以唯一的 H1 开头时，H1 连同它下面到第一个 ## 之前的内容
-- 做成封面，其余标题整体上提一级，让 ## 成为 \section（整页起的通栏色块）。
-- 不符合这个结构时标题层级不动，只把目录放到最前面。
-- 目录由本 filter 插入而不用 pandoc --toc：--toc 会排在封面之前。
local function latex(blocks)
  return pandoc.write(pandoc.Pandoc(blocks), "latex")
end

-- 「第 1 章 标题」里的空格夹在两个汉字之间，xeCJK 会把它吞掉
local function keep_chapter_gap(inlines)
  local seen_di = false
  for i = 1, #inlines - 1 do
    local a, b = inlines[i], inlines[i + 1]
    if a.t == "Str" and a.text:match("^第") then seen_di = true end
    if seen_di and a.t == "Str" and a.text:match("[章节篇]$") and b.t == "Space" then
      inlines[i + 1] = pandoc.RawInline("latex", "\\quad{}")
      break
    end
  end
  return inlines
end

local function find_cover(blocks)
  local h1, first_h2 = nil, nil
  for i, b in ipairs(blocks) do
    if b.t == "Header" and b.level == 1 then
      if h1 then return nil end
      h1 = i
    elseif b.t == "Header" and b.level == 2 and not first_h2 then
      first_h2 = i
    end
  end
  if h1 == 1 and first_h2 then return first_h2 end
  return nil
end

function Pandoc(doc)
  local toc = doc.meta["book-toc"] ~= false
    and pandoc.utils.stringify(doc.meta["book-toc"] or "") ~= "false"
  local first_h2 = find_cover(doc.blocks)
  local front, start, shift = "", 1, 0

  if first_h2 then
    local subtitle = pandoc.List()
    for i = 2, first_h2 - 1 do
      local b = doc.blocks[i]
      if b.t == "BlockQuote" then subtitle:extend(b.content) else subtitle:insert(b) end
    end
    front = "\\bookcover{" .. latex({pandoc.Plain(doc.blocks[1].content)})
      .. "}{" .. latex(subtitle) .. "}\n"
    start, shift = first_h2, 1
  end
  if toc then front = front .. "\\tableofcontents\n\\clearpage" end

  local body = pandoc.List()
  if front ~= "" then body:insert(pandoc.RawBlock("latex", front)) end
  for i = start, #doc.blocks do
    local b = doc.blocks[i]
    if b.t == "Header" then
      b.level = b.level - shift
      b.content = keep_chapter_gap(b.content)
    end
    body:insert(b)
  end
  doc.blocks = body
  return doc
end
