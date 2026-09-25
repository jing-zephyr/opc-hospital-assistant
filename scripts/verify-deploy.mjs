// scripts/verify-deploy.mjs —— **部署后自检**（公网/本地都能跑，判据实时计算，未通过就以退出码 1 结束）
//
// 由来（真实踩坑）：线上首页曾经**不含** `/mini.html` 的入口链接。排查结论不是"没部署上"，
//   而是 Netlify 站点的 **Post-processing → Pretty URLs** 把 `href="/mini.html"` 改写成了
//   `href='/mini'`（首尾引号也被换成单引号），于是"按源码字符串断言"全部落空。
//   修法：站点关闭 pretty_urls（netlify.toml 的 [build.processing] + 部署脚本里 PATCH 站点设置），
//   并用本脚本在每次部署后**自动复验**（scripts/deploy-netlify-auto.mjs 末尾会调用它）。
//
// 用法：
//   node scripts/verify-deploy.mjs                                  # 默认检查公网站点
//   BASE=https://xxx.netlify.app node scripts/verify-deploy.mjs
//   BASE=http://127.0.0.1:8896 node scripts/verify-deploy.mjs       # 本地也能跑（跳过 CDN 重试）
//
// 断言清单：
//   ① 首页 HTTP 200 且**含 `<a href="/mini.html"`**（P1：入口必须真的在线上首页里）
//   ② /mini.html HTTP 200 且非空
//   ③ /api/health → mode / channels 齐备（只报"是否配置"，绝不回显密钥）
//   ④ 首页含 API 基地址（/api/chat、/api/health）→ 说明前端确实连得上后端
//   ⑤ P0 无状态：同一 sessionId 三步，**靠前端携带的 context** 跨实例承接
//   ⑥ P0 /api/history 带 context 能回显**真实轮次**（不再是 exists=false）
//   ⑦ /api/stats 如实标注"单实例计数"口径（不冒充全局统计）
import { pathToFileURL } from 'node:url'

const DEFAULT_BASE = 'https://opc-hospital-assistant.netlify.app'

const sleep = (ms) => new Promise((s) => setTimeout(s, ms))

async function getText(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opts })
  return { status: r.status, headers: r.headers, text: await r.text() }
}

/**
 * @param {string} base 站点根地址（不带结尾斜杠）
 * @param {{quiet?:boolean, attempts?:number, waitMs?:number}} [opts]
 * @returns {Promise<{pass:number, fail:number, results:Array<{ok:boolean,label:string,detail:string}>}>}
 */
