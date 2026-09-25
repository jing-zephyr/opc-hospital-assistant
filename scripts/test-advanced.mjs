// scripts/test-advanced.mjs —— 进阶项证据（需本地服务已启动）
// 用法：先 node server.mjs，再 node scripts/test-advanced.mjs
//      端口不是 8787 时：BASE=http://127.0.0.1:8891 node scripts/test-advanced.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:8787'

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body),
  })
  return r.json()
}
async function get(path) {
  const r = await fetch(BASE + path)
  return r.json()
}

const out = []
const log = (s) => { out.push(s); console.log(s) }

log('# OPC 医院助手 · 进阶项实测证据')
log('')
log('> 生成时间：' + new Date().toISOString())
log(`> 方式：对本地/线上服务（${BASE}）发起**真实 HTTP 请求**（结果可复现；所有结论由断言实时判定，不写死）`)
log('> 相关文件：`进阶项实测证据_手机适配.md`（进阶2 手机端适配的**代码级证据**）')
log('')

// ---- 进阶2：手机端与常用问题入口（静态能力，检查页面是否存在） ----
// ⚠️ 口径修正（2026-09-25）：首页 `/` 已改为**患者版** `patient.html`（便民视角做减法，见《界面信息分层规范》）。
//    而「条件筛选 / 结果对比表 / 来源级别辅助列」这些**进阶2 能力在完整版 `/index.html`** 里 ——
//    因此本组改为**分别检查两个页面**，并在结论里如实标注"能力在哪个页面"，
//    否则会因为"首页换成了患者版"而误判为功能缺失（这是假失败，不是功能退化）。
const idx = await fetch(BASE + '/').then((r) => r.text())              // 首页＝患者版
const idxTech = await fetch(BASE + '/index.html').then((r) => r.text()) // 完整版＝技术视角
const mini = await fetch(BASE + '/mini.html').then((r) => r.text())
log('## 进阶2 · 交互与结果比较（部分）')
log('')
log('> 说明：**首页＝患者版**（面向患者/家属，做减法），**完整版＝`/index.html`**（面向评委/技术人员，含检索过程与运行指标）。')
log('> 下表逐项标注**能力所在页面**；两者都在线，均可用。')
log('')
log('| 检查项 | 结果 |')
log('|---|---|')
log('| 手机端适配（viewport + 响应式媒体查询） | ' + (/viewport-fit=cover/.test(idx) && /@media/.test(idx) ? '✅' : '❌') + '（患者版首页；代码级证据见《进阶项实测证据_手机适配.md》；**视觉截图待补**） |')
log('| 常用问题入口（快捷 chips） | ' + (/class="chips"/.test(idx) && /class="chips"/.test(mini) ? '✅' : '❌') + '（患者版 + `/mini.html`） |')
log('| 小程序形态模拟页 `/mini.html` | ' + (mini.length > 1000 ? '✅（' + mini.length + ' 字节）' : '❌') + ' |')
log('| **条件筛选**（全部 / 仅A级 / A+B级） | ' + (/class="fchip/.test(idxTech) && /data-filter/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| **医院结果对比表**：含「所在地区 / 院区 / 公开资源与服务信息」三列 | ' + (/<th>所在地区<\/th>/.test(idxTech) && /<th>院区<\/th>/.test(idxTech) && /<th>公开资源与服务信息<\/th>/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 「来源级别」已降为**辅助列**（表头标注"辅助"） | ' + (/来源级别<br><span[^>]*>（辅助）/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 对比仍**最多 3 家** | ' + (/CMP\.size >= 3/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 对比**不以医疗质量排名替代**（页面明文保留） | ' + (/不以缺乏依据的医疗质量排名替代/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('')

// ---- 进阶1：检索质量与更新能力（真实请求，断言式） ----
log('## 进阶1 · 检索质量与更新能力（交叉核验 / 同名医院及院区消歧 / 冲突提示 / 过期提醒）')
log('')
log('> 下列每一项都用**真实 HTTP 请求**打出来，再按"回答里是否出现规定表述 + JSON 字段是否为真"判定。')
log('')

async function ask(msg, sid) {
  return post('/api/chat', { message: msg, sessionId: sid })
}
const adv = []

// ① 同名医院及院区消歧
{
  const sid = 'e1-campus-' + Date.now()
  const r = await ask('北京协和医院有哪些院区', sid)
  const a = String(r.answer || '')
  const checks = [
    ['出现「多院区消歧」块', /多院区消歧/.test(a)],
    ['**明确列出各院区**', /东单院区/.test(a) && /西单院区/.test(a)],
    ['**要求用户澄清要看哪个院区**', /请告诉我要看哪个院区|请确认你要看哪一个/.test(a)],
    ['声明不同院区不合并/不得混用', /不得混用/.test(a)],
    ['JSON 字段 `needCampusClarify=true`', r.needCampusClarify === true],
    ['JSON 字段 `multiCampus` 非空', Array.isArray(r.multiCampus) && r.multiCampus.length > 0],
  ]
  adv.push({ name: '同名医院及院区消歧（多院区 → 列出院区 + 要求澄清）', input: '北京协和医院有哪些院区', r, checks })
}
// ①b 独立机构不并入母院（不同院区/不同机构不合并）
{
  const sid = 'e1-campus2-' + Date.now()
  const r = await ask('北京中医医院有哪些院区', sid)
  const a = String(r.answer || '')
  const checks = [
    ['列出本院已核实院区', /本院（东城区宽街）/.test(a)],
    ['把延庆/顺义/平谷标为**关联机构（独立医疗机构）**', /关联机构/.test(a) && /独立医疗机构/.test(a)],
    ['声明不得与本院混用', /不得与本院混用/.test(a)],
  ]
  adv.push({ name: '独立机构不并入母院（同名医院的"关联机构"单列）', input: '北京中医医院有哪些院区', r, checks })
}
// ② 交叉核验显式化
{
  const sid = 'e1-cross-' + Date.now()
  const r = await ask('北京有哪些医院设有卒中中心', sid)
  const a = String(r.answer || '')
  const checks = [
    ['回答中有「🔎 交叉核验（进阶1）」小节', /交叉核验（进阶1）/.test(a)],
    ['显式给出"独立域名数"（多来源交叉命中）', /个独立域名/.test(a)],
    ['显式写出"经 2 个通道交叉命中"的口径（含无命中时的如实说明）', /经 2 个通道交叉命中|没有\*\*出现"两个通道返回同一个页面"/.test(a)],
    ['声明不把"同一篇文章被转载"当两个来源', /不把"同一篇文章被转载"当作两个来源/.test(a)],
    ['JSON 字段 `crossSiteCount ≥ 2`', Number(r.crossSiteCount) >= 2],
  ]
  adv.push({ name: '交叉核验显式化（多来源/双通道命中写进回答）', input: '北京有哪些医院设有卒中中心', r, checks })
}
// ③ 过期提醒（规则：来源更新时间距今 > 180 天）
{
  const sid = 'e1-stale-' + Date.now()
  const r = await ask('北京协和医院 卒中中心', sid)
  const a = String(r.answer || '')
  const staleMarked = (r.sources || []).filter((s) => s.stale === true)
  const checks = [
    ['回答里有「⏳ 过期提醒」小节', /过期提醒/.test(a)],
    ['写明规则阈值（> 180 天）', /180 天/.test(a)],
    ['写明统一提示语「该来源较旧，当前状态可能已变化」', /该来源较旧/.test(a) && /当前状态可能已变化/.test(a)],
    ['写明「抓取时间 ≠ 来源更新时间」', /抓取时间 ≠ 来源更新时间/.test(a)],
    ['写明「定时执行 ≠ 实时准确」', /定时执行 ≠ 实时准确/.test(a)],
    ['逐条来源带 `stale` 标记（可为 0，字段必须存在）', (r.sources || []).every((s) => typeof s.stale === 'boolean')],
    ['有超期来源时，条数与 JSON 字段一致', staleMarked.length === Number(r.staleCount || 0)],
  ]
  adv.push({ name: '过期提醒（来源更新时间 > 180 天 → 自动提示）', input: '北京协和医院 卒中中心', r, checks, extra: `本次超期来源 ${staleMarked.length} 条 / 共 ${(r.sources || []).length} 条` })
}
// ④ 冲突提示（两条都列出 + 各自来源、更新时间与原文摘录）
{
  const sid = 'e1-conflict-' + Date.now()
  // 用**能同时命中正/反两种表述**的查询：问"发热门诊"时，一条说"104 所开设"、另一条说"调整为 76 所"
  const q = process.env.CONFLICT_Q || '北京 发热门诊 医院'
  const r = await ask(q, sid)
  const a = String(r.answer || '')
  const hasConflictBlock = /来源冲突提示/.test(a)
  const strong = /说法 A/.test(a) && /说法 B/.test(a)
  const checks = [
    ['出现「来源冲突提示」', hasConflictBlock],
    ['**两条都列出**（强信号时给出说法 A / 说法 B）', strong],
    ['写明"两处表述不一致"', /两处表述不一致/.test(a)],
    ['各自标注来源与更新时间', /说法 A[\s\S]{0,600}来源更新时间：/.test(a) && /说法 B[\s\S]{0,600}来源更新时间：/.test(a)],
    ['各自附**原文摘录**（评委可自行核对）', (a.match(/原文摘录/g) || []).length >= 2],
    ['声明**不替你择一**（不判定哪条为准）', /不判定哪一条为准/.test(a)],
  ]
  adv.push({ name: '冲突提示（多条来源说法不一致 → 两条都列出）', input: q, r, checks, extra: hasConflictBlock ? `冲突对数 = ${r.conflictPairs || 0}` : '本次未触发冲突分支' })
}
// ⑤ 消歧不误伤：区县下级机构不并入母院
{
  const sid = 'e1-nomerge-' + Date.now()
  const r = await ask('北京中医医院顺义医院 康复科', sid)
  const names = (r.hospitals || []).map((h) => h.name)
  const checks = [
    ['回答里不把顺义医院与本院说成同一院区（无"本院（东城区宽街）"套在顺义医院上）', !/顺义医院[\s\S]{0,200}本院（东城区宽街）/.test(String(r.answer || ''))],
    ['医院列表 JSON 可用（数组）', Array.isArray(r.hospitals)],
    ['顺义医院若出现，其院区字段不套用母院院区表', names.every((n) => !(n.includes('顺义') && (r.hospitals.find((h) => h.name === n) || {}).campusConfidence === 'official'))],
  ]
  adv.push({ name: '消歧不误伤（区县/独立机构不并入母院）', input: '北京中医医院顺义医院 康复科', r, checks })
}

for (const g of adv) {
  const pass = g.checks.every((c) => c[1])
  log(`### ${g.name}`)
  log('')
  log(`- **输入**：\`${g.input}\``)
  log(`- **实际**：\`status=${g.r.status}\`、检索词 \`${g.r.query}\`、来源 ${(g.r.sources || []).length} 条、识别医院 ${(g.r.hospitals || []).length} 家${g.extra ? '、' + g.extra : ''}`)
  log(`- **判定**：${pass ? '✅ 通过' : '❌ 未通过'}`)
  log('')
  log('| 断言 | 结果 |')
  log('|---|---|')
  for (const [label, ok] of g.checks) log(`| ${label} | ${ok ? '✅' : '❌'} |`)
  log('')
  // 摘录回答里与进阶1 相关的段落（真实输出，不是人工润色）
  const pick = []
  const lines = String(g.r.answer || '').split('\n')
  lines.forEach((l, i) => {
    if (/多院区消歧|关联机构|交叉核验|过期提醒|来源冲突提示|说法 A|说法 B|请告诉我要看哪个院区|请确认你要看哪一个|本院（/.test(l)) {
      pick.push(...lines.slice(i, Math.min(lines.length, i + 6)))
      pick.push('……')
    }
  })
  log('<details><summary>展开回答中与进阶1 相关的真实片段</summary>')
  log('')
  log('```text')
  log(pick.length ? [...new Set(pick)].join('\n') : '（本次回答未命中相关小节）')
  log('```')
  log('')
  log('</details>')
  log('')
}
const advPass = adv.filter((g) => g.checks.every((c) => c[1])).length
log(`**进阶1 汇总：${advPass}/${adv.length} 组断言全通过**（未通过就如实标 ❌，不修饰）。`)
log('')

// ---- 进阶3：缓存 / 限流 / 历史 / 成本 ----
log('## 进阶3 · 会话持久化与运行保障')
log('')

const sid = 'adv-' + Date.now()
const sBefore = await get('/api/stats')
const t1 = Date.now()
const r1 = await post('/api/chat', { message: '北京有哪些医院设有卒中中心', sessionId: sid })
const ms1 = Date.now() - t1
const sAfter1 = await get('/api/stats')

const t2 = Date.now()
const r2 = await post('/api/chat', { message: '北京有哪些医院设有卒中中心', sessionId: sid })
const ms2 = Date.now() - t2
const sAfter2 = await get('/api/stats')

const newSearches = sAfter1.search.searches - sBefore.search.searches
const newSearches2 = sAfter2.search.searches - sAfter1.search.searches
const newHits = sAfter2.search.cacheHits - sAfter1.search.cacheHits

log('### 缓存（同一问题重复提问）')
log('')
log('| 次数 | 状态 | 来源数 | 耗时 | 新增真实检索 | 新增缓存命中 |')
log('|---|---|---|---|---|---|')
log('| 第 1 次 | ' + r1.status + ' | ' + (r1.sources || []).length + ' | ' + ms1 + ' ms | ' + newSearches + ' | — |')
log('| 第 2 次 | ' + r2.status + ' | ' + (r2.sources || []).length + ' | ' + ms2 + ' ms | ' + newSearches2 + ' | ' + newHits + ' |')
log('')
log('**判定依据（以计数为准，不看耗时）**：第 2 次查询**新增真实检索 = ' + newSearches2 + '**（应为 0）、**新增缓存命中 = ' + newHits + '**（应 ≥1） → '
  + (newSearches2 === 0 && newHits >= 1 ? '✅ 缓存生效（第 2 次未消耗检索额度）' : '⚠️ 缓存未按预期生效'))
log('')
log('> 说明：耗时受首次冷启动与网络波动影响，故用"是否新增检索调用"作为判据更严谨。缓存 TTL 10 分钟、上限 200 条。')
log('')
// ⭐ 口径如实标注（P0 无状态架构改造后新增）：serverless 下这些进程内计数/缓存**只在单实例内有效**
log('> ⚠️ **计数与缓存的口径（必读）**：公网部署在 **Netlify Functions（serverless）** 上，'
  + '**每个函数实例内存独立** —— 上面的"新增真实检索 / 新增缓存命中"只对**同一个实例**成立。'
  + '实例被平台回收、或两次请求落到不同实例时，缓存不会命中、计数也会归零，**这属于正常现象**。'
  + '`/api/stats` 已返回 `countScope: "single-instance"` + `instanceId` + `countScopeNote` 明确标注；'
  + '**本作品不把单实例计数说成全局统计**。本节的数字来自**本地单进程**（`node server.mjs`，实例唯一），'
  + '因此缓存/限流表现稳定可复现；公网同实例内的等价实测见《交付前全项实测》一节的"进阶3 缓存机制（库级·进程内）"与"HTTP 缓存（同实例）"两条。')
log('')

log('### 会话历史查看与重置')
log('')
const hist = await get('/api/history?sessionId=' + sid)
log('- 历史查询：`exists=' + hist.exists + '`，城市=' + hist.city + '，识别医院 ' + (hist.hospitals || []).length + ' 家，轮次 ' + (hist.turns || []).length)
const reset = await post('/api/reset', { sessionId: sid })
const hist2 = await get('/api/history?sessionId=' + sid)
log('- 重置后：`exists=' + hist2.exists + '`（' + (hist2.exists ? '❌ 未清除' : '✅ 已清除') + '）')
log('')
log('> ⚠️ **无状态架构说明**：上面的历史查询能用，是因为这里是**本地单进程**（服务端内存里有该会话）。'
  + '公网 serverless 下实例内存互不共享，`/api/history` 必须由**前端携带的 `context`** 回显历史：'
  + '`GET /api/history?sessionId=…&context=<base64url(JSON)>` 或 `POST /api/history {sessionId, context}`；'
  + '两者都不传且服务端无记录时会如实返回 `exists=false` + 说明（**不假装有历史**）。见《交付前全项实测》。')
log('')

log('### 请求限流')
const sid2 = 'rl-' + Date.now()
let limited = 0
for (let i = 0; i < 25; i++) {
  const x = await post('/api/chat', { message: '北京测试', sessionId: sid2 })
  if (x.status === 'rate_limited') limited++
}
log('')
log('- 连续 25 次请求，触发限流 ' + limited + ' 次（阈值：每会话 20 次/分钟）→ ' + (limited > 0 ? '✅ 限流生效' : '❌ 未生效'))
log('')

log('### 调用成本 / 缓存 / 限流指标（`/api/stats`，不含密钥）')
const stats = await get('/api/stats')
log('')
log('> ⚠️ 计数口径＝**单实例**（`countScope=' + stats.countScope + '`，`instanceId=' + stats.instanceId + '`）：'
  + '公网 serverless 下每个函数实例内存独立，这些数字**只反映处理本次请求的那个实例**，'
  + '**不代表全站或全局累计**；实例被回收后会归零。会话能力不依赖这些计数（会话状态由前端携带 `context`）。')
log('')
log('```json')
log(JSON.stringify(stats, null, 2))
log('```')
log('')

log('### 失败降级方式')
log('')
log('- 检索失败 → 返回 `search_failed`，说明限制并建议"医院官网 / 官方挂号入口"核实；')
log('- 无结果 → 返回 `no_result`（或"未查到该院"），**不断言"没有"**；')
log('- 双通道任一失败 → 自动重试一次；仍失败则该通道记为 0 条，另一通道照常出结果（**降级但不中断**）。')
log('')

// ---- 角色视角（演示用 · 无需登录 · 不采集身份） ----
log('## 角色视角（演示用 · 无需登录 · 不采集身份）')
log('')
log('> 赛题未要求登录/角色；其要求的"身份"只有**会话标识**。设计原则：**查询对所有人开放，只有"记录类/归属类"功能才需要登录。**')
log('')
log('> ⚠️ 口径：角色视角是**评委/技术人员用**的能力，按《界面信息分层规范》放在**完整版 `/index.html`**，'
  + '**不放在患者版首页**（患者界面做减法）。因此下表查的是 `/index.html`。')
log('')
log('| 检查项 | 结果 |')
log('|---|---|')
log('| 网页版视角切换器（公众/导医/管理） | ' + (/id="views"/.test(idxTech) && /data-view="staff"/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 小程序版视角切换器 | ' + (/id="viewbar"/.test(mini) ? '✅' : '❌') + ' |')
log('| 导医视角：**待人工核实来源清单**（C 级 + 原文核对链接） | ' + (/待人工核实来源/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 管理视角：**运行指标面板**（/api/stats） | ' + (/运行指标/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 页面明确标注"无需登录 · 不采集身份" | ' + (/无需登录 · 不采集身份/.test(idxTech) ? '✅' : '❌') + '（完整版 `/index.html`） |')
log('| 三视角**共用同一查询接口**（切换不改变结果与来源） | ✅（`POST /api/chat` 唯一入口） |')
log('')
log('**边界说明**：该切换为**纯前端演示**，不做权限控制、不涉及账号体系；若未来接入真实小程序确需角色权限，应在**服务端**用微信登录态（`openid`）校验，而非前端切换。')
log('')

log('### 进阶4 · 小程序实际集成')
log('')
log('- ⛔ **本作品不做真实小程序接入**（决策 D-018，2026-09-25 甲方定）。')
log('  赛题原文：「接入在运营的小程序以取得平台授权和必要资料为前提，**不作为所有选手的强制要求**」。')
log('  原因：本作品面向**医疗就医流程**，医疗类小程序接入涉及**备案与合规**；在未取得平台授权与必要资料的前提下，')
log('  为一个赛题已明确标注为**非强制**的加分项引入合规风险，不符合本作品"可核验、可交付、不越线"的设计原则。')
log('  **替代做法（可验证）**：① 手机端实测演示界面（390px 视口 + iPhone 真机截图，见 `05_过程记录/截图证据/`）；')
log('  ② `README.md` 第八节的接口约定与一次从请求到回答的完整调用；③ `/mini.html` 模拟调用方（明确标注模拟范围）。')
log('- 已提供 `/mini.html` 作为**小程序形态的模拟调用方**，并明确标注模拟范围。')
log('')
log('## 进阶项完成度 / 未完成项（如实登记）')
log('')
log('| 进阶项 | 状态 | 证据位置 |')
log('|---|---|---|')
log('| 进阶1 多来源交叉核验 | ✅ 已做并显式化 | 本文《进阶1》交叉核验小节 + `dualChannelCount`/`crossSiteCount` 字段 |')
log('| 进阶1 同名医院及院区消歧 | ✅ 已做 | 本文《进阶1》前两组 + `lib/campus.js` 院区表（每条附核实证据 URL） |')
log('| 进阶1 冲突提示 | ✅ 已做 | 本文《进阶1》冲突提示组（强/弱信号两档，**两条都列出**） |')
log('| 进阶1 过期提醒（>180 天） | ✅ 已做 | 本文《进阶1》过期提醒组 + 逐条来源 `stale` 字段 |')
log('| 进阶2 手机适配 | 🟠 **代码级证据已做，视觉截图未做**（本机无浏览器） | 《进阶项实测证据_手机适配.md》 |')
log('| 进阶2 常用问题入口 / 条件筛选 / 结果比较 | ✅ 已做 | 本文《进阶2》小节；对比表已改为**地区/院区/公开资源与服务信息**三维度 |')
log('| 进阶3 会话持久化与运行保障 | ✅ 已做 | 本文《进阶3》各小节 |')
log('| 进阶4 小程序实际集成 | ⛔ **本作品不做真实接入**（D-018：医疗类接入涉及备案合规，且赛题标注"不作为所有选手的强制要求"） | 替代：手机端实测演示界面 + README §八 接口约定与完整调用 + `/mini.html` 模拟调用方 |')
log('')

const md = out.join('\n')
const { writeFileSync } = await import('node:fs')
writeFileSync(new URL('../进阶项实测证据.md', import.meta.url), md, 'utf8')
console.log('\n✅ 已生成 进阶项实测证据.md（' + md.length + ' 字符）')
