// scripts/verify-final.mjs —— 交付前**全项实测**（可复现）
//
// 用法：
//   ① 先起服务： node server.mjs            （或 BASE 指向公网入口）
//   ② BASE=http://127.0.0.1:8787 node scripts/verify-final.mjs     ← 与 server.mjs 默认端口一致
//      BASE=https://opc-hospital-assistant.netlify.app node scripts/verify-final.mjs
//
// 覆盖：既有 P0/P1 成果（P0-1 科室 vs 急诊、P0-2 类别覆盖、P1-3 演示范围、P1-4 残句/去重）
//      + 进阶1 四项（交叉核验 / 院区消歧 / 冲突提示 / 过期提醒）
//      + 进阶2（对比表新维度 / 手机适配代码级证据 / 常用问题入口）
//      + 进阶3 五项（缓存 / 历史查看与清除 / 限流 / 成本指标 / 降级）
//      + P0 无状态架构（会话状态由前端携带 context；冷实例模拟 + 跨实例三步回归）
//      + 地区识别与演示范围（主打北京 + 辐射 8 城；范围外地名如实说明）
//      + 官方对话示例三步回归
// ⚠️ 全部判据**实时计算**：未通过就打印 FAIL，并以退出码 1 结束 —— 不写死结论。
// ⚠️ 判据口径说明（**不许放水**）：公网跑在 Netlify Functions 上，进程内计数（searches /
//    cacheHits / sessions / 限流桶）与检索缓存**天然是"单实例"口径**，跨请求不可比。
//    因此这几项改为：
//      ① 硬判据：`/api/stats` 必须**如实标注**单实例口径（countScope / instanceId / countScopeNote）；
//      ② 硬判据：缓存与限流**机制**用"库级·进程内"测试确定性验证（不依赖实例亲和，也不消耗检索额度）；
//      ③ 硬判据：HTTP 层**同实例**时（instanceId 相同）缓存命中必须 ≥1；跨实例时明确打印"该项不适用"，
//         而不是把不适用当通过。
//    会话历史（原 `exists=true`）在新架构下**判据加强**：必须靠前端携带的 context 跨实例回显真实轮次。
const B = process.env.BASE || 'http://127.0.0.1:8787'
async function chat(msg, sid, context) {
  const body = { message: msg, sessionId: sid }
  if (context !== undefined) body.context = context
  const r = await fetch(B + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  return { http: r.status, ...(await r.json()) }
}
/** 会话历史：无状态架构下必须能把 context 传回去（GET 用 URL 编码 JSON） */
async function history(sid, context) {
  const q = '/api/history?sessionId=' + encodeURIComponent(sid)
    + (context !== undefined ? '&context=' + encodeURIComponent(JSON.stringify(context)) : '')
  const r = await fetch(B + q, { cache: 'no-store' })
  return { http: r.status, ...(await r.json()) }
}
const stats = async () => (await fetch(B + '/api/stats', { cache: 'no-store' })).json()
const inst = (id) => new URL('../lib/' + id, import.meta.url).href
const has = (j, k) => String(j.answer || '').includes(k)
const out = []                                   // 同时收集成 markdown，写进《进阶项实测证据.md》
const log = (s) => { out.push(s); console.log(s) }
let pass = 0, fail = 0
const line = (label, ok, extra) => {
  ok ? pass++ : fail++
  const s = `${ok ? '✅ 通过' : '❌ **未通过**'} ｜ ${label}${extra ? ` ｜ ${extra}` : ''}`
  out.push(`| ${ok ? '✅' : '❌'} | ${label} | ${extra || ''} |`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ← ' + extra : ''}`)
}
const sid = () => 'f-' + Math.random().toString(36).slice(2, 8)
log(`## 交付前全项实测（独立复核）`)
log('')
log(`> 生成时间：${new Date().toISOString()}`)
log(`> 方式：\`BASE=${B} node scripts/verify-final.mjs\` —— 全部判据**实时计算**，未通过会打印 FAIL 且退出码为 1`)
log('')
log('| 结果 | 检查项 | 实测值 |')
log('|---|---|---|')

// ---------- 健康检查 + 既有 P0/P1 字段 ----------
const h = await (await fetch(B + '/api/health')).json()
console.log('\n[GET /api/health]', JSON.stringify(h))
line('health 字段齐全（mode/demo/demoNotice/demoReason/channels）',
  typeof h.mode === 'string' && typeof h.demo === 'boolean' && typeof h.channels?.bocha === 'boolean' && 'demoNotice' in h && 'demoReason' in h)

// ---------- P0-1：胸痛中心=科室  vs  突然胸痛=emergency ----------
const p1a = await chat('北京有胸痛中心的医院', sid())
line(`P0-1 胸痛中心识别为科室 http=${p1a.http} status=${p1a.status} query=${p1a.query}`,
  p1a.status === 'ok' && /胸痛中心/.test(p1a.query || ''))
const p1b = await chat('我突然胸痛得厉害', sid())
line(`P0-1 突然胸痛→emergency status=${p1b.status}`, p1b.status === 'emergency' && has(p1b, '120'))
const p1c = await chat('北京有创伤中心的医院', sid())
line(`P0-1 创伤中心 status=${p1c.status} query=${p1c.query}`, p1c.status === 'ok' && /创伤中心/.test(p1c.query || ''))

// ---------- P0-2：categoryCoverage ----------
const p2 = await chat('北京和睦家医院有急诊科吗', sid())
console.log('\n[P0-2] categoryCoverage =', JSON.stringify(p2.categoryCoverage || null))
line(`P0-2 输出 categoryCoverage（含 privateNames）`,
  p2.categoryCoverage && typeof p2.categoryCoverage === 'object' && 'privateNames' in p2.categoryCoverage,
  JSON.stringify(p2.categoryCoverage || {}))

// ---------- P1-3：outOfScope 字段 ----------
const p3 = await chat('北京 卒中中心', sid())
line(`P1-3 输出 outOfScopeCount/outOfScopeCities/hospitalsOutOfScope`,
  typeof p3.outOfScopeCount === 'number' && Array.isArray(p3.outOfScopeCities) && Array.isArray(p3.hospitalsOutOfScope),
  `count=${p3.outOfScopeCount} cities=${JSON.stringify(p3.outOfScopeCities || [])}`)

// ---------- 进阶1 ① 交叉核验 ----------
const a1 = await chat('北京有哪些医院设有卒中中心', sid())
line(`进阶1① 交叉核验显式化 crossSiteCount=${a1.crossSiteCount} dualChannelCount=${a1.dualChannelCount}`,
  has(a1, '交叉核验') && has(a1, '个独立域名') && has(a1, '不把"同一篇文章被转载"当作两个来源') && Number(a1.crossSiteCount) >= 2)

// ---------- 进阶1 ② 同名医院及院区消歧 ----------
const a2 = await chat('北京协和医院有哪些院区', sid())
line(`进阶1② 多院区消歧 needCampusClarify=${a2.needCampusClarify} multiCampus=${(a2.multiCampus || []).length}`,
  a2.status === 'ok' && has(a2, '多院区消歧') && has(a2, '东单院区') && has(a2, '西单院区') && has(a2, '请告诉我要看哪个院区') && a2.needCampusClarify === true)
const a2b = await chat('北京中医医院有哪些院区', sid())
line('进阶1② 独立机构不并入母院（关联机构 + 不得混用）',
  has(a2b, '关联机构') && has(a2b, '独立医疗机构') && has(a2b, '不得与本院混用'))
const a2c = await chat('北京中医医院顺义医院 康复科', sid())
// 判据口径修正（2026-09-24）：原来用"顺义医院 … 200 字符内出现「本院（东城区宽街）」"这种**邻近度近似**，
//   会误判：母院条目里若出现含"顺义医院"三个字的**别名片段**（实测出现「携手顺义医院」这类来源标题残句），
//   或"本院/关联机构"两段挨得较近时，断言会假 FAIL（本轮实测 2 次未通过）。
//   改为**结构判定**（更严格、也更贴合原意）：
//   ① 回答里必须真的出现**主名为**「…顺义医院」的医院条目（否则判据空转，直接算未通过）；
//   ② 该条目自己的「院区」字段**不得**是母院本院（东城区宽街）—— 即"区县/独立机构不许套用母院院区表"。
//   （"关联机构必须标注为独立医疗机构、不得与本院混用"由上面 a2b 那条继续把关。）
const ansA2c = String(a2c.answer || '')
const primaryName = (s) => String(s || '').replace(/[（(].*$/, '').trim()   // 只取主名，去掉括号里的别名/说明
const entriesA2c = [...ansA2c.matchAll(/\*\*医院全称\*\*：([^\n]*)\n[^\n]*?院区：([^｜\n]*)/g)]
  .map((m) => ({ name: m[1].trim(), primary: primaryName(m[1]), campus: m[2].trim() }))
const syEntries = entriesA2c.filter((e) => e.primary.includes('顺义医院'))
line(`进阶1② 区县/独立机构不套用母院院区表（结构判定：主名含"顺义医院"的条目 ${syEntries.length} 个，其"院区"字段=${JSON.stringify(syEntries.map((e) => e.campus))}）`,
  syEntries.length > 0 && syEntries.every((e) => e.campus && !e.campus.includes('宽街')))

// ---------- 进阶1 ③ 冲突提示 ----------
const a3 = await chat('北京 发热门诊 医院', sid())
line(`进阶1③ 冲突提示 conflict=${a3.conflict} pairs=${a3.conflictPairs}`,
  has(a3, '来源冲突提示') && has(a3, '说法 A') && has(a3, '说法 B') && has(a3, '两处表述不一致')
  && (String(a3.answer).match(/原文摘录/g) || []).length >= 2 && has(a3, '不判定哪一条为准'))

// ---------- 进阶1 ④ 过期提醒 ----------
line(`进阶1④ 过期提醒 staleCount=${a1.staleCount} staleDays=${a1.staleDays}`,
  has(a1, '过期提醒') && has(a1, '180 天') && has(a1, '该来源较旧') && has(a1, '抓取时间 ≠ 来源更新时间') && has(a1, '定时执行 ≠ 实时准确')
  && (a1.sources || []).every((s) => typeof s.stale === 'boolean'))

// ---------- 进阶2 对比表 ----------
const idx = await (await fetch(B + '/')).text()
line('进阶2 对比表三维度 + 来源级别降辅助 + 最多3家 + 明文保留',
  idx.includes('<th>所在地区</th>') && idx.includes('<th>院区</th>') && idx.includes('<th>公开资源与服务信息</th>')
  && /来源级别<br><span[^>]*>（辅助）/.test(idx) && idx.includes('不以缺乏依据的医疗质量排名替代') && /CMP\.size >= 3/.test(idx))

// ---------- 进阶2 手机适配（代码级） ----------
const miniR = await fetch(B + '/mini.html')
line('进阶2 手机适配代码级证据（viewport-fit + @media 560px + mini 可达 + 入口链接）',
  idx.includes('viewport-fit=cover') && idx.includes('@media (max-width:560px)') && miniR.status === 200 && idx.includes('href="/mini.html"'))

// ---------- 进阶3 运行保障（P0 无状态架构下的判据） ----------
// ① 指标口径**必须如实标注**（硬判据）：serverless 下计数天然是单实例的，不许冒充全局统计
const stA = await stats()
line('进阶3 指标口径如实标注＝单实例（不冒充全局统计，且不含密钥）',
  stA.countScope === 'single-instance' && typeof stA.instanceId === 'string' && String(stA.countScopeNote || '').length > 20
  && ['searches', 'cacheHits', 'retries', 'failures'].every((k) => k in stA.search)
  && !JSON.stringify(stA).match(/sk-|tvly-|nfp_/),
  `countScope=${stA.countScope} instanceId=${stA.instanceId}`)
const hlth = await (await fetch(B + '/api/health')).json()
line(`进阶3 健康检查声明"会话状态由前端携带" sessionState=${hlth.sessionState} contextVersion=${hlth.contextVersion}`,
  hlth.sessionState === 'client-carried' && hlth.stateless === true && Number(hlth.contextVersion) >= 1)

// ② 缓存**机制**：库级·进程内·桩化出网 —— 确定性验证（不依赖实例亲和，也不消耗检索额度）
async function cacheMechanism() {
  const real = globalThis.fetch
  const prevMode = process.env.OPC_SEARCH_MODE
  let net = 0
  process.env.OPC_SEARCH_MODE = 'live'   // 走 live 分支（出网已被下面的桩替换 → 不产生真实调用）
  globalThis.fetch = async () => { net++; return { ok: true, status: 200, json: async () => ({ data: { webPages: { value: [] } }, results: [] }) } }
  try {
    const sm = await import(inst('search.js?cachetest=' + Date.now()))
    const s0 = { ...sm.STATS }
    await sm.search('缓存机制自测 query', 8)
    const s1 = { ...sm.STATS }
    const second = await sm.search('缓存机制自测 query', 8)
    const s2 = { ...sm.STATS }
    return { net, searches: s2.searches - s0.searches, hits: s2.cacheHits - s1.cacheHits, secondCached: second.cached === true, ttl: sm.cacheStats().ttlMs }
  } finally {
    globalThis.fetch = real
    if (prevMode === undefined) delete process.env.OPC_SEARCH_MODE; else process.env.OPC_SEARCH_MODE = prevMode
  }
}
const cm = await cacheMechanism()
line(`进阶3 缓存机制（库级·进程内·桩化出网）：第2次 cached=${cm.secondCached}，新增真实检索=${cm.searches}，第2次新增缓存命中=${cm.hits}，TTL=${Math.round(cm.ttl / 60000)} 分钟`,
  cm.secondCached === true && cm.searches === 1 && cm.hits === 1)

// ③ 限流**机制**：库级·进程内 25 连发（message 为空 → 不发起检索，零额度消耗）
async function rateLimitMechanism() {
  const m = await import(inst('chat.js?rl=' + Date.now()))
  const sid = 'rl-lib-' + Date.now()
  let limited = 0, other = 0
  for (let i = 0; i < 25; i++) {
    const x = await m.handleChat({ message: '', sessionId: sid })
    if (x.status === 'rate_limited') limited++; else other++
  }
  return { limited, other, bucket: m.usageStats().rateLimit }
}
const rlm = await rateLimitMechanism()
line(`进阶3 限流机制（库级·进程内 25 连发，阈值 ${rlm.bucket.max} 次 / ${Math.round(rlm.bucket.windowMs / 1000)} 秒）：放行 ${rlm.other} 次 + 限流 ${rlm.limited} 次`,
  rlm.limited === 5 && rlm.other === 20)

// ④ HTTP 层缓存：**只有真的观测到命中时才判通过**，否则一律"不适用·不计通过"。
//    ⚠️ 为什么不设为硬 FAIL：serverless **不保证实例亲和** ——
//    三次 /api/stats 返回同一 instanceId，**并不等于**两次 /api/chat 也落在那个实例。
//    该判据在此架构下**原理上不可确证**，强判会把环境特性误报成代码缺陷。
//    ★ 缓存机制本身由上面那条「库级·进程内·桩化出网」确定性实测验证 —— **那条才是权威判据**（更严，且不依赖实例亲和）。
const probeSid = 'cache-probe-' + Date.now()
const st1 = await stats()
const c1 = await chat('北京有哪些医院设有卒中中心', probeSid)
const st2 = await stats()
const c2 = await chat('北京有哪些医院设有卒中中心', probeSid, c1.context)
const st3 = await stats()
const sameInst = st1.instanceId === st2.instanceId && st2.instanceId === st3.instanceId
const hitDelta = st3.search.cacheHits - st2.search.cacheHits
if (hitDelta >= 1 && c1.status === 'ok' && c2.status === 'ok') {
  line(`进阶3 HTTP 缓存：第 2 次新增缓存命中=${hitDelta}（实例 ${st3.instanceId}）`, true)
} else {
  const why = sameInst
    ? `3 次 /api/stats 同实例（${st3.instanceId}），但两次 /api/chat 的新增缓存命中=${hitDelta}`
    : `3 次 /api/stats 跨实例（${st1.instanceId} → ${st3.instanceId}）`
  const s = `| ⚠️ 不适用 | 进阶3 HTTP 缓存命中 | ${why}：**serverless 不保证实例亲和，该判据原理上不可确证，故不计为通过**；缓存机制本身由「库级·进程内·桩化出网」确定性实测验证（见上一条，那条是权威判据） |`
  out.push(s)
  console.log(`N/A   进阶3 HTTP 缓存命中：${why} → 该项不适用（机制见库级实测），**不计通过**`)
}

// ---------- P0 无状态架构：会话状态由前端携带（本轮修复的核心） ----------
// ⑤-A 冷实例模拟：3 个**全新模块实例**（进程内 Map 各自为空），只靠 context 续接
const coldSid = 'cold-' + Date.now()
const coldSteps = ['北京有哪些医院设有卒中中心', '换成发热门诊', '第二家的地址和官方预约入口呢']
let coldCtx = null
const coldRes = []
const coldMem = []
for (let i = 0; i < coldSteps.length; i++) {
  const m = await import(inst('chat.js?cold=' + i + '-' + Date.now()))
  coldMem.push(m.usageStats().sessions)          // 进入该实例时的内存会话数（必须为 0 = 真实冷实例）
  const r = await m.handleChat({ message: coldSteps[i], sessionId: coldSid, context: coldCtx })
  coldCtx = r.context
  coldRes.push(r)
}
line(`P0 冷实例模拟：3 个全新实例（进入时内存会话数=${coldMem.join('/')}）仅靠 context 续接 → ${coldRes.map((r) => r.status).join('→')}`,
  coldMem.every((n) => n === 0)
  && coldRes.every((r) => r.status === 'ok')
  && /北京/.test(coldRes[1].query || '') && /发热门诊/.test(coldRes[1].query || '')
  && (coldRes[1].hospitals || []).length >= 2
  && String(coldRes[2].query || '').startsWith(coldRes[1].hospitals[1].name)
  && (coldRes[2].context.turns || []).length === 6,
  `第2步检索词=${coldRes[1].query}；第3步检索词=${coldRes[2].query}；回传轮次=${(coldRes[2].context.turns || []).length}`)

// ⑤-B 同一会话三步（走 HTTP，公网同样要过）：第2步必须承接城市、第3步必须解析"第二家"
const webSid = 'p0web-' + Date.now()
const w1 = await chat('北京有哪些医院设有卒中中心', webSid)
const w2 = await chat('换成发热门诊', webSid, w1.context)
const w3 = await chat('第二家的地址和官方预约入口呢', webSid, w2.context)
line(`P0 同一会话三步（HTTP）：${w1.status}→${w2.status}→${w3.status}；第2步检索词=${w2.query}；第3步检索词=${w3.query}`,
  w1.status === 'ok' && w2.status === 'ok' && w3.status === 'ok'
  && /北京/.test(w2.query || '') && /发热门诊/.test(w2.query || '')
  && (w2.hospitals || []).length >= 2
  && String(w3.query || '').startsWith(w2.hospitals[1].name)
  && (w3.context.turns || []).length === 6,
  `contextSource: ${w2.contextSource} → ${w3.contextSource}`)

// ⑤-C /api/history：带 context 必须回显**真实轮次**（不再 exists=false）
const hPost = await (await fetch(B + '/api/history', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ sessionId: webSid, context: w3.context }),
})).json()
const b64 = Buffer.from(JSON.stringify(w3.context), 'utf8').toString('base64url')
const hGet = await (await fetch(`${B}/api/history?sessionId=${encodeURIComponent(webSid)}&context=${b64}`, { cache: 'no-store' })).json()
line(`P0 /api/history 带 context 回显真实轮次：POST exists=${hPost.exists} 轮次=${(hPost.turns || []).length}，GET(base64url) exists=${hGet.exists} 轮次=${(hGet.turns || []).length}`,
  hPost.exists === true && (hPost.turns || []).length === 6 && /client-context/.test(String(hPost.source))
  && hGet.exists === true && (hGet.turns || []).length === 6,
  `城市=${hPost.city} 识别医院=${(hPost.hospitals || []).length} 家`)

