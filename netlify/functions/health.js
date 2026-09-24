// Netlify Function: GET /api/health
import { searchMode, DEMO_NOTICE } from '../../lib/search.js'
import { CONTEXT_VERSION, CONTEXT_NOTICE } from '../../lib/chat.js'

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
      // P0 架构标识：会话状态由前端携带（serverless 安全），context 规格版本号
      sessionState: 'client-carried',
      stateless: true,
      contextVersion: CONTEXT_VERSION,
      contextNotice: CONTEXT_NOTICE,
    }),
  }
}
