// Netlify Function: GET /api/history?sessionId=xxx
import { getHistory } from '../../lib/chat.js'

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }

export async function handler(event) {
  const sid = (event.queryStringParameters && event.queryStringParameters.sessionId) || ''
  return { statusCode: 200, headers: CORS, body: JSON.stringify(getHistory(sid)) }
}