export async function verifyDeploy(base = DEFAULT_BASE, opts = {}) {
  const B = String(base).replace(/\/+$/, '')
  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(B)
  const attempts = opts.attempts || (local ? 1 : 8)
  const waitMs = opts.waitMs || 6000
  const say = (...a) => { if (!opts.quiet) console.log(...a) }
  const results = []
  const check = (ok, label, detail = '') => {
    results.push({ ok: Boolean(ok), label, detail })
    say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ← ' + detail : ''}`)
    return Boolean(ok)
  }

  say(`\n===== 部署后自检 =====\nBASE = ${B}${local ? '（本地模式：跳过 CDN 传播重试）' : ''}\n`)

  // ---- ① 首页 = 患者版（v2 改版：`/` 指向 patient.html）----（CDN 传播需要时间 → 重试）
  const HOME_MARK = 'AI 就诊助手'
  let home = null
  let homeOk = false
  let lastAge = ''
  for (let i = 1; i <= attempts; i++) {
    home = await getText(B + '/?_=' + Date.now())
    lastAge = String(home.headers.get('age') ?? '-')
    homeOk = home.status === 200 && home.text.includes(HOME_MARK)
    if (homeOk) break
    if (i < attempts) { say(`  … 首页尚未就绪/仍是旧版（HTTP ${home.status}，age=${lastAge}）第 ${i}/${attempts} 次，${waitMs / 1000}s 后重试`); await sleep(waitMs) }
  }
  check(homeOk, `① 首页 200 且为患者版（含「${HOME_MARK}」；v2 后 / 指向 patient.html）`,
    `HTTP ${home.status} len=${home.text.length} age=${lastAge}`)

  // ---- ①b/①c 另外两个入口也必须在线（改版最容易漏的就是"老入口掉了"）----
  const entry = await getText(B + '/entry.html')
  check(entry.status === 200 && entry.text.includes('就诊 AI 问答') && entry.text.includes('qrcode.png'),
    '①b /entry.html 入口海报页可访问（含「就诊 AI 问答」+ 二维码位）',
    `HTTP ${entry.status} len=${entry.text.length} 含标题=${entry.text.includes('就诊 AI 问答')} 含二维码位=${entry.text.includes('qrcode.png')}`)
  const tech = await getText(B + '/index.html')
  check(tech.status === 200 && tech.text.includes('<a href="/mini.html"'),
    '①c /index.html 完整版可访问，且 <a href="/mini.html"> 入口仍在线上源码里',
    `HTTP ${tech.status} len=${tech.text.length} 含 mini 入口=${tech.text.includes('<a href="/mini.html"')}`)

  // ---- ② /mini.html 200 ----
  const mini = await getText(B + '/mini.html')
  check(mini.status === 200 && mini.text.length > 1000, '② /mini.html 可访问且非空',
    `HTTP ${mini.status} len=${mini.text.length} 含"小程序"=${mini.text.includes('小程序')}`)

  // ---- ③ /api/health ----
  let health = null
  try { health = JSON.parse((await getText(B + '/api/health')).text) } catch { health = null }
  check(Boolean(health) && typeof health.mode === 'string'
    && typeof (health.channels || {}).bocha === 'boolean' && typeof (health.channels || {}).tavily === 'boolean'
    && (health.mode !== 'demo' || Boolean(health.demoNotice)),
    '③ /api/health：mode / channels 齐备（demo 模式下另带 demoNotice）',
    health ? `mode=${health.mode} bocha=${health.channels?.bocha} tavily=${health.channels?.tavily}` : '无法解析 JSON')
  check(Boolean(health) && health.sessionState === 'client-carried' && Number(health.contextVersion) >= 1,
    '③b /api/health 声明无状态会话（sessionState=client-carried + contextVersion）',
    health ? `sessionState=${health.sessionState} contextVersion=${health.contextVersion}` : '—')

  // ---- ④ 首页含 API 基地址 ----
  const apiOk = home.text.includes('/api/chat') && home.text.includes('/api/health')
  check(apiOk, '④ 首页含 API 基地址（/api/chat + /api/health）→ 前端连得上后端',
    apiOk ? '两者都在' : `chat=${home.text.includes('/api/chat')} health=${home.text.includes('/api/health')}`)

  // ---- ⑤ P0：同一 sessionId 三步，靠前端携带的 context 承接 ----
  const sid = 'verify-' + Date.now()
  const steps = ['北京有哪些医院设有卒中中心', '换成发热门诊', '第二家的地址和官方预约入口呢']
  const rs = []
  let ctx = null
  let chainErr = ''
  for (const msg of steps) {
    try {
      const r = await fetch(B + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ message: msg, sessionId: sid, context: ctx }),
      })
      const j = await r.json()
      ctx = j.context || ctx
      rs.push(j)
    } catch (e) { chainErr = String(e && e.message ? e.message : e); rs.push(null) }
  }
  say('\n  [P0 三步实测]')
  rs.forEach((j, i) => say(`    第${i + 1}步「${steps[i]}」 status=${j ? j.status : '(请求失败)'} query=${JSON.stringify(j && j.query)} contextSource=${j && j.contextSource} 回传轮次=${j && j.context ? (j.context.turns || []).length : '-'}`))
  const [r1, r2, r3] = rs
  const chainOk = !chainErr && r1 && r2 && r3
    && r1.status === 'ok' && r2.status === 'ok' && r3.status === 'ok'
    && /北京/.test(r2.query || '') && /发热门诊/.test(r2.query || '')
    && (r2.hospitals || []).length >= 2
    && String(r3.query || '').startsWith(r2.hospitals[1].name)
  check(chainOk, '⑤ P0 同一会话三步（带 context 跨实例承接：城市不丢 + 能解析"第二家"）',
    chainErr || `${r1 && r1.status}→${r2 && r2.status}→${r3 && r3.status}｜第2步=${r2 && r2.query}｜第3步=${r3 && r3.query}`)

  // ---- ⑥ /api/history 带 context 回显真实轮次 ----
  let hist = null
  if (r3 && r3.context) {
    const b64 = Buffer.from(JSON.stringify(r3.context), 'utf8').toString('base64url')
    try { hist = JSON.parse((await getText(`${B}/api/history?sessionId=${encodeURIComponent(sid)}&context=${b64}`)).text) } catch { hist = null }
  }
  check(Boolean(hist) && hist.exists === true && (hist.turns || []).length === 6 && /client-context/.test(String(hist.source)),
    '⑥ /api/history 带 context 回显真实轮次（不再是 exists=false）',
    hist ? `exists=${hist.exists} 轮次=${(hist.turns || []).length} source=${hist.source} city=${hist.city}` : '未取到（上一步失败）')

  // ---- ⑦ /api/stats 口径如实标注 ----
  let st = null
  try { st = JSON.parse((await getText(B + '/api/stats')).text) } catch { st = null }
  check(Boolean(st) && st.countScope === 'single-instance' && String(st.countScopeNote || '').length > 20
    && !/sk-|tvly-|nfp_/.test(JSON.stringify(st)),
    '⑦ /api/stats 如实标注"单实例计数"口径（不冒充全局统计，且不含密钥）',
    st ? `countScope=${st.countScope} instanceId=${st.instanceId}` : '无法解析 JSON')

  const pass = results.filter((r) => r.ok).length
  const fail = results.length - pass
  say(`\n===== 自检结果：通过 ${pass} / 失败 ${fail} =====`)
  if (fail) {
    say('未通过项：')
    for (const r of results.filter((x) => !x.ok)) say(`  ❌ ${r.label} ｜ ${r.detail}`)
  }
  return { pass, fail, results }
}

// 直接执行时：打印报告并以退出码反映结果
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.BASE || DEFAULT_BASE
  try {
    const { fail } = await verifyDeploy(base)
    process.exitCode = fail ? 1 : 0
  } catch (e) {
    console.error('❌ 自检脚本异常：', e && e.message ? e.message : e)
    process.exitCode = 1
  }
}
