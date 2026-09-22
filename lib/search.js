// lib/search.js —— 双通道检索 + 来源权威分级（OPC 医院助手核心层）
// 密钥来源：C:\Users\T\.secrets\opc-search.env(.txt)，库外，永不提交
import { readFileSync } from 'node:fs'
import { officialOf } from './hospitals.js'

const ENV_CANDIDATES = [
  'C:\\Users\\T\\.secrets\\opc-search.env',
  'C:\\Users\\T\\.secrets\\opc-search.env.txt',
]

let cache = null
export function loadSecrets() {
  if (cache) return cache
  const out = {}
  // ① 云部署（Netlify/Vercel）走环境变量 —— 生产环境唯一来源
  if (process.env.BOCHA_API_KEY) out.BOCHA_API_KEY = process.env.BOCHA_API_KEY
  if (process.env.TAVILY_API_KEY) out.TAVILY_API_KEY = process.env.TAVILY_API_KEY
  if (process.env.DEEPSEEK_API_KEY) out.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
  // ② 本地演示：库外文件兜底（不在任何仓库内）
  if (!out.BOCHA_API_KEY || !out.TAVILY_API_KEY) {
    for (const path of ENV_CANDIDATES) {
      try {
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
          const t = line.trim()
          if (!t || t.startsWith('#')) continue
          const i = t.indexOf('=')
          if (i < 0) continue
          const k = t.slice(0, i).trim()
          if (!out[k]) out[k] = t.slice(i + 1).trim()
        }
      } catch { /* 试下一个 */ }
    }
  }
  cache = out
  return cache
}

// ---------- 来源权威分级（决定"已核实 / 待核实"的关键） ----------
// A 级：政府/卫健主管部门/医学教育机构 —— 可直接支撑"已核实"
// B 级：官方媒体 / 医院自建官网 —— 可支撑"已核实"，但涉及"当前状态"须谨慎
// C 级：聚合站 / 文库 / 百科 / 导医平台 —— 只能作"线索"，标"待核实"
// D 级：来源不明
const TIER_A = [/(^|\.)gov\.cn$/i, /(^|\.)nhc\.gov\.cn$/i, /(^|\.)edu\.cn$/i, /(^|\.)ac\.cn$/i]
const TIER_B = [
  /(^|\.)people\.com\.cn$/i, /(^|\.)xinhuanet\.com$/i, /(^|\.)news\.cn$/i,
  /(^|\.)bjd\.com\.cn$/i, /(^|\.)bjnews\.com\.cn$/i, /(^|\.)thepaper\.cn$/i,
  /(^|\.)cnr\.cn$/i, /(^|\.)cctv\.com$/i, /(^|\.)chinanews\.com\.cn$/i,
]
const TIER_C = [
  /baike\.baidu\.com/i, /doc88\.com/i, /jinchutou\.com/i, /docin\.com/i, /wenku\./i,
  /39\.net/i, /99\.com\.cn/i, /meditool/i, /dxy\.cn/i, /haodf\.com/i, /chunyuyisheng/i,
  /sohu\.com/i, /163\.com/i, /toutiao\.com/i, /zhihu\.com/i, /csdn\.net/i,
]

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}

export function tierOf(url) {
  const h = hostOf(url)
  if (!h) return 'D'
  // 0. 先查核实过的白名单（医院官网 / 主管部门 / 院校）
  const off = officialOf(h)
  if (off) return off.kind === 'authority' ? 'A' : 'B'
  if (TIER_C.some((r) => r.test(h))) return 'C'
  if (TIER_A.some((r) => r.test(h))) return 'A'
  if (TIER_B.some((r) => r.test(h))) return 'B'
  return 'C' // 未知域名默认按 C（保守：只能当线索）
}

export function tierLabel(t) {
  return t === 'A' ? '政府/主管部门/院校'
    : t === 'B' ? '官方媒体/机构'
    : t === 'C' ? '聚合站/文库/导医平台（仅线索）'
    : '来源不明'
}

// 能否直接支撑「已核实」：仅 A 级，或 B 级中的明确官方页面
export function canVerify(url) {
  const t = tierOf(url)
  return t === 'A'
}

// ---------- 通道 1：博查（带日期） ----------
export async function searchBocha(query, count = 8) {
  const key = loadSecrets().BOCHA_API_KEY
  if (!key) return []
  try {
    const r = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, summary: true, count }),
    })
    if (!r.ok) return []
    const j = await r.json()
    const pages = (j && j.data && j.data.webPages && j.data.webPages.value) || []
    return pages.map((p) => ({
      title: p.name || '',
      url: p.url || '',
      site: p.siteName || hostOf(p.url),
      date: p.datePublished || p.dateLastCrawled || '',
      snippet: String(p.summary || p.snippet || ''),
      channel: 'bocha',
    }))
  } catch { return [] }
}

// ---------- 通道 2：Tavily（权威命中强，日期常缺） ----------
export async function searchTavily(query, count = 8) {
  const key = loadSecrets().TAVILY_API_KEY
  if (!key) return []
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: count, include_answer: false }),
    })
    if (!r.ok) return []
    const j = await r.json()
    return (j.results || []).map((p) => ({
      title: p.title || '',
      url: p.url || '',
      site: hostOf(p.url),
      date: p.published_date || '',
      snippet: String(p.content || ''),
      channel: 'tavily',
    }))
  } catch { return [] }
}

// ---------- 合并 + 去重 + 排序（A→B→C，同源合并标注） ----------
export function mergeResults(lists) {
  const map = new Map()
  for (const list of lists) {
    for (const it of list) {
      if (!it.url) continue
      const key = hostOf(it.url) + it.url.replace(/[?#].*$/, '')
      const prev = map.get(key)
      if (prev) {
        prev.channels.push(it.channel)
        if (!prev.date && it.date) prev.date = it.date
        if (it.snippet.length > prev.snippet.length) prev.snippet = it.snippet
      } else {
        map.set(key, { ...it, channels: [it.channel] })
      }
    }
  }
  const out = [...map.values()].map((it) => ({ ...it, tier: tierOf(it.url) }))
  const order = { A: 0, B: 1, C: 2, D: 3 }
  out.sort((a, b) => (order[a.tier] - order[b.tier]) || (b.date ? 1 : 0) - (a.date ? 1 : 0))
  return out
}

/** 一步到位：双通道并行检索 → 归一化 → 去重 → 权威排序 */
export async function search(query, count = 8) {
  const [bocha, tavily] = await Promise.all([searchBocha(query, count), searchTavily(query, count)])
  const merged = mergeResults([bocha, tavily])
  return {
    query,
    queriedAt: new Date().toISOString(),
    total: merged.length,
    channels: { bocha: bocha.length, tavily: tavily.length },
    results: merged,
  }
}

export function fmtDate(iso) {
  if (!iso) return '来源未标注更新时间'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '来源未标注更新时间'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
