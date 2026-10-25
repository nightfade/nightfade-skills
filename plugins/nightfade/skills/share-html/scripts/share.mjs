#!/usr/bin/env node
// 加密 HTML 并发布到 Cloudflare Pages。用法见同目录上一级的 SKILL.md。
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { webcrypto as crypto, randomBytes, randomInt } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(homedir(), ".local/share/share-html");
const SITE = join(DATA, "site");
const REGISTRY = join(DATA, "registry.json");
const CONFIG = join(homedir(), ".config/share-html/config.json");
const KEYCHAIN = "share-html";
const ITER = 600000;
const WRANGLER = ["-y", "wrangler@4"];

const die = msg => { console.error(`错误：${msg}`); process.exit(1); };
const readJson = (p, dflt) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : dflt);
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const wrangler = (args, opts = {}) => execFileSync("npx", [...WRANGLER, ...args], { encoding: "utf8", ...opts });

function config() {
  const c = readJson(CONFIG, null);
  if (!c?.project) die(`还没初始化，先运行 setup <项目名>`);
  return c;
}

// 去掉易混字符（0 O 1 l I），4 组 4 位约 80 bit
function genPassword() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join("")).join("-");
}
const genSlug = () => Array.from(randomBytes(10), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");

async function encrypt(html, password) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, gzipSync(Buffer.from(html, "utf8")));
  const b64 = x => Buffer.from(x).toString("base64");
  return { iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

// 解密后整页替换，相对路径的图片、样式、脚本都会失效
function localRefs(html) {
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)].map(m => m[1])
    .filter(u => !/^(https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(u));
  return [...new Set(refs)];
}

const keychainSet = (slug, pw) => execFileSync("security", ["add-generic-password", "-U", "-s", KEYCHAIN, "-a", slug, "-w", pw]);
const keychainGet = slug => execFileSync("security", ["find-generic-password", "-s", KEYCHAIN, "-a", slug, "-w"], { encoding: "utf8" }).trim();
const keychainDel = slug => { try { execFileSync("security", ["delete-generic-password", "-s", KEYCHAIN, "-a", slug], { stdio: "ignore" }); } catch {} };

function writeSiteScaffold() {
  mkdirSync(SITE, { recursive: true });
  const notFound = "<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>404</title>404\n";
  writeFileSync(join(SITE, "index.html"), notFound);
  // 没有 404.html 时 Pages 会把未知路径回退到首页并返回 200
  writeFileSync(join(SITE, "404.html"), notFound);
  writeFileSync(join(SITE, "robots.txt"), "User-agent: *\nDisallow: /\n");
  writeFileSync(join(SITE, "_headers"), "/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n");
}

// Pages 会给每次部署留一个独立网址，删文档后旧部署里还有密文，所以每次部署完清掉旧的
function pruneOldDeployments(project) {
  let list;
  try { list = JSON.parse(wrangler(["pages", "deployment", "list", "--project-name", project, "--json"], { stdio: ["ignore", "pipe", "pipe"] })); }
  catch (e) { console.warn(`警告：读取部署列表失败，旧部署没有清理：${e.message.split("\n")[0]}`); return; }
  const id = d => d.Id ?? d.id;
  const old = list.slice(1); // 列表按时间倒序，第一条是刚完成的这次
  for (const d of old) {
    try { wrangler(["pages", "deployment", "delete", id(d), "--project-name", project, "--force"], { stdio: "ignore" }); }
    catch { console.warn(`警告：删除旧部署 ${id(d)} 失败`); }
  }
  if (old.length) console.log(`已清理旧部署 ${old.length} 个`);
}

function deploy() {
  const { project } = config();
  writeSiteScaffold();
  wrangler(["pages", "deploy", SITE, "--project-name", project, "--branch", "main", "--commit-dirty=true"], { stdio: "inherit" });
  pruneOldDeployments(project);
}

const url = (project, slug) => `https://${project}.pages.dev/${slug}/`;

