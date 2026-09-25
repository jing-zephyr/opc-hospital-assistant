// lib/chat.js —— 会话管理 + 请求处理（服务端；小程序接口约定的实现）
//
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ 架构（2026-09 修复 · P0）：**会话状态由前端携带，后端对会话无状态**。
//
//   为什么必须这样：Netlify Functions 是 serverless —— 同一 sessionId 的连续请求
//   可能落在**不同的函数实例**上，实例之间的进程内 Map（SESSIONS / 检索缓存 / 计数器）
//   互不可见。原实现把"上下文记忆"只放在进程内 Map 里，于是：
//     ・本地单进程 `node server.mjs`：稳定；
//     ・公网 serverless：**随机断记忆** —— 第 2 步「换成发热门诊」可能接不上第 1 步的城市，
//       第 3 步「第二家的地址呢」可能找不到可承接的医院列表。
//   这正好打在官方基础需求4（上下文记忆 / 支持补充条件与继续追问）的验收点上，
//   而且是**概率性翻车**（演示时最容易踩）。
//
//   现在的数据流（无状态）：
//
//     前端 sessionStorage                POST /api/chat               服务端（任意实例）
//     ┌───────────────┐   context  ───▶  ┌──────────────────┐   ──▶  resolveSession()
//     │ CTX = {...}   │                  │ handleChat(body) │         ├─ 优先用 body.context
//     └───────────────┘   ◀─── context   └──────────────────┘         └─ 兜底用本进程内存 Map
//              ▲                （更新后的 context：城市 / 上一轮科室·资源 / 上一轮医院列表 / 轮次）
//              └──────────────────────────────────────────────────────────────┘
//        前端把响应里的 context 原样存起来，下次请求带上 —— 于是换实例也不丢上下文。
//
//   进程内 Map（SESSIONS）**保留**：本地单进程模式下的加速与兼容（行为不变）。
//   兼容性：不传 context 的老调用方（如既有测试脚本/小程序旧版本）走原来的内存路径，
//   行为与修复前完全一致。
// ══════════════════════════════════════════════════════════════════════════
import { answer } from './answer.js'
import { lookupCampus } from './campus.js'
import { officialSiteByName } from './hospitals.js'
import { STATS, cacheStats, searchMode, channelStatus, DEMO_NOTICE } from './search.js'

const SESSIONS = new Map()
const TTL = 7 * 24 * 3600 * 1000   // 会话保留 7 天（覆盖评审周期）
const MAX_SESSIONS = 200           // FIFO 上限
const MAX_TURNS = 100              // 单会话最大轮次（防爆内存）

// 进阶3：请求限流（每会话每分钟上限）
// ⚠️ 如实说明：限流计数同样在进程内，serverless 下**只对落在同一实例的请求**有效。
const RATE = { windowMs: 60 * 1000, max: 20 }
const HITS = new Map()

// —— 前端携带的 context 规格（可放进请求体，也可 URL 编码后放进 query）——
export const CONTEXT_VERSION = 1
export const CLIENT_TURNS_MAX = 40          // 只回传最近 40 条轮次记录（≈20 轮问答），避免请求体无限增长
export const CLIENT_HOSPITALS_MAX = 12      // 只回传最近一次结果的医院列表（"第 N 家"承接够用）
export const CONTEXT_NOTICE =
  '会话状态由前端携带：本接口每次返回 context（城市 / 上一轮科室与资源 / 上一轮医院列表 / 轮次），' +
  '前端下次请求原样回传即可跨实例续接；服务端进程内 Map 只在本地单进程模式下作为加速与兼容，' +
  'serverless（Netlify Functions）下不保证存在，因此**不要**把服务端内存当作会话的唯一来源。'

// 每进程一个实例标识：让 /api/stats 的"单实例计数"口径**可被验证**（测试脚本据此判断两次请求是否同一实例）
const INSTANCE_ID = 'inst-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)

function rateLimited(sessionId) {
  const now = Date.now()
  const arr = (HITS.get(sessionId) || []).filter((t) => now - t < RATE.windowMs)
  if (arr.length >= RATE.max) { HITS.set(sessionId, arr); return true }
  arr.push(now)
  HITS.set(sessionId, arr)
  return false
}

function evict() {
  const now = Date.now()
  for (const [id, s] of SESSIONS) if (now - s.updatedAt > TTL) SESSIONS.delete(id)
  while (SESSIONS.size > MAX_SESSIONS) {
    const oldest = [...SESSIONS.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0]
    if (!oldest) break
    SESSIONS.delete(oldest[0])
  }
}

