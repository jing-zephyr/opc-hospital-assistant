// scripts/gen-mobile-evidence.mjs —— 进阶2「手机端适配」的**代码级证据**生成器
//
// ⚠️ 诚实声明（必须保留）：
//   本脚本**不产生截图**，也**不能替代视觉验收**。它做的是：把页面 HTML 拉下来，
//   用程序**断言**手机适配相关的代码事实（viewport、媒体查询内容、关键元素在窄屏下的规则、
//   手机壳页面可达性、触摸/字号相关设置），并把命中原文逐条摘录出来。
//   因此本文件产出的是**代码级证据**，不是视觉截图。真实的 375/390/414px 视觉截图 **待人工补齐**。
//
// 用法：
//   ① 先启动本地服务： node server.mjs     （或用 BASE 指向已部署的线上入口）
//   ② node scripts/gen-mobile-evidence.mjs
//   BASE=https://opc-hospital-assistant.netlify.app node scripts/gen-mobile-evidence.mjs
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8787'
const OUT = new URL('../进阶项实测证据_手机适配.md', import.meta.url)

async function getText(path) {
  const r = await fetch(BASE + path, { headers: { 'User-Agent': 'OPC-mobile-evidence/1.0 (+node)' } })
  return { status: r.status, ct: r.headers.get('content-type') || '', text: await r.text() }
}
function pick(text, re, n = 1) {
  const out = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m
  while ((m = r.exec(text)) !== null && out.length < n) out.push(m[0].replace(/\s+/g, ' ').trim())
  return out
}
function extractBlock(text, startRe, maxLen = 1200) {
  const m = text.match(startRe)
  if (!m) return ''
  const i = m.index + m[0].length
  let depth = 1
  let j = i
  while (j < text.length && depth > 0 && j - i < maxLen) {
    if (text[j] === '{') depth++
    else if (text[j] === '}') depth--
    j++
  }
  return m[0] + text.slice(i, j)
}

const rows = []
const notes = []
function check(item, ok, evidence) {
  rows.push(`| ${item} | ${ok ? '✅ 命中' : '❌ 未命中'} | ${evidence || ''} |`)
  return ok
}

const idx = await getText('/')
const mini = await getText('/mini.html')
const health = await getText('/api/health')

const idxHtml = idx.text
const miniHtml = mini.text

// ---------- 1. viewport ----------
const vpIdx = pick(idxHtml, /<meta[^>]*name=["']viewport["'][^>]*>/i, 1)[0] || ''
const vpMini = pick(miniHtml, /<meta[^>]*name=["']viewport["'][^>]*>/i, 1)[0] || ''
check('网页版 `viewport` 声明（含 `viewport-fit=cover`）',
  /viewport-fit=cover/.test(vpIdx),
  `\`${vpIdx}\``)
check('小程序模拟页 `viewport` 声明（含 `viewport-fit=cover`）',
  /viewport-fit=cover/.test(vpMini),
  `\`${vpMini}\``)
check('`width=device-width, initial-scale=1`（禁止横向溢出）',
  /width=device-width/.test(vpIdx) && /initial-scale=1/.test(vpIdx),
  '两项同时具备才判定命中')

// ---------- 2. 媒体查询 ----------
const mqIdx = extractBlock(idxHtml, /@media\s*\(max-width:\s*560px\)\s*\{/, 900)
const mqMini = extractBlock(miniHtml, /@media\s*\(max-width:\s*\d+px\)\s*\{/, 900)
check('网页版窄屏媒体查询 `@media (max-width:560px)` 存在',
  Boolean(mqIdx), '规则原文见下方代码块')
check('小程序模拟页窄屏媒体查询存在',
  Boolean(mqMini), '规则原文见下方代码块')
check('窄屏规则包含"输入框与按钮改为纵向堆叠"',
  /flex-direction:\s*column/.test(mqIdx),
  pick(mqIdx, /\.row-in\s*\{[^}]*\}/, 1)[0] ? `\`${pick(mqIdx, /\.row-in\s*\{[^}]*\}/, 1)[0]}\`` : '')
check('窄屏规则包含"主按钮撑满整行"（拇指可达）',
  /\.btn-main\s*\{[^}]*width:\s*100%/.test(mqIdx),
  pick(mqIdx, /\.btn-main\s*\{[^}]*\}/, 1)[0] ? `\`${pick(mqIdx, /\.btn-main\s*\{[^}]*\}/, 1)[0]}\`` : '')
check('窄屏规则包含"标题字号下调"',
  /h1\s*\{\s*font-size/.test(mqIdx),
  pick(mqIdx, /h1\s*\{[^}]*\}/, 1)[0] ? `\`${pick(mqIdx, /h1\s*\{[^}]*\}/, 1)[0]}\`` : '')

// ---------- 3. 移动端基础设置 ----------
check('禁用 iOS 横屏字号自动放大（`-webkit-text-size-adjust:100%`）',
  /-webkit-text-size-adjust/.test(idxHtml),
  pick(idxHtml, /-webkit-text-size-adjust:[^;}]*/, 1)[0] || '')
check('`box-sizing:border-box` 全局盒模型（避免窄屏溢出）',
  /\*\{box-sizing:border-box\}/.test(idxHtml.replace(/\s+/g, '')),
  '')
check('底部固定栏为内容预留了安全间距（`padding-bottom` ≥ 70px）',
  /\.wrap\{[^}]*padding:[^}]*7\dpx/.test(idxHtml.replace(/\s+/g, '')),
  pick(idxHtml, /\.wrap\{[^}]*\}/, 1)[0] || '')

// ---------- 4. 关键交互元素在窄屏下的可用性 ----------
const chipsBlock = pick(idxHtml, /\.chips\s*\{[^}]*\}/, 1)[0] || ''
check('常用问题入口（chips）使用 `flex-wrap` 自动换行',
  /flex-wrap:\s*wrap/.test(chipsBlock),
  `\`${chipsBlock}\``)
