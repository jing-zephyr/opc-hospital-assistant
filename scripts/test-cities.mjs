// scripts/test-cities.mjs —— 「已验证城市清单」的**断言式**实测
//   甲方口径（2026-09-24 拍板）：**主打北京，辐射已有的 8 个城市，不再扩城市**。
//
// 用法：
//   ① 先起服务： node server.mjs
//   ② BASE=http://127.0.0.1:8891 node scripts/test-cities.mjs
//      BASE=https://opc-hospital-assistant.netlify.app node scripts/test-cities.mjs   # 打公网入口
//
// 覆盖两组（判据全部**实时计算**，未通过就标 ❌ 并以退出码 1 结束）：
//   A. **支持范围**（北京 + 8 个辐射城市）→ 必须真正检索到结果（ok/partial），**不许反问城市**；
//   B. **范围外地名**（保定 / 唐山 / 无锡 …）→ 必须 `out_of_scope_region`，且回答里
//      **必须出现"北京"和那份完整可辐射城市清单** —— 即"如实说明范围"，而不是干巴巴的"请告诉我要查的城市"。
import { writeFileSync } from 'node:fs'
import { CITIES as SUPPORTED, PRIMARY_CITY, RADIATING_CITIES } from '../lib/cities.js'

const BASE = process.env.BASE || 'http://127.0.0.1:8787'

const supported = [...SUPPORTED]                                   // A 组（单一事实来源：lib/cities.js）
const outside = ['保定', '唐山', '廊坊', '无锡', '佛山', '太原', '河北省']   // B 组：范围外地名

async function chat(msg, sid) {
  const r = await fetch(BASE + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ message: msg, sessionId: sid }),
  })
  return { http: r.status, ...(await r.json()) }
}
const clean = (c) => String(c).replace(/市$/, '')
const rows = []
const detail = []
let pass = 0
let total = 0

console.log(`BASE = ${BASE}｜支持范围 ${supported.length} 城 + 范围外 ${outside.length} 例\n`)
console.log('城市/地名 | 组 | status | 来源数 | 命中医院数 | 是否含民营 | 外地来源数 | 判定')
console.log('---|---|---|---|---|---|---|---')

// ---------- A 组：支持范围必须真检索到 ----------
for (const city of supported) {
  total++
  const q = `${city}有哪些医院设有卒中中心`
  const j = await chat(q, 'citytest-' + clean(city) + '-' + Math.random().toString(36).slice(2, 6))
  const a = String(j.answer || '')
  const srcs = j.sources || []
  const hos = j.hospitals || []
  const pri = hos.filter((h) => h.category === '民营').length
  const outCount = Number(j.outOfScopeCount || 0)
  const checks = [
    ['status=ok/partial（不反问城市）', j.status === 'ok' || j.status === 'partial'],
    ['检索词含城市名', String(j.query || '').includes(clean(city))],
    ['确实发起过检索（有来源）', srcs.length > 0],
    ['命中 ≥1 家医院', hos.length >= 1],
    ['有 A/B 级来源时未降级为 partial', !(srcs.some((s) => s.tier === 'A' || s.tier === 'B') && j.status === 'partial')],
  ]
  const ok = checks.every((c) => c[1])
  if (ok) pass++
  const priText = hos.length === 0 ? '—' : (pri > 0 ? `有(${pri})` : '无')
  console.log(`${city} | 支持 | ${j.status} | ${srcs.length} | ${hos.length} | ${priText} | ${outCount} | ${ok ? '✅' : '❌'}`)
  rows.push(`| ${city} | 支持范围 | \`${j.status}\` | ${srcs.length} | ${hos.length} | ${priText} | ${outCount} | ${ok ? '✅' : '❌'} |`)
  detail.push([
    `### ${city}（支持范围）`, '',
    `- **输入**：\`${q}\``,
    `- **实际**：\`status=${j.status}\` ｜ 检索词 \`${j.query}\` ｜ 来源 ${srcs.length} 条 ｜ 命中医院 ${hos.length} 家 ｜ 类别覆盖 ${j.categoryCoverage ? JSON.stringify(j.categoryCoverage) : '—'} ｜ 外地来源 ${outCount} 条`,
    `- **命中医院**：${hos.length ? hos.map((h) => `${h.name}${h.category ? `（${h.category}）` : ''}`).join('、') : '（未查到）'}`,
    `- **民营追问建议**：${/想看民营医院/.test(a) ? '✅ 已给出可复制的追问句式' : (pri > 0 ? '—（本次已含民营）' : '❌ 未给出')}`,
    `- **判定**：${ok ? '✅ 通过' : '❌ **未通过**'}　（${checks.map((c) => `${c[1] ? '✅' : '❌'}${c[0]}`).join(' ｜ ')}）`,
    '',
  ].join('\n'))
}

