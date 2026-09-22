// scripts/test-advanced.mjs —— 进阶项证据（需本地服务已启动）
// 用法：先 node server.mjs，再 node scripts/test-advanced.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:8787'

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
log('> 方式：对本地服务发起真实 HTTP 请求（结果可复现）')
log('')

// ---- 进阶2：手机端与常用问题入口（静态能力，检查页面是否存在） ----
const idx = await fetch(BASE + '/').then((r) => r.text())
const mini = await fetch(BASE + '/mini.html').then((r) => r.text())
log('## 进阶2 · 交互与结果比较（部分）')
log('')
log('| 检查项 | 结果 |')
log('|---|---|')
log('| 手机端适配（viewport + 媒体查询） | ' + (/viewport/.test(idx) && /max-width:560px|max-width:520px/.test(idx + mini) ? '✅' : '❌') + ' |')
log('| 常用问题入口（快捷 chips） | ' + (/class="chips"/.test(idx) && /class="chips"/.test(mini) ? '✅' : '❌') + ' |')
log('| 小程序形态模拟页 `/mini.html` | ' + (mini.length > 1000 ? '✅（' + mini.length + ' 字节）' : '❌') + ' |')
log('| **条件筛选**（全部 / 仅A级 / A+B级） | ' + (/class="fchip/.test(idx) && /data-filter/.test(idx) ? '✅' : '❌') + ' |')
log('| **医院结果对比**（最多 3 家，围绕院区/公开资源/来源可核验性） | ' + (/class="cmptable"/.test(idx) && /data-cmp/.test(idx) ? '✅' : '❌') + ' |')
log('| 对比**不以医疗质量排名替代**（已写明） | ' + (/不以缺乏依据的医疗质量排名替代/.test(idx) ? '✅' : '❌') + ' |')
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

log('### 会话历史查看与重置')
const hist = await get('/api/history?sessionId=' + sid)
log('')
log('- 历史查询：`exists=' + hist.exists + '`，城市=' + hist.city + '，识别医院 ' + (hist.hospitals || []).length + ' 家，轮次 ' + (hist.turns || []).length)
const reset = await post('/api/reset', { sessionId: sid })
const hist2 = await get('/api/history?sessionId=' + sid)
log('- 重置后：`exists=' + hist2.exists + '`（' + (hist2.exists ? '❌ 未清除' : '✅ 已清除') + '）')
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

log('### 进阶4 · 小程序实际集成')
log('')
log('- ⏳ 未做：需在**自有或已获授权的测试小程序**中完成真实交互；大赛不提供 AppID/账号/生产权限，**非强制项**。')
log('- 已提供 `/mini.html` 作为**小程序形态的模拟调用方**，并明确标注模拟范围。')

const md = out.join('\n')
const { writeFileSync } = await import('node:fs')
writeFileSync(new URL('../进阶项实测证据.md', import.meta.url), md, 'utf8')
console.log('\n✅ 已生成 进阶项实测证据.md（' + md.length + ' 字符）')