// ───────────────────────────── context 规格化（只收白名单字段） ─────────────────────────────
const cap = (v, max) => String(v == null ? '' : v).slice(0, max)
/** 单行短字段：对象/数组一律视为"没给"（不把 `[object Object]` 当成城市名写进会话） */
const oneLine = (v, max) => (v == null || typeof v === 'object')
  ? '' : cap(v, max).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
const strArr = (v, max, each) => Array.isArray(v)
  ? v.map((x) => oneLine(x, each)).filter(Boolean).slice(0, max) : []

/** 医院条目：**只保留纯 JSON 白名单字段**；院区信息一律由本地院区表按院名重算（不信任前端传的结构） */
function normalizeHospital(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null
  const name = oneLine(h.name, 80)
  const fullName = oneLine(h.fullName, 120) || name
  if (!name && !fullName) return null
  return {
    name: name || fullName,
    fullName,
    altNames: strArr(h.altNames, 4, 80),
    tier: /^[ABCD]$/.test(String(h.tier)) ? String(h.tier) : 'C',
    url: cap(h.url, 500),
    site: oneLine(h.site, 120),
    title: cap(h.title, 300),
    date: oneLine(h.date, 40),
    category: h.category ? oneLine(h.category, 8) : null,
    itemCampus: oneLine(h.itemCampus || h.campusMatched, 60),
    crossSites: Number(h.crossSites) || 0,
    dualChannel: Boolean(h.dualChannel),
    demo: Boolean(h.demo),
    // 院区信息重算（lib/campus.js 的静态院区表，确定性；查不到就是 null —— 不猜）
    campusInfo: lookupCampus(fullName || name) || null,
    // 该院官网域名（白名单反查，确定性；查不到就是 '' —— 不编域名）。前端详情页据此显示"官网"行。
    officialSite: (officialSiteByName(fullName || name) || {}).host || '',
  }
}

function normalizeTurn(t) {
  if (!t || typeof t !== 'object') return null
  const role = t.role === 'assistant' ? 'assistant' : (t.role === 'user' ? 'user' : '')
  if (!role) return null
  const at = Number(t.at) || 0
  if (role === 'user') return { role, text: oneLine(t.text, 500), at }
  return { role, status: oneLine(t.status, 32), at }
}

/** URL / 请求体里传来的 context → 纯对象（支持 JSON、URL 编码 JSON、base64url(JSON)） */
export function parseContextParam(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s || s === 'null' || s === 'undefined') return null
  const tries = [s]
  try { const d = decodeURIComponent(s); if (d !== s) tries.push(d) } catch { /* 非 URL 编码 */ }
  for (const t of tries) {
    const body = t[0] === '%' ? (() => { try { return decodeURIComponent(t) } catch { return '' } })() : t
    if (!body || (body[0] !== '{' && body[0] !== '[')) continue
    try { const j = JSON.parse(body); if (j && typeof j === 'object') return j } catch { /* 继续试 */ }
  }
  try {
    const j = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (j && typeof j === 'object') return j
  } catch { /* 不是 base64 */ }
  return null
}

/** 前端携带的 context → 白名单化的会话状态；**空 context 视为"没带"**（返回 null → 回落服务端内存） */
export function normalizeContext(raw) {
  const obj = typeof raw === 'string' ? parseContextParam(raw) : raw
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const city = oneLine(obj.city, 32)
  const lastDepartments = strArr(obj.lastDepartments, 4, 48)
  const lastResources = strArr(obj.lastResources, 4, 48)
  // ⚠️ 先截断再逐条规格化：避免超大请求体（恶意/异常客户端）把这里变成 CPU 热点
  const hospitals = Array.isArray(obj.hospitals)
    ? obj.hospitals.slice(0, CLIENT_HOSPITALS_MAX * 4).map(normalizeHospital).filter(Boolean).slice(0, CLIENT_HOSPITALS_MAX) : []
  const turns = Array.isArray(obj.turns)
    ? obj.turns.slice(-CLIENT_TURNS_MAX * 3).map(normalizeTurn).filter(Boolean).slice(-CLIENT_TURNS_MAX) : []
  if (!city && !lastDepartments.length && !lastResources.length && !hospitals.length && !turns.length) return null
  return {
    v: CONTEXT_VERSION,
    sessionId: oneLine(obj.sessionId, 80),
    city, lastDepartments, lastResources, hospitals, turns,
    turnTotal: Math.max(Number(obj.turnTotal) || 0, turns.length),
  }
}