// ---------- B 组：范围外地名 / 省级 → 必须"识别出来 + 如实说明范围" ----------
for (const region of outside) {
  total++
  const q = `${region}有哪些医院设有卒中中心`
  const j = await chat(q, 'citytest-out-' + Math.random().toString(36).slice(2, 6))
  const a = String(j.answer || '')
  const isProvince = /省$/.test(region)                       // "河北省"这类**省级**输入走"按省检索 + 给候选城市"
  const prov = isProvince ? region.replace(/省$/, '') : ''
  const checks = isProvince
    ? [
        ['status=ok（按省检索并如实给出候选城市）', j.status === 'ok'],
        [`回答里点出用户说的「${prov}」`, a.includes(prov)],
        ['回答里出现主要演示范围「北京」', a.includes('北京')],
        ['回答里给出该省的候选城市（不替你猜城市）', /范围提示/.test(a) && a.includes('省级')],
        ['**不是**原来那句"请告诉我要查的城市"', !a.includes('请告诉我要查的**城市或地区**')],
      ]
    : [
        ['status=out_of_scope_region（识别到地名并如实说明范围）', j.status === 'out_of_scope_region'],
        [`回答里点出用户说的地名「${region}」`, a.includes(region)],
        ['回答里出现主要演示范围「北京」', a.includes('北京')],
        ['回答里给出**完整**可辐射城市清单', RADIATING_CITIES.every((c) => a.includes(c))],
        ['**不是**原来那句"请告诉我要查的城市"', !a.includes('请告诉我要查的**城市或地区**')],
      ]
  const ok = checks.every((c) => c[1])
  if (ok) pass++
  console.log(`${region} | ${isProvince ? '省级' : '范围外'} | ${j.status} | ${(j.sources || []).length} | ${(j.hospitals || []).length} | — | ${Number(j.outOfScopeCount || 0)} | ${ok ? '✅' : '❌'}`)
  rows.push(`| ${region} | ${isProvince ? '省级' : '范围外'} | \`${j.status}\` | ${(j.sources || []).length} | ${(j.hospitals || []).length} | — | ${Number(j.outOfScopeCount || 0)} | ${ok ? '✅' : '❌'} |`)
  detail.push([
    `### ${region}（${isProvince ? '省级输入' : '范围外地名'}）`, '',
    `- **输入**：\`${q}\``,
    `- **实际**：\`status=${j.status}\` ｜ 检索词 \`${j.query}\` ｜ 来源 ${(j.sources || []).length} 条`,
    `- **判定**：${ok ? '✅ 通过' : '❌ **未通过**'}　（${checks.map((c) => `${c[1] ? '✅' : '❌'}${c[0]}`).join(' ｜ ')}）`,
    '',
    '<details><summary>展开回答原文（程序真实输出）</summary>', '',
    '```text', a.trim(), '```', '',
    '</details>', '',
  ].join('\n'))
}

const md = [
  '# 已验证城市清单 · 城市识别与检索覆盖实测',
  '',
  `> 生成时间：${new Date().toISOString()}`,
  `> 方式：\`BASE=${BASE} node scripts/test-cities.mjs\`（**断言式，判据实时计算**）`,
  '',
  `**演示范围口径**：主打 **${PRIMARY_CITY}**，可辐射 **${RADIATING_CITIES.join(' / ')}** 共 ${RADIATING_CITIES.length} 个城市；**不再扩城市**。`,
  '',
  `**通过 ${pass}/${total} 项**`,
  '',
  '| 城市/地名 | 组 | status | 来源数 | 命中医院数 | 是否含民营 | 外地来源数 | 判定 |',
  '|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  '**A 组判据（支持范围，五条全成立才通过）**：',
  '1. `status` 必须是 `ok` 或 `partial` —— **若是 `need_clarify`，就等于"城市没被识别出来"**；',
  '2. 检索关键词里**必须含该城市名**；',
  '3. **确实发起过检索**（有返回来源）；',
  '4. **命中 ≥1 家医院**；',
  '5. 结果里**有 A/B 级官方来源时，status 不得是 `partial`**。',
  '',
  '**B 组判据（范围外地名，五条全成立才通过）**：',
  '1. `status=out_of_scope_region` —— **识别到了地名，但如实说明"暂未纳入演示范围"**；',
  '2. 回答里**点出用户说的那个地名**（证明"听懂了"）；',
  '3. 回答里出现主要演示范围 **北京**；',
  '4. 回答里给出**完整可辐射城市清单**；',
  '5. **不是**原来那句干巴巴的"请告诉我要查的城市"。',
  '',
  '> ⚠️ 说明：`是否含民营` 为 `无` **不是失败** —— 本系统**不为了满足"覆盖民营"而把没有来源的医院塞进结果**；',
  '> 此时回答的「④使用提示」会**主动给出可复制的追问句式**（见各组明细）。',
  '',
  '## 逐项明细',
  '',
  ...detail,
].join('\n')

writeFileSync(new URL('../已验证城市清单.md', import.meta.url), md, 'utf8')
console.log(`\n===== 通过 ${pass}/${total} 项 =====`)
console.log('✅ 已生成 已验证城市清单.md')
process.exitCode = pass === total ? 0 : 1
