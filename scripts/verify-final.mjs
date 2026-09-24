// scripts/verify-final.mjs —— 交付前**全项实测**（可复现）
//
// 用法：
//   ① 先起服务： node server.mjs            （或 BASE 指向公网入口）
//   ② BASE=http://127.0.0.1:8891 node scripts/verify-final.mjs
//      BASE=https://opc-hospital-assistant.netlify.app node scripts/verify-final.mjs
//
// 覆盖：既有 P0/P1 成果（P0-1 科室 vs 急诊、P0-2 类别覆盖、P1-3 演示范围、P1-4 残句/去重）
//      + 进阶1 四项（交叉核验 / 院区消歧 / 冲突提示 / 过期提醒）
//      + 进阶2（对比表新维度 / 手机适配代码级证据 / 常用问题入口）
//      + 进阶3 五项（缓存 / 历史查看与清除 / 限流 / 成本指标 / 降级）
//      + 地区识别与演示范围（主打北京 + 辐射 8 城；范围外地名如实说明）
//      + 官方对话示例三步回归
// ⚠️ 全部判据**实时计算**：未通过就打印 FAIL，并以退出码 1 结束 —— 不写死结论。
const B = process.env.BASE || 'http://127.0.0.1:8891'
async function chat(msg, sid) {
  const r = await fetch(B + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ message: msg, sessionId: sid }),
  })
  return { http: r.status, ...(await r.json()) }
}
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
line('进阶1② 区县/独立机构不套用母院院区表',
  !/顺义医院[\s\S]{0,200}本院（东城区宽街）/.test(String(a2c.answer || '')))

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

// ---------- 进阶3 运行保障 ----------
const st1 = await (await fetch(B + '/api/stats')).json()
const c1 = await chat('北京有哪些医院设有卒中中心', 'cache-probe')
const st2 = await (await fetch(B + '/api/stats')).json()
const c2 = await chat('北京有哪些医院设有卒中中心', 'cache-probe')
const st3 = await (await fetch(B + '/api/stats')).json()
line(`进阶3 缓存：第2次新增缓存命中=${st3.search.cacheHits - st2.search.cacheHits}`,
  (st3.search.cacheHits - st2.search.cacheHits) >= 1 && (c1.status === 'ok' && c2.status === 'ok'))
const hist = await (await fetch(B + '/api/history?sessionId=cache-probe')).json()
line(`进阶3 历史查看 exists=${hist.exists} 轮次=${(hist.turns || []).length}`, hist.exists === true && (hist.turns || []).length > 0)
let limited = 0
const rl = 'rl-' + Date.now()
for (let i = 0; i < 25; i++) { const x = await chat('北京测试', rl); if (x.status === 'rate_limited') limited++ }
line(`进阶3 限流（25 连发触发 ${limited} 次 rate_limited）`, limited > 0)
const rst = await (await fetch(B + '/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'cache-probe' }) })).json()
const hist2 = await (await fetch(B + '/api/history?sessionId=cache-probe')).json()
line(`进阶3 历史清除 exists=${hist2.exists}（reset.ok=${rst.ok}）`, hist2.exists === false)
line('进阶3 /api/stats 含 searches/cacheHits/retries/failures 且不含密钥',
  ['searches', 'cacheHits', 'retries', 'failures'].every((k) => k in st3.search) && !JSON.stringify(st3).match(/sk-|tvly-|nfp_/))

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

// ---------- 官方示例三步回归 ----------
const s = sid()
const t1 = await chat('帮我找有卒中中心的医院', s)
const t2 = await chat('杭州，优先公立医院', s)
const t3 = await chat('第二家的地址和官方预约入口呢', s)
line(`回归·官方三步：${t1.status} → ${t2.status} → ${t3.status}；第3步检索词 = ${t3.query}`,
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