/** 服务端会话状态 → 前端携带的 context（纯 JSON，可直接 sessionStorage 存） */
export function buildContext(s) {
  const turns = (s.turns || []).slice(-CLIENT_TURNS_MAX)
  return {
    v: CONTEXT_VERSION,
    sessionId: s.id,
    city: s.city || '',
    lastDepartments: strArr(s.lastDepartments, 4, 48),
    lastResources: strArr(s.lastResources, 4, 48),
    hospitals: (s.hospitals || []).map(normalizeHospital).filter(Boolean).slice(0, CLIENT_HOSPITALS_MAX),
    turns,
    turnTotal: (s.turns || []).length,
    updatedAt: Date.now(),
  }
}

export function emptyContext(sessionId = '') {
  return {
    v: CONTEXT_VERSION, sessionId, city: '',
    lastDepartments: [], lastResources: [], hospitals: [], turns: [], turnTotal: 0,
    updatedAt: Date.now(),
  }
}

// ───────────────────────────── 会话解析（context 优先） ─────────────────────────────
function newSession(id) {
  return {
    id, city: '', hospitals: [], turns: [],
    lastDepartments: [], lastResources: [],   // ⭐ 上下文记忆：供下一轮"城市 + 筛选条件"复用
    createdAt: Date.now(), updatedAt: Date.now(),
  }
}

/** 纯内存会话（本地单进程模式；不新建时返回 null） */
export function getSession(id) {
  let s = SESSIONS.get(id)
  if (!s) {
    s = newSession(id)
    SESSIONS.set(id, s)
  }
  s.updatedAt = Date.now()
  evict()
  return s
}

/**
 * 合并"前端携带的 context"与"本进程内存会话" → 本轮真正使用的会话状态。
 * 取值规则（写在代码里，避免以后有人改回去）：
 *   ・city / lastDepartments / lastResources / hospitals：**前端 context 优先**（非空即用），
 *     因为前端拿到的就是"用户最后一次真正看到的那个结果"；内存只作兜底。
 *   ・turns（轮次）：取两者中**更完整的一份**（条数多者），保证历史只增不减 ——
 *     同一实例既可能记得早先几轮、也可能收到前端回传的更多轮，取多者才不会把历史改短。
 *   ・createdAt：沿用内存里的（同进程内更早）。
 */
function resolveSession(sessionId, ctx) {
  const mem = SESSIONS.get(sessionId) || null
  const memTurns = (mem && mem.turns) || []
  const ctxTurns = (ctx && ctx.turns) || []
  const base = mem || newSession(sessionId)
  const s = {
    id: sessionId,
    city: (ctx && ctx.city) || base.city || '',
    hospitals: (ctx && ctx.hospitals.length) ? ctx.hospitals.slice() : (base.hospitals || []).slice(),
    lastDepartments: (ctx && ctx.lastDepartments.length) ? ctx.lastDepartments.slice() : (base.lastDepartments || []).slice(),
    lastResources: (ctx && ctx.lastResources.length) ? ctx.lastResources.slice() : (base.lastResources || []).slice(),
    turns: (ctxTurns.length > memTurns.length ? ctxTurns : memTurns).slice(),
    createdAt: base.createdAt || Date.now(),
    updatedAt: Date.now(),
    stateFrom: ctx ? (mem ? 'client-context+server-memory' : 'client-context') : 'server-memory',
  }
  return s
}

export function resetSession(id) {
  SESSIONS.delete(id)
  return {
    ok: true,
    sessionId: id,
    message: '会话已重置（新会话与旧会话相互隔离）',
    // ⭐ 无状态：服务端只能清除"本实例"的内存；前端必须同时丢弃本地 context，重置才完整生效
    context: emptyContext(id),
    note: '无状态说明：本接口只清除"处理本次请求的这个实例"内存里的该会话（serverless 下别的实例可能仍有副本）。会话状态由前端携带 —— 前端必须同时清空本地保存的 context，重置才完整生效。',
  }
}

export function listSessions() {
  return [...SESSIONS.values()].map((s) => ({
    id: s.id, city: s.city, turns: s.turns.length, updatedAt: s.updatedAt,
  }))
}

/** 进阶3：用户主动查看本会话历史（不含检索原文，只有轮次与关键状态）
 *  ⭐ 无状态修复：**接受前端传来的 context**（第二个参数），据此回显真实轮次；
 *     没有 context 时才回落服务端内存（本地单进程模式仍然可用）。 */
