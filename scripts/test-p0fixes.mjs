// scripts/test-p0fixes.mjs —— 本次 4 项缺陷修复的**断言式**测试（不联网、不需要密钥，秒级跑完）
//
// 运行：node scripts/test-p0fixes.mjs
//
// 覆盖：
//   P0-1  「胸痛中心」等五大救治中心**不得**被判为紧急求助；症状求助**必须**触发 120
//   P0-2  医院类别（公立/民营）能按**院名**判定；民营来源能标注类别与类别依据
//   P1-3  演示范围（城市）判定：外地来源必须被识别，北京来源不得误判
//   P1-4  结构化字段里的院名必须是**真医院全称**（不得是句子片段），且不得重复成两张卡片
//
// ⚠️ 纪律：本文件只做**离线**断言（不发起网络检索），保证任何环境都能复现；
//         需要"真实检索链路"的证据见 README《测试记录》与本次修复报告。
import { parseIntent } from '../lib/intent.js'
import { isPlausibleHospitalName, looksLikeSearchEcho, categoryByName, isTrimmedVariantOf } from '../lib/hospitals.js'
import { outOfScopeCityForTest as outOfScopeCity, extractHospitals } from '../lib/answer.js'

let pass = 0
let fail = 0
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else { fail++; console.log(`❌ ${label}\n     期望=${JSON.stringify(want)}\n     实际=${JSON.stringify(got)}`) }
  if (ok) console.log(`✅ ${label}`)
}

// ============ P0-1 紧急求助判定 ============
console.log('\n===== P0-1 「胸痛中心」不得误判为紧急求助 =====')
const NOT_EMERGENCY = [
  '北京有哪些医院有胸痛中心',
  '北京有哪些医院有卒中中心',
  '北京有哪些医院有创伤中心',
  '北京有哪些医院有危重孕产妇救治中心',
  '北京有哪些医院有危重新生儿救治中心',
  '北京有哪些医院有发热门诊',
  '北京有哪些医院有急诊科',
  '北京有抗蛇毒血清的医院',
]
for (const q of NOT_EMERGENCY) {
  eq(`不是紧急求助：「${q}」`, parseIntent(q, {}).flags.emergency, false)
}
const MUST_EMERGENCY = [
  '我突然胸痛得厉害怎么办',
  '突然胸口疼怎么办',
  '我胸痛得厉害',
  '我大出血了',
  '有人昏迷了怎么办',
  '呼吸困难怎么办',
]
for (const q of MUST_EMERGENCY) {
  eq(`是紧急求助（提示 120）：「${q}」`, parseIntent(q, {}).flags.emergency, true)
}
// 五大救治中心都要能被识别为"科室/资源"（否则回退成"请补充科室"）
for (const d of ['胸痛中心', '卒中中心', '创伤中心', '危重孕产妇救治中心', '危重新生儿救治中心']) {
  const it = parseIntent(`北京有哪些医院有${d}`, {})
  eq(`识别为科室/资源：${d}`, it.departments.includes(d), true)
}

// ============ P0-2 医院类别 ============
console.log('\n===== P0-2 公立/民营类别判定 =====')
eq('北京和睦家医院 = 民营（官方要求 ≥1 家民营）', categoryByName('北京和睦家医院'), '民营')
for (const n of ['北京积水潭医院', '北京大学第三医院', '北京协和医院', '中日友好医院',
  '中国医学科学院阜外医院', '首都医科大学宣武医院', '北京清华长庚医院', '北京市海淀医院']) {
  eq(`${n} = 公立`, categoryByName(n), '公立')
}
eq('未核实过的医院不猜类别（返回 null）', categoryByName('某个没核实过的医院'), null)
// 最长的已核实院名优先（"北京市海淀医院" 不能被 "北京医院" 抢走）
eq('最长院名优先（北京市海淀医院 ≠ 北京医院）', categoryByName('北京市海淀医院'), '公立')

