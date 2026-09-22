// Netlify Function: GET /api/health
import { loadSecrets } from '../../lib/search.js'

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

export async function handler() {
  const s = loadSecrets()
  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({
      ok: true,
      at: new Date().toISOString(),
      // 只报"是否配置"，绝不回显密钥本身
      channels: {
        bocha: Boolean(s.BOCHA_API_KEY),
        tavily: Boolean(s.TAVILY_API_KEY),
      },
    }),
  }
}
