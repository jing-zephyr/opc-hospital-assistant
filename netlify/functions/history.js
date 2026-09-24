// Netlify Function: /api/history —— 会话历史查看
//
// ⚠️ P0 无状态修复：serverless 下每个函数实例内存互不共享，**不能**再依赖服务端内存回显历史。
//    历史由**前端携带的 context** 回传（与 POST /api/chat 的 context 是同一份结构）：
//      ① GET  /api/history?sessionId=xxx&context=<URL编码的JSON>
//      ② POST /api/history  {"sessionId":"xxx","context":{...}}
//    没有 context 时回落服务端内存（本地单进程模式仍可用）；两者都没有 → exists=false 并如实说明原因。
import { getHistory } from '../../lib/chat.js'

const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch { body = {} }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(getHistory(String(body.sessionId || ''), body.context)) }
  }
  const q = event.queryStringParameters || {}
  return { statusCode: 200, headers: CORS, body: JSON.stringify(getHistory(String(q.sessionId || ''), q.context)) }
}
