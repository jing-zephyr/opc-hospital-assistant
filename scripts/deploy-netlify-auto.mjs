// scripts/deploy-netlify-auto.mjs —— 全自动非交互部署
// 相比 deploy-netlify.mjs 的改进：
//   1. 先用 Management API 找到/创建站点（避免 CLI 交互式提问卡死）
//   2. 自动设置 BOCHA_API_KEY / TAVILY_API_KEY 环境变量
//   3. 触发部署后轮询直到 ready，最后被测 /api/health
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SITE_NAME = process.env.SITE_NAME || 'opc-hospital-assistant'
const ENV_FILES = [
  'C:\\Users\\T\\.secrets\\opc-search.env',
  'C:\\Users\\T\\.secrets\\opc-search.env.txt',
  'C:\\Users\\T\\.secrets\\netlify.env',
  'C:\\Users\\T\\.secrets\\netlify.env.txt',
]

function readEnv() {
  const out = {}
  for (const p of ENV_FILES) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      if (!out[k]) out[k] = t.slice(i + 1).trim()
    }
  }
  return out
}

const env = readEnv()
const TOKEN = process.env.NETLIFY_AUTH_TOKEN || env.NETLIFY_AUTH_TOKEN
if (!TOKEN) { console.error('❌ 没找到 NETLIFY_AUTH_TOKEN'); process.exit(1) }

const API = 'https://api.netlify.com/api/v1'
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
const mask = (s) => s.slice(0, 6) + '***' + s.slice(-4)

async function api(path, opts = {}) {
  const r = await fetch(API + path, { headers: H, ...opts })
  const text = await r.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  return { ok: r.ok, status: r.status, json }
}

console.log('令牌：', mask(TOKEN))

// ── 1. 找站点，没有就建 ────────────────────────────────
console.log('\n[1/5] 查找或创建站点…')
let site = null
const list = await api('/sites?per_page=100')
if (!list.ok) {
  console.error(`❌ 列站点失败 ${list.status}：`, JSON.stringify(list.json).slice(0, 300))
  process.exit(1)
}
console.log(`  账号下站点数：${list.json.length}`)
for (const s of list.json) console.log(`    - ${s.name}  ${s.url}`)
site = list.json.find((s) => s.name === SITE_NAME)

if (!site) {
  console.log(`  没找到 "${SITE_NAME}"，创建中…`)
  const c = await api('/sites', { method: 'POST', body: JSON.stringify({ name: SITE_NAME }) })
  if (!c.ok) { console.error('❌ 创建失败：', JSON.stringify(c.json).slice(0, 400)); process.exit(1) }
  site = c.json
}
console.log(`  ✅ 站点：${site.name}  id=${site.id}`)
console.log(`     URL：${site.ssl_url || site.url}`)

// ── 2. 设置环境变量 ────────────────────────────────────
console.log('\n[2/5] 设置环境变量（BOCHA / TAVILY）…')
const wanted = {}
if (env.BOCHA_API_KEY) wanted.BOCHA_API_KEY = env.BOCHA_API_KEY
if (env.TAVILY_API_KEY) wanted.TAVILY_API_KEY = env.TAVILY_API_KEY
for (const [k, v] of Object.entries(wanted)) {
  const r = await api(`/accounts/${site.account_slug}/env?site_id=${site.id}`, {
    method: 'POST',
    body: JSON.stringify([{ key: k, values: [{ value: v, context: 'all' }] }]),
  })
  console.log(`  ${r.ok ? '✅' : '⚠️'} ${k}  (HTTP ${r.status})`)
}
if (!Object.keys(wanted).length) console.log('  ⚠️ 本地没读到密钥，跳过（部署后需手动配）')

// ── 3. 部署 ────────────────────────────────────────────
console.log('\n[3/5] 部署中…')
const CACHE = 'C:\\Users\\T\\AppData\\Local\\npm-cache\\_npx'
const cands = []
for (const id of ['7ed0f2ef719899b5', 'da5c1b6ea715e8b4']) {
  const p = join(CACHE, id, 'node_modules', 'netlify-cli', 'bin', 'run.js')
  if (existsSync(p)) cands.push(p)
}
if (!cands.length) { console.error('❌ 找不到缓存的 netlify-cli'); process.exit(1) }
const runJs = cands[0]

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '..')
const r = spawnSync(
  process.execPath,
  [runJs, 'deploy', '--prod', '--site', site.id, '--dir', 'public', '--functions', 'netlify/functions'],
  { cwd: appDir, stdio: 'inherit', env: { ...process.env, NETLIFY_AUTH_TOKEN: TOKEN } }
)
console.log('  部署退出码：', r.status)
if (r.status !== 0) {
  console.log('⚠️ 部署未成功。可重试；若提示 build 相关，改用 --build 或 --no-build 再试。')
  process.exit(r.status || 1)
}

// ── 4. 验证 ────────────────────────────────────────────
const base = site.ssl_url || site.url
console.log(`\n[4/5] 验证 ${base}/api/health …`)
for (let i = 1; i <= 12; i++) {
  try {
    const hr = await fetch(`${base}/api/health`, { cache: 'no-store' })
    const j = await hr.json()
    console.log(`  尝试 ${i}：`, JSON.stringify(j))
    if (j && j.mode) {
      console.log(`\n  mode=${j.mode}  bocha=${j.channels?.bocha}  tavily=${j.channels?.tavily}`)
      break
    }
  } catch (e) {
    console.log(`  尝试 ${i}：尚未就绪（${String(e.message).slice(0, 60)}）`)
  }
  await new Promise((s) => setTimeout(s, 5000))
}

// ── 5. 真查一次 ────────────────────────────────────────
console.log('\n[5/5] 真查一次「北京有哪些医院设有卒中中心」…')
try {
  const cr = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '北京有哪些医院设有卒中中心', sessionId: 'deploy-check-' + Date.now() }),
  })
  const j = await cr.json()
  console.log(`  status=${j.status}  query=${JSON.stringify(j.query)}  sources=${(j.sources || []).length}`)
  console.log('  answer[0] =', String(j.answer || '').split('\n').filter((x) => x.trim())[0]?.slice(0, 120))
} catch (e) {
  console.log('  ⚠️ 查询失败：', e.message)
}

console.log(`\n✅ 完成。公网入口：${base}`)
console.log(`   测试页：${base}`)
console.log(`   健康检查：${base}/api/health`)