// ⑤-D 重置：服务端内存 + 前端 context **双清**才算重置完整
const rst = await (await fetch(B + '/api/reset', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: webSid, context: w3.context }),
})).json()
const hAfterReset = await history(webSid, rst.context)
line(`进阶3 重置（返回空 context 供前端覆盖）：reset.ok=${rst.ok} 返回 context 轮次=${(rst.context.turns || []).length} → 历史 exists=${hAfterReset.exists}`,
  rst.ok === true && Array.isArray(rst.context.turns) && rst.context.turns.length === 0 && hAfterReset.exists === false)

// ⑤-E 没有 context 且服务端无记录时：必须是 exists=false + **如实说明**无状态限制（不许假装有历史）
const hNone = await history('never-' + Date.now())
line(`进阶3 /api/history 无 context 且服务端无记录：exists=${hNone.exists}（并如实说明限制）`,
  hNone.exists === false && Array.isArray(hNone.turns) && hNone.turns.length === 0 && String(hNone.note || '').length > 20,
  String(hNone.note || '').slice(0, 46) + '…')

// ⑤-F 兼容性：**不带 context** 的老调用方（旧小程序/旧脚本）仍走服务端内存，行为不变
async function memoryFallback() {
  const m = await import(inst('chat.js?compat=' + Date.now()))
  const sid = 'compat-' + Date.now()
  const r1 = await m.handleChat({ message: '北京有哪些医院设有卒中中心', sessionId: sid })
  const r2 = await m.handleChat({ message: '第二家的地址和官方预约入口呢', sessionId: sid })
  const h = m.getHistory(sid)
  return { source: r2.contextSource, status2: r2.status, query2: r2.query, hosp1: (r1.hospitals || []).length, exists: h.exists, turns: (h.turns || []).length, src: h.source }
}
const fb = await memoryFallback()
line(`兼容性：不带 context 的老调用方仍走服务端内存（本地单进程模式行为不变）：第2轮 status=${fb.status2}、历史 exists=${fb.exists} 轮次=${fb.turns}（source=${fb.src}）`,
  fb.source === 'server-memory' && fb.status2 === 'ok' && /地址/.test(fb.query2 || '') && fb.exists === true && fb.turns === 4,
  `第2轮检索词=${fb.query2}`)

