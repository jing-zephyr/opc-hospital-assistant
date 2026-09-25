// lib/search.js —— 双通道检索 + 来源权威分级 + 演示模式回退（OPC 医院助手核心层）
//
// 密钥来源（两条通道，均不可用时自动进入**演示模式**，绝不假装是实时数据）：
//   ① 环境变量 BOCHA_API_KEY / TAVILY_API_KEY —— 云部署（Netlify/Vercel）与本地 .env 的唯一生产来源
//   ② 库外密钥文件（默认 C:\Users\T\.secrets\opc-search.env[.txt]，永不提交）
//      —— 可用环境变量 OPC_SECRETS_FILE 覆盖该路径（设置后只读该文件，便于迁移与"无密钥"场景自测）
//   ③ 演示模式：OPC_SEARCH_MODE=demo 强制；或 OPC_SEARCH_MODE 未设置(默认 auto)且两条通道都没有密钥
//      —— 返回 data/demo-fixtures.json 的内置样例数据，并在页面顶部与每次回答里显著标注"非实时结果"
import { readFileSync } from 'node:fs'
import { officialOf, categoryOf } from './hospitals.js'
import { CITIES } from './intent.js'

const DEFAULT_ENV_FILES = [
  'C:\\Users\\T\\.secrets\\opc-search.env',
  'C:\\Users\\T\\.secrets\\opc-search.env.txt',
]
const ENV_CANDIDATES = process.env.OPC_SECRETS_FILE ? [process.env.OPC_SECRETS_FILE] : DEFAULT_ENV_FILES

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

/** 只报"是否配置"，绝不回显密钥本身 */
export function channelStatus() {
  const s = loadSecrets()
  return { bocha: Boolean(s.BOCHA_API_KEY), tavily: Boolean(s.TAVILY_API_KEY) }
}

export const DEMO_NOTICE =
  '⚠️ 演示模式：未配置联网检索密钥（BOCHA_API_KEY / TAVILY_API_KEY），以下为内置样例数据，非实时结果'

/** 当前检索模式：live（真联网） | demo（内置样例回退） */
export function searchMode() {
  const channels = channelStatus()
  const forced = String(process.env.OPC_SEARCH_MODE || 'auto').trim().toLowerCase()
  if (forced === 'demo') return { mode: 'demo', reason: 'forced-by-OPC_SEARCH_MODE', channels }
  if (forced === 'live') return { mode: 'live', reason: 'forced-by-OPC_SEARCH_MODE', channels }
  const hasChannel = channels.bocha || channels.tavily
  return hasChannel
    ? { mode: 'live', reason: 'keys-configured', channels }
    : { mode: 'demo', reason: 'no-search-keys', channels }
}

export function isDemo() { return searchMode().mode === 'demo' }

// ---------- 演示模式：内置样例数据（data/demo-fixtures.json） ----------
let FIXTURES = null
export function loadFixtures() {
  if (FIXTURES) return FIXTURES
  try {
    FIXTURES = JSON.parse(readFileSync(new URL('../data/demo-fixtures.json', import.meta.url), 'utf8'))
  } catch {
    FIXTURES = { topics: [], cities: [], items: [] }
  }
  return FIXTURES
}

/** 演示检索：按主题关键词命中样例条目；城市不匹配的条目剔除并计入 cityMiss */
function demoSearch(query, channel, count) {
  const f = loadFixtures()
  const q = String(query || '')
  const wantCity = CITIES.find((c) => q.includes(c)) || ''
  const hits = []
  let cityMiss = 0
  for (const it of f.items || []) {
    const keys = it.keys || []
    let score = 0
    for (const k of keys) if (k && q.includes(k)) score += k.length
    if (!score) continue
    if (!(it.channels || ['bocha', 'tavily']).includes(channel)) continue
    const cityOk = !wantCity || !it.city || it.city === wantCity
    if (!cityOk) { cityMiss++; continue }
    hits.push({ it, score })
  }
  hits.sort((a, b) => b.score - a.score)
  const items = hits.slice(0, count).map((h) => ({
    title: h.it.title || '',
    url: h.it.url || '',
    site: h.it.site || hostOf(h.it.url),
    date: h.it.date || '',
    snippet: String(h.it.snippet || ''),
    channel,
    demo: true,
    demoCity: h.it.city || '',
  })).filter((it) => it.url)
  return { items, cityMiss }
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

/** 医院类别：'公立' | '民营' | null（公开页面未标明 → null，本系统不猜） */
export function categoryOfUrl(url) {
  return categoryOf(hostOf(url))
}

/** 来源更新时间距今是否超过 180 天（进阶1：易变信息的过期提醒） */
export const STALE_DAYS = 180
export function ageDays(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}
export function isStale(iso) {
  const a = ageDays(iso)
  return a != null && a > STALE_DAYS
}

// ---------- 通道 1：博查（带日期） ----------
// ⚠️ 通道级故障必须留痕：「服务异常（额度/限流/鉴权）」和「真没结果」是两种完全不同的状态，
//    混为一谈会让前端把"额度耗尽"显示成"未查到该医院"（2026-09-26 凌晨双通道额度同时耗尽时实测踩过）。
const CHANNEL_STATUS = { bocha: '', tavily: '' }   // 最近一次调用的故障码；成功即清空
export function channelErrors() { const o = {}; for (const k of ['bocha', 'tavily']) if (CHANNEL_STATUS[k]) o[k] = CHANNEL_STATUS[k]; return o }
export async function searchBocha(query, count = 8) {
  if (isDemo()) return demoSearch(query, 'bocha', count).items
  const key = loadSecrets().BOCHA_API_KEY
  if (!key) return []
  try {
    const r = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, summary: true, count }),
    })
    if (!r.ok) {
      CHANNEL_STATUS.bocha = r.status === 403 ? 'HTTP 403（额度/套餐不足）'
        : r.status === 401 ? 'HTTP 401（密钥无效）'
        : r.status === 429 ? 'HTTP 429（请求过频）' : `HTTP ${r.status}`
      return []
    }
    CHANNEL_STATUS.bocha = ''
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
  } catch { CHANNEL_STATUS.bocha = '网络异常'; return [] }
}

