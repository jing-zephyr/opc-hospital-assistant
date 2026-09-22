// lib/chat.js —— 会话管理 + 请求处理（服务端；小程序接口约定的实现）
import { answer } from './answer.js'

const SESSIONS = new Map()
const TTL = 7 * 24 * 3600 * 1000   // 会话保留 7 天（覆盖评审周期）
const MAX_SESSIONS = 200           // FIFO 上限
const MAX_TURNS = 100              // 单会话最大轮次（防爆内存）

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
    s = { id, city: '', hospitals: [], turns: [], createdAt: Date.now(), updatedAt: Date.now() }
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

/** 小程序/网页统一入口
 *  入参: { message: string, sessionId: string }
 *  出参: { sessionId, status, answer, sources[], query, queriedAt, error? }
 */
export async function handleChat(body) {
  const message = String((body && body.message) != null ? body.message : '')
  const sessionId = String((body && body.sessionId) || ('anon-' + Math.random().toString(36).slice(2, 10)))
  const s = getSession(sessionId)

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
  s.turns.push({ role: 'user', text: message, at: Date.now() })
  s.turns.push({ role: 'assistant', status: r.status, at: Date.now() })
  if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS)

  return {
    sessionId,
    status: r.status,
    answer: r.answer,
    sources: r.sources || [],
    query: r.query || '',
    queriedAt: r.queriedAt,
    contextCity: s.city || null,
    hospitals: s.hospitals || [],
    turn: s.turns.length,
  }
}