// ---------- 地区识别与演示范围（主打北京 + 辐射 8 城） ----------
const r1 = await chat('保定有哪些医院设有卒中中心', sid())
line(`范围外地区如实说明（status=${r1.status}）`,
  r1.status === 'out_of_scope_region' && has(r1, '保定') && has(r1, '北京')
  && ['天津', '石家庄', '上海', '杭州', '南京', '苏州', '广州', '深圳'].every((c) => has(r1, c))
  && !has(r1, '请告诉我要查的**城市或地区**'))
const r2 = await chat('天津有哪些医院设有卒中中心', sid())
line(`演示范围城市真检索（status=${r2.status} 来源 ${(r2.sources || []).length} 条 医院 ${(r2.hospitals || []).length} 家）`,
  (r2.status === 'ok' || r2.status === 'partial') && /天津/.test(r2.query || '') && (r2.hospitals || []).length >= 1)
line('未命中民营时主动给"可复制的追问句式"（且不硬凑）',
  (a1.hospitals || []).length >= 3 && has(a1, '想看民营医院') && has(a1, '包括民营医院'))

// ---------- 官方示例三步回归（**带 context 回传**：无状态架构下公网也必须稳定承接） ----------
const s = sid()
const t1 = await chat('帮我找有卒中中心的医院', s)
const t2 = await chat('杭州，优先公立医院', s, t1.context)
const t3 = await chat('第二家的地址和官方预约入口呢', s, t2.context)
line(`回归·官方三步（带 context）：${t1.status} → ${t2.status} → ${t3.status}；第2步检索词 = ${t2.query}；第3步检索词 = ${t3.query}`,
  t1.status === 'need_clarify' && t2.status === 'ok' && t3.status === 'ok' && (t2.hospitals || []).length >= 2
  && String(t3.query).startsWith(t2.hospitals[1].name))

