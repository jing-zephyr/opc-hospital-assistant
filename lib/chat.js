// lib/chat.js —— 会话管理 + 请求处理（服务端；小程序接口约定的实现）
import { answer } from './answer.js'
import { STATS, cacheStats, searchMode, channelStatus, DEMO_NOTICE } from './search.js'

const SESSIONS = new Map()
const TTL = 7 * 24 * 3600 * 1000   // 会话保留 7 天（覆盖评审周期）
const MAX_SESSIONS = 200           // FIFO 上限
const MAX_TURNS = 100              // 单会话最大轮次（防爆内存）

// 进阶3：请求限流（每会话每分钟上限）
const RATE = { windowMs: 60 * 1000, max: 20 }
const HITS = new Map()

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

export function getSession(id) {
  let s = SESSIONS.get(id)
  if (!s) {
    s = {
      id, city: '', hospitals: [], turns: [],
      lastDepartments: [], lastResources: [],   // ⭐ 上下文记忆：供下一轮"城市 + 筛选条件"复用
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    SESSIONS.set(id, s)
  }
  s.updatedAt = Date.now()
  evict()
  return s
}

export function resetSession(id) {
  SESSIONS.delete(id)
  return { ok: true, sessionId: id, message: '会话已重置（新会话与旧会话相互隔离）' }
}

export function listSessions() {
  return [...SESSIONS.values()].map((s) => ({
    id: s.id, city: s.city, turns: s.turns.length, updatedAt: s.updatedAt,
  }))
}

/** 进阶3：用户主动查看本会话历史（不含检索原文，只有轮次与关键状态） */
export function getHistory(sessionId) {
  const s = SESSIONS.get(String(sessionId || ''))
  if (!s) return { sessionId, exists: false, turns: [] }
  return {
    sessionId: s.id,
    exists: true,
    city: s.city || null,
    departments: s.lastDepartments || [],
    resources: s.lastResources || [],
    hospitals: (s.hospitals || []).map((h) => h.name),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    turns: s.turns,
  }
}

/** 进阶3：调用成本 / 缓存 / 限流 运行指标（不暴露任何密钥）
 *  ⚠️ 演示模式下的检索不计入"真实检索次数"，单独记 demoSearches —— 指标不虚报。 */
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
  }
}

/** 小程序/网页统一入口
 *  入参: { message: string, sessionId: string }
 *  出参: { sessionId, status, answer, sources[], query, queriedAt, mode, demo, demoNotice?, error? }
 */
export async function handleChat(body) {
  const message = String((body && body.message) != null ? body.message : '')
  const sessionId = String((body && body.sessionId) || ('anon-' + Math.random().toString(36).slice(2, 10)))

  // 进阶3：限流保护
  if (rateLimited(sessionId)) {
    return {
      sessionId, status: 'rate_limited', sources: [], query: '',
      queriedAt: new Date().toISOString(),
      answer: '请求过于频繁，已触发限流保护。请稍等约 1 分钟后重试。\n（本站对同一会话设有每分钟请求上限，用于防止额度被误刷。）',
    }
  }

  const s = getSession(sessionId)
  const sm = searchMode()

  let r
  try {
    r = await answer(message, s)
  } catch (e) {
    return {
      sessionId, status: 'error', answer: '', sources: [],
      query: '', queriedAt: new Date().toISOString(),
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

  const demo = r.demo != null ? Boolean(r.demo) : sm.mode === 'demo'
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
    hospitals: s.hospitals || [],
    turn: s.turns.length,
    mode: r.mode || sm.mode,
    demo,
    demoNotice: demo ? (r.demoNotice || DEMO_NOTICE) : null,
  }
}
