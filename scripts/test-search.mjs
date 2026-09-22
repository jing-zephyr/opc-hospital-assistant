// 检索通道连通性测试（博查 + Tavily）
// 用法: node test-search.mjs "北京 卒中中心 医院"
// 密钥来源: C:\Users\T\.secrets\opc-search.env （库外，永不提交）
import { readFileSync } from 'node:fs'

const ENV_CANDIDATES = [
  'C:\\Users\\T\\.secrets\\opc-search.env',
  'C:\\Users\\T\\.secrets\\opc-search.env.txt',
]

function loadEnv() {
  for (const path of ENV_CANDIDATES) {
    const out = {}
    try {
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const i = t.indexOf('=')
        if (i < 0) continue
        out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
      }
      if (Object.keys(out).length > 0) {
        console.log('密钥文件:', path)
        return out
      }
    } catch {
      // 试下一个候选路径
    }
  }
  console.error('⚠️ 未找到密钥文件，已尝试：')
  for (const p of ENV_CANDIDATES) console.error('   ', p)
  return {}
}

function mask(k) {
  if (!k) return '(未配置)'
  return k.slice(0, 4) + '***' + k.slice(-3) + '  (len=' + k.length + ')'
}

const env = loadEnv()
const query = process.argv[2] || '北京 卒中中心 医院'

console.log('查询:', query)
console.log('博查 key:', mask(env.BOCHA_API_KEY))
console.log('Tavily key:', mask(env.TAVILY_API_KEY))

async function bocha(q) {
  const key = env.BOCHA_API_KEY
  if (!key) return { skipped: 'BOCHA_API_KEY 未配置' }
  try {
    const r = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, summary: true, count: 8 }),
    })
    const text = await r.text()
    if (!r.ok) return { error: 'HTTP ' + r.status, body: text.slice(0, 400) }
    const j = JSON.parse(text)
    const pages = (j && j.data && j.data.webPages && j.data.webPages.value) || []
    return {
      count: pages.length,
      items: pages.map((p) => ({
        title: p.name,
        url: p.url,
        site: p.siteName || '',
        date: p.dateLastCrawled || p.datePublished || '',
        snippet: String(p.summary || p.snippet || '').slice(0, 180),
      })),
    }
  } catch (e) {
    return { error: e.message }
  }
}

async function tavily(q) {
  const key = env.TAVILY_API_KEY
  if (!key) return { skipped: 'TAVILY_API_KEY 未配置' }
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, search_depth: 'basic', max_results: 8, include_answer: false }),
    })
    const text = await r.text()
    if (!r.ok) return { error: 'HTTP ' + r.status, body: text.slice(0, 400) }
    const j = JSON.parse(text)
    const items = (j.results || []).map((p) => ({
      title: p.title,
      url: p.url,
      site: (p.url || '').replace(/^https?:\/\//, '').split('/')[0],
      date: p.published_date || '',
      snippet: String(p.content || '').slice(0, 180),
    }))
    return { count: items.length, items }
  } catch (e) {
    return { error: e.message }
  }
}

console.log('\n===== 博查 =====')
console.log(JSON.stringify(await bocha(query), null, 1))
console.log('\n===== Tavily =====')
console.log(JSON.stringify(await tavily(query), null, 1))