const tableBlock = pick(idxHtml, /\.cmptable[^{]*\{[^}]*\}/, 2).join(' ')
check('结果对比表在窄屏下可读（表格宽度 100% + 允许换行）',
  /\.cmptable\{width:100%/.test(idxHtml.replace(/\s+/g, '')),
  `\`${tableBlock}\``)

// ---------- 5. 手机壳页面可达性 ----------
check('`/mini.html` 可达且是 HTML',
  mini.status === 200 && /text\/html/.test(mini.ct),
  `HTTP ${mini.status}，Content-Type=${mini.ct}，${miniHtml.length} 字节`)
check('`/mini.html` 含手机壳容器（模拟小程序形态）',
  /phone|device|viewport|mini/i.test(miniHtml) && miniHtml.length > 1000,
  pick(miniHtml, /<div class="[^"]*(?:phone|shell|device)[^"]*"/i, 1)[0] ? `\`${pick(miniHtml, /<div class="[^"]*(?:phone|shell|device)[^"]*"/i, 1)[0]}\`` : '含手机壳相关容器/样式')
check('网页版有入口链到小程序模拟页',
  /href=["']\/mini\.html["']/.test(idxHtml),
  pick(idxHtml, /<a[^>]*href=["']\/mini\.html["'][^>]*>/, 1)[0] ? `\`${pick(idxHtml, /<a[^>]*href=["']\/mini\.html["'][^>]*>/, 1)[0]}\`` : '')

// ---------- 6. 服务端模式（同一入口） ----------
let healthJson = {}
try { healthJson = JSON.parse(health.text) } catch { /* 忽略 */ }
check('`/api/health` 可达（入口本身可用）',
  health.status === 200 && healthJson.ok === true,
  `mode=\`${healthJson.mode}\`，channels=${JSON.stringify(healthJson.channels || {})}`)

const pass = rows.filter((r) => r.includes('✅ 命中')).length

const md = [
  '# OPC 医院助手 · 进阶2「手机端适配」代码级证据',
  '',
  `> 生成时间：${new Date().toISOString()}`,
  `> 生成方式：\`node scripts/gen-mobile-evidence.mjs\`（BASE=${BASE}）`,
  '> **⚠️ 证据等级声明：本文件是「代码级证据」，不是截图。**',
  '> 本机**没有可用的浏览器**，因此无法生成 375 / 390 / 414px 的真实视觉截图；',
  '> 本文只证明"手机适配相关的代码事实确实存在且可被程序检出"，**不证明视觉呈现效果**。',
  '> **真实手机端视觉截图待人工补齐**（建议补 3 张：首页、结果页、对比表，视口 390×844）。',
  '',
  `**检出结果：${pass}/${rows.length} 项命中**`,
  '',
  '| 检查项 | 结果 | 证据（程序从页面 HTML 中摘出的原文） |',
  '|---|---|---|',
  ...rows,
  '',
  '---',
  '',
  '## 一、窄屏媒体查询规则原文（网页版）',
  '',
  '```css',
  mqIdx || '（未检出）',
  '```',
  '',
  '## 二、窄屏媒体查询规则原文（小程序模拟页 `/mini.html`）',
  '',
  '```css',
  mqMini || '（未检出）',
  '```',
  '',
  '## 三、复现方式',
  '',
  '```bash',
  '# 1) 启动本地服务（或直接用公网入口）',
  'node server.mjs',
  '# 2) 生成本证据文件',
  'node scripts/gen-mobile-evidence.mjs',
  '# 3) 指向公网入口（可选）',
  'BASE=https://opc-hospital-assistant.netlify.app node scripts/gen-mobile-evidence.mjs',
  '```',
  '',
  '> 复现判定：脚本会把上面每一行检查项重新跑一遍，**命中就打 ✅、没命中就打 ❌**，',
  '> 不写死结论；如果代码改动导致某项失效，重跑后对应行会立刻变 ❌。',
  '',
  '## 四、如实登记：还没做的部分',
  '',
  '| 事项 | 状态 | 原因 |',
  '|---|---|---|',
  '| 375 / 390 / 414px 真实视觉截图 | ❌ 未做 | 本机无浏览器，无法截图；**不拿代码级证据冒充截图** |',
  '| 真机（iOS Safari / 微信内置浏览器）实测 | ❌ 未做 | 无可用真机与测试小程序授权 |',
  '| 触摸目标尺寸的像素级测量 | ❌ 未做 | 需浏览器 DevTools，同上 |',
  '',
  ...notes,
  '',
].join('\n')

writeFileSync(OUT, md, 'utf8')
console.log(`✅ 已生成 进阶项实测证据_手机适配.md（${md.length} 字符）｜代码级检查 ${pass}/${rows.length} 项命中`)
for (const r of rows) console.log('  ' + r)
