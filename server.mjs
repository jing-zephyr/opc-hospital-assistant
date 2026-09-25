// server.mjs —— 本地一键运行（零外部依赖，仅需 Node ≥18）
// 启动：node server.mjs   然后打开 http://127.0.0.1:8787
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleChat, resetSession, listSessions, getHistory, usageStats, CONTEXT_VERSION, CONTEXT_NOTICE } from './lib/chat.js'
import { searchMode, DEMO_NOTICE } from './lib/search.js'

const PORT = Number(process.env.PORT || 8787)
const ROOT = resolve(fileURLToPath(new URL('./public/', import.meta.url)))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

async function readBody(req, limit = 1_000_000) {
  let size = 0
  const chunks = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(c)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw new Error('BAD_JSON') }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      return json(res, 200, await handleChat(await readBody(req)))
    }
    if (url.pathname === '/api/reset' && req.method === 'POST') {
      const b = await readBody(req)
      return json(res, 200, resetSession(String(b.sessionId || '')))
    }
    if (url.pathname === '/api/sessions' && req.method === 'GET') {
      return json(res, 200, {
        // ⚠️ 口径如实标注：serverless/多进程下这里只看到"本实例"内存里的会话
        count: listSessions().length,
        countScope: 'single-instance',
        sessions: listSessions(),
      })
    }
    // 会话历史：无状态架构下**由前端携带 context**（GET 用 ?context=<URL编码JSON>，或 POST body.context）
    if (url.pathname === '/api/history' && req.method === 'GET') {
      const sid = url.searchParams.get('sessionId') || ''
      return json(res, 200, getHistory(sid, url.searchParams.get('context')))
    }
    if (url.pathname === '/api/history' && req.method === 'POST') {
      const b = await readBody(req)
      return json(res, 200, getHistory(String(b.sessionId || ''), b.context))
    }
    if (url.pathname === '/api/stats' && req.method === 'GET') {
      return json(res, 200, usageStats())
    }
    if (url.pathname === '/api/health') {
      const sm = searchMode()
      return json(res, 200, {
        ok: true,
        at: new Date().toISOString(),
        // 与 Netlify 版 /api/health 保持一致：只报"是否配置"，绝不回显密钥
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
      })
    }
    // ⭐ 首页 = 患者版对话页（便民视角）；完整版留在 /index.html，入口海报在 /entry.html
    const rel = url.pathname === '/' ? '/patient.html' : url.pathname
    const file = resolve(join(ROOT, rel))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden') }
    const buf = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    return res.end(buf)
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    if (msg === 'BAD_JSON') return json(res, 400, { error: 'BAD_JSON', message: '请求体不是合法 JSON' })
    if (msg === 'PAYLOAD_TOO_LARGE') return json(res, 413, { error: 'PAYLOAD_TOO_LARGE', message: '请求体过大' })
    return json(res, 500, { error: 'INTERNAL_ERROR', message: msg })
  }
})

server.listen(PORT, () => {
  console.log('\n  OPC 医院资源查询助手 · 本地演示已启动')
  console.log('  打开：   http://127.0.0.1:' + PORT)
  console.log('  健康检查： http://127.0.0.1:' + PORT + '/api/health\n')
})
