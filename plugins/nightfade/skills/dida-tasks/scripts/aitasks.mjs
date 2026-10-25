#!/usr/bin/env node
// 维护滴答清单「🤖AI Tasks」看板。复用本机 dida CLI 的登录态和 API 客户端。
import { getApi } from '/opt/homebrew/lib/node_modules/@suibiji/dida-cli/dist/lib/api.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 清单 ID 等本机配置放在 skill 目录的 config.local.json（不进仓库），格式见 config.example.json
const CFG = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'config.local.json'), 'utf8'));
const PROJECT = CFG.projectId;
// 时区：配置里没写就用本机时区
const TZ = CFG.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
// 列用关键词匹配，列名改了 emoji 也能找到
const COLUMN_KEYS = { inbox: '收件箱', doing: '进行中', todo: '待办', waiting: '等条件', later: '以后再说', closed: '已完成' };

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
    if (args[i].startsWith('--')) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) flags[args[i].slice(2)] = true;
      else { flags[args[i].slice(2)] = next; i++; }
    }
    else pos.push(args[i]);
  }
  return { flags, pos };
}

async function loadBoard() {
  const d = await api.getProjectWithData(PROJECT);
  const cols = (d.columns ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  const keyOf = id => Object.keys(COLUMN_KEYS).find(k => cols.find(c => c.id === id)?.name.includes(COLUMN_KEYS[k]));
  return { cols, tasks: d.tasks ?? [], keyOf };
}

async function columnId(key) {
  const { cols } = await loadBoard();
  // 固定列用键名；临时列（如「✈️ 某某行」）直接用列名里的关键词
  const word = COLUMN_KEYS[key] ?? key;
  const c = cols.find(c => c.name.includes(word));
  if (!c) throw new Error(`看板上找不到包含「${word}」的列`);
  return c.id;
}

async function findTask(idOrText) {
  // 24 位 ID 直接取，已完成/放弃的任务也能找到
  if (/^[0-9a-f]{24}$/.test(idOrText)) return api.getTask(PROJECT, idOrText);
  const { tasks } = await loadBoard();
  const hit = tasks.filter(t => t.id === idOrText || t.title.includes(idOrText));
  if (hit.length !== 1) throw new Error(hit.length ? `匹配到 ${hit.length} 条，请用任务 ID：\n${hit.map(t => `  ${t.id} ${t.title}`).join('\n')}` : `找不到任务：${idOrText}`);
  return hit[0];
}

// 全天任务：取本地时区当天零点，自动处理夏令时
function allDay(ymd) {
  const noonUtc = new Date(`${ymd}T12:00:00Z`);
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(noonUtc).find(p => p.type === 'timeZoneName').value; // 如 GMT-7
  const h = -parseInt(tzName.replace('GMT', ''), 10);
  const iso = `${ymd}T${String(h).padStart(2, '0')}:00:00.000+0000`;
  return { startDate: iso, dueDate: iso, isAllDay: true, timeZone: TZ };
}

// 带时间的截止：'2026-11-15 14:30' 按本地时区；只给日期就是全天任务
function dueAt(v) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v.trim());
  if (!m) throw new Error(`日期格式不对：${v}，用 2026-11-15 或 2026-11-15 14:30`);
  const [, ymd, hh, mm] = m;
  if (hh === undefined) return allDay(ymd);
  const guess = new Date(`${ymd}T${hh.padStart(2, '0')}:${mm}:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(guess).find(p => p.type === 'timeZoneName').value; // 如 GMT-8
  const utc = new Date(guess.getTime() - parseInt(off.replace('GMT', ''), 10) * 3600e3);
  const iso = utc.toISOString().replace('Z', '+0000');
  return { startDate: iso, dueDate: iso, isAllDay: false, timeZone: TZ };
}

const out = o => console.log(JSON.stringify(o, null, 2));

switch (cmd) {
  case 'list': {
    // 按列分组列出未完成任务（已完成/放弃的任务 API 不在这里返回）
    const { cols, tasks, keyOf } = await loadBoard();
    for (const c of cols) {
      const ts = tasks.filter(t => t.columnId === c.id);
      console.log(`\n${c.name}（${ts.length}）`);
      for (const t of ts) console.log(`  ${t.id}  ${t.title}${t.tags?.length ? '  #' + t.tags.join(' #') : ''}${t.content ? '\n      ' + t.content.split('\n').join('\n      ') : ''}`);
    }
    // 只要任务的列 ID 是看板上现存的任何一列（含临时列）就不算对不上
    const orphan = tasks.filter(t => !cols.some(c => c.id === t.columnId));
    if (orphan.length) { console.log('\n⚠️ 列 ID 对不上的任务（App 里显示在第一列）'); orphan.forEach(t => console.log(`  ${t.id}  ${t.title}`)); }
    break;
  }
  case 'add': {
    // add <标题> [--content 内容] [--tags 摄影,健康] [--col inbox]
    const { flags, pos } = parseFlags(rest);
    const title = pos.join(' ');
    if (!title) throw new Error('缺标题');
    const t = await api.createTask({
      projectId: PROJECT, title, content: flags.content,
      tags: flags.tags ? flags.tags.split(',') : undefined,
      ...(flags.due ? dueAt(flags.due) : {}),
      // --remind：到截止时间时提醒（需配合 --due）
      ...('remind' in flags ? { reminders: ['TRIGGER:PT0S'] } : {}),
      // --repeat daily|weekly|monthly，或直接给 RRULE
      ...(flags.repeat ? { repeatFlag: ({ daily: 'RRULE:FREQ=DAILY;INTERVAL=1', weekly: 'RRULE:FREQ=WEEKLY;INTERVAL=1', monthly: 'RRULE:FREQ=MONTHLY;INTERVAL=1' })[flags.repeat] ?? flags.repeat } : {}),
    });
    const col = await columnId(flags.col ?? 'inbox');
    const u = await api.updateTask(t.id, { id: t.id, projectId: PROJECT, columnId: col });
    out({ id: u.id, title: u.title, columnId: u.columnId, tags: u.tags });
    break;
  }
  case 'move': {
    // move <任务ID或标题片段> <inbox|doing|todo|waiting|later|closed>
    const [q, key] = rest;
    const t = await findTask(q);
    const u = await api.updateTask(t.id, { id: t.id, projectId: PROJECT, columnId: await columnId(key) });
    out({ id: u.id, title: u.title, columnId: u.columnId });
    break;
  }
  case 'edit': {
    // edit <任务ID或标题片段> [--title ..] [--content ..] [--tags a,b]
    const { flags, pos } = parseFlags(rest);
    const t = await findTask(pos.join(' '));
    // --due 2026-11-15 全天；--due '2026-11-15 14:30' 带时间；--due none 清除日期
    const due = flags.due === undefined ? {} : flags.due === 'none' ? { startDate: null, dueDate: null, isAllDay: false } : dueAt(flags.due);
    const u = await api.updateTask(t.id, {
      id: t.id, projectId: PROJECT, title: flags.title, content: flags.content,
      tags: flags.tags ? flags.tags.split(',') : undefined, ...due,
    });
    out({ id: u.id, title: u.title, content: u.content, tags: u.tags, dueDate: u.dueDate ?? null });
    break;
  }
  case 'done':
  case 'abandon': {
    // done|abandon <任务ID或标题片段> [--note 说明]：先移到「已完成/放弃」列，写评论，再标完成或放弃
    const { flags, pos } = parseFlags(rest);
    const t = await findTask(pos.join(' '));
    await api.updateTask(t.id, { id: t.id, projectId: PROJECT, columnId: await columnId('closed') });
    if (flags.note) await api.addTaskComment(PROJECT, t.id, { title: flags.note });
    if (cmd === 'done') await api.completeTask(PROJECT, t.id);
    else await api.updateTask(t.id, { id: t.id, projectId: PROJECT, status: -1 });
    const after = await api.getTask(PROJECT, t.id);
    out({ id: after.id, title: after.title, status: after.status, columnId: after.columnId });
    break;
  }
  case 'delete': {
    const t = await findTask(rest.join(' '));
    await api.deleteTask(PROJECT, t.id);
    out({ deleted: t.id, title: t.title });
    break;
  }
  default:
    console.log(`用法：
  aitasks list
  aitasks add <标题> [--content 内容] [--tags 摄影,健康] [--col inbox|doing|todo|waiting|later] [--due '2026-11-15 14:30'] [--remind] [--repeat daily|weekly|monthly]
  aitasks move <任务ID或标题片段> <inbox|doing|todo|waiting|later|closed>
  aitasks edit <任务ID或标题片段> [--title 新标题] [--content 内容] [--tags a,b] [--due '2026-11-15 14:30'|none]
  aitasks done <任务ID或标题片段> [--note 说明]
  aitasks abandon <任务ID或标题片段> [--note 放弃原因]
  aitasks delete <任务ID或标题片段>`);
}