// ---------- 通道 2：Tavily（权威命中强，日期常缺） ----------
export async function searchTavily(query, count = 8) {
  if (isDemo()) return demoSearch(query, 'tavily', count).items
  const key = loadSecrets().TAVILY_API_KEY
  if (!key) return []
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: count, include_answer: false }),
    })
    if (!r.ok) {
      CHANNEL_STATUS.tavily = r.status === 432 || r.status === 429 ? `HTTP ${r.status}（用量超限/过频）`
        : r.status === 401 ? 'HTTP 401（密钥无效）'
        : r.status === 403 ? 'HTTP 403（额度/套餐不足）' : `HTTP ${r.status}`
      return []
    }
    CHANNEL_STATUS.tavily = ''
    const j = await r.json()
    return (j.results || []).map((p) => ({
      title: p.title || '',
      url: p.url || '',
      site: hostOf(p.url),
      date: p.published_date || '',
      snippet: String(p.content || ''),
      channel: 'tavily',
    }))
  } catch { CHANNEL_STATUS.tavily = '网络异常'; return [] }
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
  const out = [...map.values()].map((it) => ({
    ...it,
    tier: tierOf(it.url),
    category: categoryOfUrl(it.url),   // '公立' | '民营' | null
  }))
  const order = { A: 0, B: 1, C: 2, D: 3 }
  out.sort((a, b) => (order[a.tier] - order[b.tier]) || (b.date ? 1 : 0) - (a.date ? 1 : 0))
  return out
}

/** 一步到位：双通道并行检索 → 归一化 → 去重 → 权威排序（带缓存 + 重试 + 成本计数）
 *  ⚠️ 演示模式下**不增加"真实检索次数"**，只记 demoSearches —— 指标不得虚报。 */
const CACHE = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000   // 10 分钟：同一问题短时间重复问，直接用缓存（省额度、也更快）
const MAX_CACHE = 200

export const STATS = {
  searches: 0, cacheHits: 0, retries: 0, failures: 0,
  demoSearches: 0, mode: 'live', since: new Date().toISOString(),
}

function withRetry(fn, label) {
  return fn().then((r) => (Array.isArray(r) && r.length > 0 ? r : fn())).catch(() =>
    fn().then((r) => { STATS.retries++; return r }).catch(() => { STATS.failures++; return [] })
  )
}

export async function search(query, count = 8) {
  const key = String(query || '').trim() + '#' + count
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    STATS.cacheHits++
    return { ...hit.value, cached: true, cachedAt: new Date(hit.at).toISOString() }
  }

  const sm = searchMode()
  STATS.mode = sm.mode

  // ---- 演示模式：内置样例数据（绝不冒充实时结果） ----
  if (sm.mode === 'demo') {
    STATS.demoSearches++
    const b = demoSearch(query, 'bocha', count)
    const t = demoSearch(query, 'tavily', count)
    const merged = mergeResults([b.items, t.items])
    const value = {
      query,
      queriedAt: new Date().toISOString(),
      total: merged.length,
      channels: { bocha: b.items.length, tavily: t.items.length },
      results: merged,
      mode: 'demo',
      demo: true,
      demoReason: sm.reason,
      demoNotice: DEMO_NOTICE,
      demoCityMiss: Math.max(b.cityMiss, t.cityMiss),
      demoTopics: (loadFixtures().topics || []).slice(0, 12),
      cached: false,
    }
    CACHE.set(key, { at: Date.now(), value })
    return value
  }

  STATS.searches++
  const [bocha, tavily] = await Promise.all([
    withRetry(() => searchBocha(query, count), 'bocha'),
    withRetry(() => searchTavily(query, count), 'tavily'),
  ])
  const merged = mergeResults([bocha, tavily])
  const value = {
    query,
    queriedAt: new Date().toISOString(),
    total: merged.length,
    channels: { bocha: bocha.length, tavily: tavily.length },
    channelErrors: channelErrors(),   // 通道故障留痕（额度/限流/网络）；全空 = 本次两通道都正常
    results: merged,
    mode: 'live',
    demo: false,
  }

  CACHE.set(key, { at: Date.now(), value })
  if (CACHE.size > MAX_CACHE) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) CACHE.delete(oldest[0])
  }
  return { ...value, cached: false }
}

export function cacheStats() {
  return { size: CACHE.size, ttlMs: CACHE_TTL_MS, max: MAX_CACHE }
}

export function fmtDate(iso) {
  if (!iso) return '来源未标注更新时间'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '来源未标注更新时间'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
