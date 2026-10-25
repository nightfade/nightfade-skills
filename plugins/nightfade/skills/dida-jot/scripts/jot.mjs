#!/usr/bin/env node
// 往滴答清单「📒随手记」（笔记类型清单）写笔记。复用本机 dida CLI 的登录态和 API 客户端。
import { getApi } from '/opt/homebrew/lib/node_modules/@suibiji/dida-cli/dist/lib/api.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 清单 ID 等本机配置放在 skill 目录的 config.local.json（不进仓库），格式见 config.example.json
const CFG = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'config.local.json'), 'utf8'));
const PROJECT = CFG.projectId;
const api = await getApi();
// 滴答开放接口限速：每分钟 100 次请求。撞到 429 时等 60 秒重试，最多 3 次
{
  const raw = api.request.bind(api);
  api.request = async (...args) => {
    for (let i = 0; ; i++) {
      try { return await raw(...args); }
      catch (e) {
        if (!String(e.message).includes('429') || i >= 3) throw e;
        console.error('触发限速，60 秒后重试');
        await new Promise(r => setTimeout(r, 60000));
      }
    }
  };
}
const [cmd, ...rest] = process.argv.slice(2);

function parseFlags(args) {
  const flags = {}; const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; i++; }
    else pos.push(args[i]);
  }
  return { flags, pos };
}
const out = o => console.log(JSON.stringify(o, null, 2));

// 分类 = 随手记里的分组（看板列接口）。接口不能删分组，名称含「可删」的空分组可以被改名复用
async function categoryId(name) {
  const d = await api.getProjectWithData(PROJECT);
  const cols = d.columns ?? [];
  const exact = cols.find(c => c.name === name);
  if (exact) return { id: exact.id, created: false };
  const spare = cols.find(c => c.name.includes('可删') && !(d.tasks ?? []).some(t => t.columnId === c.id));
  if (spare) {
    await api.updateColumn(PROJECT, spare.id, { name });
    return { id: spare.id, created: true };
  }
  const c = await api.createColumn(PROJECT, { name });
  return { id: c.id, created: true };
}

async function findNote(q) {
  if (/^[0-9a-f]{24}$/.test(q)) return api.getTask(PROJECT, q);
  const d = await api.getProjectWithData(PROJECT);
  const hit = (d.tasks ?? []).filter(t => t.title.includes(q));
  if (hit.length !== 1) throw new Error(hit.length ? `匹配到 ${hit.length} 条，请用 ID：\n${hit.map(t => `  ${t.id} ${t.title}`).join('\n')}` : `找不到笔记：${q}`);
  return hit[0];
}

switch (cmd) {
  case 'add': {
    // add --title 标题 --content 正文 [--tags a,b]
    const { flags } = parseFlags(rest);
    if (!flags.title || !flags.content) throw new Error('需要 --title 和 --content');
    const t = await api.createTask({
      projectId: PROJECT, kind: 'NOTE', title: flags.title, content: flags.content,
      tags: flags.tags ? flags.tags.split(',') : undefined,
    });
    let cat = null;
    if (flags.cat) {
      cat = await categoryId(flags.cat);
      await api.updateTask(t.id, { id: t.id, projectId: PROJECT, columnId: cat.id });
    }
    out({ id: t.id, title: t.title, kind: t.kind, category: flags.cat ?? null, newCategory: cat?.created ?? false });
    break;
  }
  case 'list': {
    // list [n]：最近修改的 n 条，默认 10
    const n = parseInt(rest[0] ?? '10', 10);
    const d = await api.getProjectWithData(PROJECT);
    const ts = (d.tasks ?? []).sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '')).slice(0, n);
    for (const t of ts) console.log(`${t.id}  ${(t.modifiedTime ?? '').slice(0, 10)}  ${t.title}`);
    break;
  }
  case 'cats': {
    // 列出现有分类和各自的笔记数、最近几条标题，供归类参考
    const d = await api.getProjectWithData(PROJECT);
    const cols = (d.columns ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    for (const c of cols) {
      const ts = (d.tasks ?? []).filter(t => t.columnId === c.id);
      console.log(`${c.name}（${ts.length}）${ts.slice(0, 5).map(t => '\n  - ' + t.title).join('')}`);
    }
    const none = (d.tasks ?? []).filter(t => !cols.some(c => c.id === t.columnId));
    if (none.length) console.log(`未分类（${none.length}）${none.map(t => '\n  - ' + t.title).join('')}`);
    break;
  }
  case 'move': {
    // move <ID或标题片段> <分类名>：分类不存在就新建
    const name = rest.pop();
    const t = await findNote(rest.join(' '));
    const cat = await categoryId(name);
    await api.updateTask(t.id, { id: t.id, projectId: PROJECT, columnId: cat.id });
    out({ id: t.id, title: t.title, category: name, newCategory: cat.created });
    break;
  }
  case 'show': {
    const t = await findNote(rest.join(' '));
    console.log(`# ${t.title}\n\n${t.content ?? ''}`);
    break;
  }
  case 'edit': {
    // edit <ID或标题片段> [--title ..] [--content ..]
    const { flags, pos } = parseFlags(rest);
    const t = await findNote(pos.join(' '));
    const u = await api.updateTask(t.id, { id: t.id, projectId: PROJECT, title: flags.title, content: flags.content });
    out({ id: u.id, title: u.title });
    break;
  }
  case 'delete': {
    const t = await findNote(rest.join(' '));
    await api.deleteTask(PROJECT, t.id);
    out({ deleted: t.id, title: t.title });
    break;
  }
  default:
    console.log(`用法：
  jot add --title 标题 --content 正文 [--cat 分类]
  jot cats
  jot move <ID或标题片段> <分类>
  jot list [n]
  jot show <ID或标题片段>
  jot edit <ID或标题片段> [--title ..] [--content ..]
  jot delete <ID或标题片段>`);
}