const commands = {
  setup([project]) {
    if (!project || !/^[a-z0-9][a-z0-9-]{0,56}$/.test(project)) die("项目名只能用小写字母、数字和连字符");
    // 新版 wrangler 默认把 Pages 转给 Workers，--force 只在创建时需要，项目建好后后续命令直接走 Pages
    try { wrangler(["pages", "project", "create", project, "--production-branch", "main", "--force"], { stdio: "inherit", cwd: SITE }); }
    catch { console.warn("创建项目失败；如果项目已经存在可以忽略，否则先确认 wrangler login 已完成"); }
    writeJson(CONFIG, { project });
    writeSiteScaffold();
    console.log(`已配置项目 ${project}，域名 https://${project}.pages.dev`);
  },

  async publish(args) {
    const { project } = config();
    const opt = { title: null, slug: null, password: null, deploy: true };
    const files = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--title") opt.title = args[++i];
      else if (args[i] === "--slug") opt.slug = args[++i];
      else if (args[i] === "--password") opt.password = args[++i];
      else if (args[i] === "--no-deploy") opt.deploy = false;
      else files.push(args[i]);
    }
    if (files.length !== 1) die("publish 需要且只能给一个 HTML 文件");
    const src = resolve(files[0]);
    if (!existsSync(src)) die(`找不到文件 ${src}`);
    const html = readFileSync(src, "utf8");

    const reg = readJson(REGISTRY, []);
    const prev = opt.slug ? reg.find(r => r.slug === opt.slug) : null;
    if (opt.slug && !prev) die(`没有 slug 为 ${opt.slug} 的已发布文档`);
    const slug = prev?.slug ?? genSlug();
    const password = opt.password ?? (prev ? keychainGet(slug) : genPassword());
    const title = opt.title ?? prev?.title ?? (html.match(/<title>([^<]*)<\/title>/i)?.[1].trim() || basename(src));

    const refs = localRefs(html);
    if (refs.length) console.warn(`警告：文档引用了本地资源，解密后会加载失败，需要先内联：\n  ${refs.slice(0, 10).join("\n  ")}`);

    const payload = await encrypt(html, password);
    const page = readFileSync(join(HERE, "template.html"), "utf8").replace("/*PAYLOAD*/null", JSON.stringify(payload));
    mkdirSync(join(SITE, slug), { recursive: true });
    writeFileSync(join(SITE, slug, "index.html"), page);
    keychainSet(slug, password);

    const now = new Date().toISOString().slice(0, 10);
    const entry = { slug, title, source: src, created: prev?.created ?? now, updated: now };
    writeJson(REGISTRY, prev ? reg.map(r => (r.slug === slug ? entry : r)) : [...reg, entry]);

    if (opt.deploy) deploy();
    console.log(`\n标题：${title}\n链接：${url(project, slug)}\n密码：${password}\n免输密码链接：${url(project, slug)}#${password}`);
  },

  list() {
    const { project } = config();
    const reg = readJson(REGISTRY, []);
    if (!reg.length) return console.log("还没有发布过文档");
    for (const r of reg) console.log(`${r.slug}  ${r.updated}  ${r.title}\n  ${url(project, r.slug)}\n  源文件：${r.source}`);
  },

  password([slug]) {
    const { project } = config();
    if (!slug) die("需要 slug");
    const pw = keychainGet(slug);
    console.log(`链接：${url(project, slug)}\n密码：${pw}\n免输密码链接：${url(project, slug)}#${pw}`);
  },

  remove([slug]) {
    const reg = readJson(REGISTRY, []);
    if (!reg.some(r => r.slug === slug)) die(`没有 slug 为 ${slug} 的已发布文档`);
    // 直接删掉的路径，Pages 边缘缓存会继续返回旧密文；用占位页覆盖才会立刻失效
    rmSync(join(SITE, slug), { recursive: true, force: true });
    mkdirSync(join(SITE, slug));
    writeFileSync(join(SITE, slug, "index.html"), "<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>已下线</title>这份文档已下线\n");
    writeJson(REGISTRY, reg.filter(r => r.slug !== slug));
    keychainDel(slug);
    deploy();
    console.log(`已下线 ${slug}`);
  },

  deploy,
};

const [cmd, ...rest] = process.argv.slice(2);
if (!commands[cmd]) die(`未知命令 ${cmd ?? ""}；可用：${Object.keys(commands).join(" ")}`);
await commands[cmd](rest);
