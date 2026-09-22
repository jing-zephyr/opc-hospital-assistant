// Netlify Function: GET /api/stats —— 调用成本 / 缓存 / 限流指标（不含密钥）
import { usageStats } from '../../lib/chat.js'

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }

export async function handler() {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(usageStats()) }
}
