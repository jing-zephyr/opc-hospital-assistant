// Netlify Function: POST /api/chat
// 密钥从 Netlify 环境变量读取（BOCHA_API_KEY / TAVILY_API_KEY），不落任何文件
import { handleChat } from '../../lib/chat.js'

const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) }
  }
  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'BAD_JSON' }) }
  }
  try {
    const r = await handleChat(body)
    return { statusCode: 200, headers: CORS, body: JSON.stringify(r) }
  } catch (e) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ status: 'error', error: 'INTERNAL_ERROR', message: String(e && e.message ? e.message : e) }),
    }
  }
}