// ============ P1-3 演示范围（城市） ============
console.log('\n===== P1-3 演示范围（城市）判定 =====')
const scopeCases = [
  ['深圳卫健委页面', '【疾病预防】在深圳被蛇咬了往哪送？', 'https://wjw.sz.gov.cn/gzcy/ywzs/jbyf/content/post_10581621.html', '深圳市卫生健康委员会', '深圳'],
  ['北京中医药大学深圳医院', '北京中医药大学深圳医院（龙岗）', 'https://www.sz.gov.cn/xx/', '', '深圳'],
  ['人民医院珠海医院', '人民医院珠海医院', 'https://www.zhuhai.gov.cn/', '', '珠海'],
  ['北医三院秦皇岛医院', '北京大学第三医院秦皇岛医院', 'https://www.pku3h-qhd.com/', '', '秦皇岛'],
  ['北票市政府名单页', '北票市危重孕产妇和危重新生儿救治中心名单', 'http://www.bp.gov.cn/html/BPSZF/202407/0172223602170220.html', '', '北票'],
  ['栖霞市人民医院', '栖霞市人民医院', 'https://www.qixia.gov.cn/', '', '栖霞'],
  // 北京来源：不得误判
  ['北京中医医院官网新闻', '北京中医医院“卒中中心”揭牌（医院官网新闻）', 'https://www.bjzhongyi.com/gzb_yyxw_detail/2718.html', '', ''],
  ['北京市海淀医院官网新闻', '神经内科成为首批中国卒中中心联盟成员（北京市海淀医院官网新闻）', 'https://www.hdhospital.com/Html/News/Articles/3252.html', '', ''],
  ['北京大学人民医院院页', '北京大学人民医院', 'https://english.pkuph.edu.cn/csjzzx_department.html', '', ''],
  ['清华大学官网', '北京清华长庚医院获评国家“高级卒中中心”（清华大学官网）', 'https://www.tsinghua.edu.cn/info/1182/47655.htm', '', ''],
  ['北京市卫健委', '北京市卫生健康委员会（主管部门官网）', 'https://wjw.beijing.gov.cn/', '', ''],
  ['和睦家官网', '急诊科 北京和睦家医院', 'https://beijing.ufh.com.cn/department_city/emergency', '', ''],
  // "沈阳"只是正文明列的患者来源地 → 北京来源不得被误判
  ['北京本地宝（沈阳是患者来源地）', '北京哪家医院有抗蛇毒血清?- 北京本地宝', 'http://bj.bendibao.com/news/2025620/373576.shtm',
    '在北京,解放军总医院第四医学中心作为华北地区最大的蛇咬伤救治中心,1992年以来收治北京、河北、沈阳、山西、山东、内蒙古等地4000余例患者。', ''],
]
for (const [label, title, url, snippet, want] of scopeCases) {
  eq(`范围判定（${label}）`, outOfScopeCity({ title, url, snippet }, title, '北京'), want)
}

// ============ P1-4 院名规范 ============
console.log('\n===== P1-4 结构化字段的院名必须是真医院全称 =====')
const REAL_NAMES = ['北京积水潭医院', '北京大学人民医院', '北京朝阳医院', '首都医科大学附属北京中医医院',
  '北京协和医院', '北京同仁医院', '北京市海淀医院（北京大学第三医院海淀院区）', '北京和睦家医院',
  '航天中心医院', '北京妇产医院', '北京中医医院', '北京儿童医院', '中日友好医院',
  '中国医学科学院阜外医院', '北票市中心医院', '惠州市中心人民医院']
for (const n of REAL_NAMES) eq(`真院名通过：${n}`, isPlausibleHospitalName(n), true)
const FRAGMENTS = ['是人民医院', '是在人民医院', '创伤中心向医院', '科室信息来自医院', '辗转赶到医院',
  '北京那个医院', '6家三甲医院', '三家医院', '北京发热门诊医院', '北京抗蛇毒血清医院',
  '中国康复研究中心北京博爱医院', '互联网医院']
for (const n of FRAGMENTS) eq(`句子片段被拦：${n}`, isPlausibleHospitalName(n), false)
// 检索词回声（候选标记）
eq('回声候选：北京胸痛医院', looksLikeSearchEcho('北京胸痛医院', '北京', ['胸痛中心'], '北京有哪些医院有胸痛中心'), true)
eq('非回声：北京妇产医院（问的是创伤中心）', looksLikeSearchEcho('北京妇产医院', '北京', ['创伤中心'], '北京有哪些医院有创伤中心'), false)
// 前缀裁剪重复项归并（"积水潭医院" ⊂ "北京积水潭医院"）
eq('短名并入长名：积水潭医院 ⊂ 北京积水潭医院', isTrimmedVariantOf('积水潭医院', '北京积水潭医院'), true)
eq('独立机构不并入：北京积水潭医院郑州医院 ⊄ 北京积水潭医院', isTrimmedVariantOf('北京积水潭医院郑州医院', '北京积水潭医院'), false)
eq('独立机构不并入：北京中医医院延庆医院 ⊄ 首都医科大学附属北京中医医院', isTrimmedVariantOf('北京中医医院延庆医院', '首都医科大学附属北京中医医院'), false)

// extractHospitals：结构化字段里不得出现句子片段、不得出现重复卡片
console.log('\n===== P1-4 结构化字段（extractHospitals）端到端断言 =====')
const fakeItems = [
  {
    title: '北京积水潭医院创伤中心成立', url: 'https://news.pku.edu.cn/xwzh/1.htm', site: 'news.pku.edu.cn',
    snippet: '北京积水潭医院创伤中心成立。是人民医院也在推进，创伤中心向医院提出要求，科室信息来自医院官网。',
    channel: 'bocha', tier: 'A', channels: ['bocha'],
  },
  {
    title: '积水潭医院创伤中心', url: 'https://other.example.com/a.htm', site: 'other.example.com',
    snippet: '积水潭医院创伤中心相关信息。',
    channel: 'tavily', tier: 'C', channels: ['tavily'],
  },
]
const hs = extractHospitals(fakeItems, { city: '北京', deptNames: ['创伤中心'], queryText: '北京有哪些医院有创伤中心' })
const hsNames = hs.map((h) => h.fullName || h.name)
console.log('   抽出的医院:', hsNames.join(' | ') || '(none)')
eq('结构化字段无句子片段', hsNames.some((n) => FRAGMENTS.some((b) => n.includes(b))), false)
eq('同一家医院不重复成两张卡片', hsNames.filter((n) => n.includes('积水潭')).length <= 1, true)

console.log(`\n${'='.repeat(60)}\n通过 ${pass} 项，失败 ${fail} 项\n${'='.repeat(60)}`)
process.exit(fail === 0 ? 0 : 1)
