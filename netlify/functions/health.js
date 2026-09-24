// Netlify Function: GET /api/health
import { searchMode, DEMO_NOTICE } from '../../lib/search.js'

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

export async function handler() {
  const sm = searchMode()
  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({
      ok: true,
      at: new Date().toISOString(),
      // 只报"是否配置"，绝不回显密钥本身
      mode: sm.mode,
      demo: sm.mode === 'demo',
      demoNotice: sm.mode === 'demo' ? DEMO_NOTICE : null,
      demoReason: sm.mode === 'demo' ? sm.reason : null,
      channels: sm.channels,
    }),
  }
}
