-- Convert fenced TikZ and ASCII-art blocks to raw LaTeX.

local function attr_get(block, key)
  local attrs = block.attributes or {}
  if attrs[key] ~= nil then
    return attrs[key]
  end
  for _, pair in ipairs(attrs) do
    if pair[1] == key then
      return pair[2]
    end
  end
  return nil
end

local function has_class(block, expected)
  if block.t ~= 'CodeBlock' then
    return false
  end
  for _, class_name in ipairs(block.classes) do
    if class_name == expected then
      return true
    end
  end
  return false
end

local function trim(value)
  return value:match('^%s*(.-)%s*$')
end

local function parse_boolean(value)
  if value == nil then
    return false
  end
  local normalized = trim(value):lower()
  return normalized == 'true'
    or normalized == '1'
    or normalized == 'yes'
    or normalized == 'on'
end

local function parse_scale(value)
  if value == nil then
    return nil
  end

  local normalized = trim(value)
  local number = tonumber(normalized)
  local valid_characters = normalized:match('^[%+%-%.%dEe]+$') ~= nil
  local finite = number ~= nil and number == number
    and number ~= math.huge and number ~= -math.huge

  if not valid_characters or not finite or number <= 0 or number > 100 then
    error('tikz scale must be a finite number greater than 0 and no more than 100')
  end
  return normalized
end

local function escape_latex_text(value)
  local replacements = {
    ['\\'] = '\\textbackslash{}',
    ['{'] = '\\{',
    ['}'] = '\\}',
    ['$'] = '\\$',
    ['&'] = '\\&',
    ['#'] = '\\#',
    ['%'] = '\\%',
    ['_'] = '\\_',
    ['~'] = '\\textasciitilde{}',
    ['^'] = '\\textasciicircum{}',
  }
  local escaped = value:gsub('.', function(character)
    return replacements[character] or character
  end)
  return escaped
end

local function wrap_tikz_picture(body, scale)
  if not body:find('\\begin{tikzpicture}', 1, true) then
    local options = scale and ('[scale=' .. scale .. ']') or ''
    return '\\begin{tikzpicture}' .. options .. '\n'
      .. body .. '\n\\end{tikzpicture}'
  end

  if scale == nil then
    return body
  end

  local replaced = false
  body = body:gsub('\\begin{tikzpicture}(%b[])', function(options)
    replaced = true
    local inner = options:sub(2, -2)
    if inner == '' then
      return '\\begin{tikzpicture}[scale=' .. scale .. ']'
    end
    return '\\begin{tikzpicture}[' .. inner .. ',scale=' .. scale .. ']'
  end, 1)

  if not replaced then
    body = body:gsub(
      '\\begin{tikzpicture}',
      '\\begin{tikzpicture}[scale=' .. scale .. ']',
      1
    )
  end
  return body
end

function CodeBlock(block)
  if has_class(block, 'ascii') then
    return pandoc.RawBlock(
      'latex',
      '\\begin{asciiart}\n' .. block.text .. '\n\\end{asciiart}'
    )
  end

  if not has_class(block, 'tikz') then
    return nil
  end

  local body = block.text:gsub('%s+$', '')
  local caption = attr_get(block, 'caption')
  local scale = parse_scale(attr_get(block, 'scale'))
  local nocenter = parse_boolean(attr_get(block, 'nocenter'))
  body = wrap_tikz_picture(body, scale)

  local latex
  if caption and caption ~= '' then
    local centering = nocenter and '' or '\\centering\n'
    latex = '\\begin{figure}[ht]\n'
      .. centering .. body .. '\n\\caption{'
      .. escape_latex_text(caption) .. '}\n\\end{figure}'
  elseif nocenter then
    latex = body
  else
    latex = '\\begin{tikzfigure}\n' .. body .. '\n\\end{tikzfigure}'
  end

  return pandoc.RawBlock('latex', latex)
end