export function getHistory(sessionId, rawContext) {
  const id = String(sessionId || '')
  const ctx = normalizeContext(rawContext)
  const mem = SESSIONS.get(id) || null
  if (!ctx && !mem) {
    return {
      sessionId: id,
      exists: false,
      turns: [],
      source: 'none',
      note: '服务端此刻没有该会话（serverless 下实例内存互不共享，属正常现象）。会话历史由前端携带：把 /api/chat 返回的 context 用 `?context=<URL编码JSON>`（GET）或 `{"sessionId":..,"context":{..}}`（POST）传回来，即可回显真实轮次。',
    }
  }
  const s = resolveSession(id, ctx)
  return {
    sessionId: id,
    exists: true,
    // 数据来源如实标注：client-context（前端携带）/ server-memory（本实例内存）/ 两者都有
    source: ctx && mem ? 'client-context+server-memory' : (ctx ? 'client-context' : 'server-memory'),
    city: s.city || null,
    departments: s.lastDepartments || [],
    resources: s.lastResources || [],
    hospitals: (s.hospitals || []).map((h) => h.name || h.fullName || '').filter(Boolean),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    turnTotal: (s.turns || []).length,
    turns: s.turns || [],
    note: CONTEXT_NOTICE,
  }
}

/** 进阶3：调用成本 / 缓存 / 限流 运行指标（不暴露任何密钥）
 *  ⚠️ 演示模式下的检索不计入"真实检索次数"，单独记 demoSearches —— 指标不虚报。
 *  ⚠️ 计数口径**必须如实标注**：serverless 下每个函数实例各有一份内存，这里读到的是
 *     "处理本次请求的这个实例"的计数，**不代表全站/全局累计**（instanceId 可自证）。 */
export function usageStats() {
  const sm = searchMode()
  return {
    search: { ...STATS, mode: sm.mode },
    cache: cacheStats(),
    sessions: SESSIONS.size,
    rateLimit: RATE,
    mode: sm.mode,
    channels: channelStatus(),
    demo: sm.mode === 'demo',
    at: new Date().toISOString(),
    // ---- 计数口径（如实标注，不许冒充全局统计）----
    instanceId: INSTANCE_ID,                       // 每个函数实例/进程一个；两次请求同值 ⇒ 落在同一实例
    countScope: 'single-instance',                 // 本计数的真实口径
    countScopeNote: '⚠️ 计数口径＝**单实例**：serverless（Netlify Functions）下每个函数实例内存独立，' +
      '以上 searches/cacheHits/sessions 只反映"处理本次请求的这个实例"，**不代表全站或全局累计**；' +
      '实例会被平台回收与重建，因此该计数据会归零，属正常现象。' +
      '会话状态不依赖服务端内存（由前端携带 context），故会话相关能力不受此影响。',
    instanceLocal: { sessions: SESSIONS.size, cache: cacheStats().size, rateLimitBuckets: HITS.size },
    sessionState: 'client-carried',                // 会话状态来源：前端携带
    contextVersion: CONTEXT_VERSION,
  }
}

/** 小程序/网页统一入口
 *  入参: { message: string, sessionId: string, context?: object|string }   ← context 可选（前端携带的会话状态）
 *  出参: { sessionId, status, answer, sources[], query, queriedAt, mode, demo, demoNotice?,
 *          context, contextSource, contextNotice, error? }
 */
