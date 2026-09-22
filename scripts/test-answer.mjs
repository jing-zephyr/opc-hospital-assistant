// 端到端测试：node scripts/test-answer.mjs
import { answer } from '../lib/answer.js'

const cases = [
  '北京有哪些医院设有卒中中心',
  '有卒中中心的医院',
  '我胸痛该怎么办',
  '高血压吃什么药好',
  '',
]

for (const c of cases) {
  const r = await answer(c, {})
  console.log('\n' + '='.repeat(72))
  console.log('输入:', JSON.stringify(c))
  console.log('状态:', r.status, '｜ 来源数:', (r.sources || []).length)
  console.log('-'.repeat(72))
  console.log(r.answer)
}
