// 测试检索核心层：node scripts/test-lib.mjs "北京 卒中中心 医院"
import { search, fmtDate, tierLabel } from '../lib/search.js'

const q = process.argv[2] || '北京 卒中中心 医院'
const r = await search(q)

console.log('查询:', r.query)
console.log('本次查询时间:', r.queriedAt)
console.log('通道命中:', JSON.stringify(r.channels), '→ 去重后', r.total, '条')
console.log('='.repeat(70))

for (const it of r.results) {
  console.log(`\n【${it.tier}级】${tierLabel(it.tier)}  (通道: ${it.channels.join('+')})`)
  console.log('  标题:', it.title)
  console.log('  链接:', it.url)
  console.log('  来源更新时间:', fmtDate(it.date))
  console.log('  摘要:', it.snippet.replace(/\s+/g, ' ').slice(0, 120))
}