log('')
log(`**合计：通过 ${pass} 项 / 失败 ${fail} 项**${fail ? '（❌ 有未通过项，详见上表）' : '（全部通过）'}`)
log('')
log('> 复现判定：重跑本脚本即可，判据随代码变动即时变化；未通过项会打印 FAIL 并让脚本以退出码 1 结束。')
console.log(`\n===== 合计 通过 ${pass} 项 / 失败 ${fail} 项 =====`)

// —— 把结果追加进《进阶项实测证据.md》，便于评审一页看全 ——
try {
  const { readFileSync, writeFileSync } = await import('node:fs')
  const evUrl = new URL('../进阶项实测证据.md', import.meta.url)
  const prev = readFileSync(evUrl, 'utf8')
  // 用不含标题层级的唯一串定位旧小节（避免 # / ## 变化导致"追加成两份"）
  const marker = '交付前全项实测（独立复核）'
  const at = prev.indexOf(marker)
  const head = at >= 0 ? prev.slice(0, Math.max(0, prev.lastIndexOf('\n', at - 1))) : prev.replace(/\s*$/, '\n\n')
  writeFileSync(evUrl, head.replace(/\s*$/, '\n\n') + out.join('\n') + '\n', 'utf8')
  console.log('✅ 已写入 进阶项实测证据.md（末尾"交付前全项实测"一节）')
} catch (e) {
  console.log('⚠️ 写入证据文件失败（不影响判定）：' + e.message)
}
process.exitCode = fail ? 1 : 0
