// Netlify Function: POST /api/reset
import { resetSession } from '../../lib/chat.js'

const CORS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* 容错：空体 */ }
  return { statusCode: 200, headers: CORS, body: JSON.stringify(resetSession(String(body.sessionId || ''))) }
}
