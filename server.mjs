// server.mjs —— 本地一键运行（零外部依赖，仅需 Node ≥18）
// 启动：node server.mjs   然后打开 http://127.0.0.1:8787
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleChat, resetSession, listSessions } from './lib/chat.js'

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
      return json(res, 200, { sessions: listSessions() })
    }
    if (url.pathname === '/api/health') {
      return json(res, 200, { ok: true, at: new Date().toISOString() })
    }
    const rel = url.pathname === '/' ? '/index.html' : url.pathname
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
