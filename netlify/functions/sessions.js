// Netlify Function: GET /api/sessions（仅返回计数与城市，不含对话内容）
//
// ⚠️ 口径如实标注：serverless 下本列表只包含"处理本次请求的这个实例"内存里的会话，
//    **不代表全站在线会话数**（会话状态由前端携带，见 /api/chat 的 context）。
import { listSessions } from '../../lib/chat.js'

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

export async function handler() {
  const all = listSessions()
  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({
      count: all.length,
      countScope: 'single-instance',
      countScopeNote: '本计数＝处理本次请求的这个函数实例内存里的会话数，不是全站在线会话数（serverless 实例内存互不共享）。',
      sessions: all.map((s) => ({ city: s.city, turns: s.turns })),
    }),
  }
}
