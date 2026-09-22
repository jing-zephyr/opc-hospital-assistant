// Netlify Function: GET /api/sessions（仅返回计数与城市，不含对话内容）
import { listSessions } from '../../lib/chat.js'

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

export async function handler() {
  const all = listSessions()
  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({ count: all.length, sessions: all.map((s) => ({ city: s.city, turns: s.turns })) }),
  }
}