export async function handleChat(body) {
  const message = String((body && body.message) != null ? body.message : '')
  const sessionId = String((body && body.sessionId) || ('anon-' + Math.random().toString(36).slice(2, 10)))
  const clientCtx = normalizeContext(body && body.context)
  const contextSource = clientCtx ? 'client-context' : 'server-memory'

  // 进阶3：限流保护（⚠️ 计数在进程内，serverless 下只覆盖同一实例的请求）
  if (rateLimited(sessionId)) {
    return {
      sessionId, status: 'rate_limited', sources: [], query: '',
      queriedAt: new Date().toISOString(),
      // 限流时也把 context 原样还给前端，避免"被限流一次就丢上下文"
      context: clientCtx ? { ...clientCtx, sessionId, v: CONTEXT_VERSION, updatedAt: Date.now() } : emptyContext(sessionId),
      contextSource,
      contextNotice: CONTEXT_NOTICE,
      answer: '请求过于频繁，已触发限流保护。请稍等约 1 分钟后重试。\n（本站对同一会话设有每分钟请求上限，用于防止额度被误刷。）',
    }
  }

  const s = resolveSession(sessionId, clientCtx)
  const sm = searchMode()

  let r
  try {
    r = await answer(message, s)
  } catch (e) {
    return {
      sessionId, status: 'error', answer: '', sources: [],
      query: '', queriedAt: new Date().toISOString(),
      context: buildContext(s), contextSource, contextNotice: CONTEXT_NOTICE,
      error: 'INTERNAL_ERROR: ' + String(e && e.message ? e.message : e),
    }
  }

  // 会话记忆：记住城市 + 上一轮识别出的医院列表（供"第二家的地址呢"这类承接）
  if (r.intent && r.intent.cities && r.intent.cities.length) s.city = r.intent.cities[0]
  if (Array.isArray(r.hospitals) && r.hospitals.length) s.hospitals = r.hospitals
  // ⭐ 记住本轮（或本轮继承的）科室/资源 —— 下一轮说"杭州，优先公立医院"时要能接上
  if (r.topics && Array.isArray(r.topics.departments) && r.topics.departments.length) {
    s.lastDepartments = r.topics.departments
  }
  if (r.topics && Array.isArray(r.topics.resources) && r.topics.resources.length) {
    s.lastResources = r.topics.resources
  }
  s.turns.push({ role: 'user', text: message, at: Date.now() })
  s.turns.push({ role: 'assistant', status: r.status, at: Date.now() })
  if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS)

  // 写回本进程内存（本地单进程模式的加速/兼容；serverless 下随时可能没有，不影响正确性）
  s.updatedAt = Date.now()
  SESSIONS.set(sessionId, s)
  evict()

  const demo = r.demo != null ? Boolean(r.demo) : sm.mode === 'demo'
  // 医院列表：只把**纯 JSON 字段**发给前端（不把内部 campusInfo 对象整包透出）
  const hospitals = (s.hospitals || []).map((h) => ({
    name: h.fullName || h.name,
    matched: h.name,
    fullName: h.fullName || h.name,
    altNames: h.altNames || [],
    tier: h.tier || 'C',
    url: h.url || '',
    site: h.site || '',
    title: h.title || '',
    date: h.date || '',
    category: h.category || null,
    region: (h.campusInfo && h.campusInfo.city) || s.city || '',
    campusList: (h.campusInfo && h.campusInfo.campuses || []).map((c) => c.name),
    campusConfidence: (h.campusInfo && h.campusInfo.confidence) || null,
    campusMatched: h.itemCampus || '',
    itemCampus: h.itemCampus || '',
    // 该院官网域名（白名单反查；首轮结果没有缓存字段时现算，查不到为 null —— 不编）
    officialSite: h.officialSite || (officialSiteByName(h.fullName || h.name) || {}).host || null,
    crossSites: h.crossSites || 0,
    dualChannel: Boolean(h.dualChannel),
    demo: Boolean(h.demo),
  }))
  return {
    sessionId,
    status: r.status,
    answer: r.answer,
    sources: r.sources || [],
    query: r.query || '',
    queriedAt: r.queriedAt,
    contextCity: s.city || null,
    contextDepartments: s.lastDepartments || [],
    contextResources: s.lastResources || [],
    hospitals,
    turn: s.turns.length,
    mode: r.mode || sm.mode,
    demo,
    demoNotice: demo ? (r.demoNotice || DEMO_NOTICE) : null,
    // ---- P0 无状态修复：把更新后的会话状态回传给前端（下次请求原样带上即可跨实例续接）----
    context: buildContext(s),
    contextSource,
    contextNotice: CONTEXT_NOTICE,
    // ---- 进阶1 的机器可读字段（网页版对比表/小程序端都能直接用；纯 JSON，不含任何密钥）----
    multiCampus: (r.multiCampus || []).map((m) => ({ name: m.name, campuses: m.campuses, confidence: m.confidence })),
    needCampusClarify: Boolean(r.needCampusClarify),
    crossSiteCount: r.crossSiteCount || 0,       // 覆盖本次结论的独立域名数
    dualChannelCount: r.dualChannelCount || 0,   // 被两个通道同时命中的条目数（最强交叉核验）
    conflict: Boolean(r.conflict),
    conflictPairs: r.conflictPairs || 0,
    staleCount: r.staleCount || 0,
    staleDays: r.staleDays || null,
    // ---- P1-3：演示范围（城市）口径的机器可读字段 ----
    scopeCity: r.scopeCity || null,              // 本次演示范围（查询城市）
    outOfScopeCount: r.outOfScopeCount || 0,     // 不在演示范围内的来源条数
    outOfScopeCities: r.outOfScopeCities || [],  // 涉及的外地城市
    hospitalsOutOfScope: (r.hospitalsOutOfScope || []).map((h) => ({
      name: h.fullName || h.name, url: h.url || '', outOfCity: h.outOfCity || '',
    })),
    // ---- P0-2：公立/民营覆盖统计（官方基础需求2 的验收点：≥3 家、覆盖公立 + ≥1 家可核验民营）----
    categoryCoverage: r.categoryCoverage || { public: 0, private: 0, unknown: 0, privateNames: [] },
  }
}
