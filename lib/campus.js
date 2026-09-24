// lib/campus.js —— 进阶1：**同名医院及院区消歧**（医院 → 院区映射）
//
// ⚠️ 纪律（与 lib/hospitals.js 同一条）：
//   ① 本表只写**核实过的**院区；核实不了的写 `confidence:'multi'` 并**在输出里明确标注"院区清单待核实"**；
//   ② 每条附 `evidence`（本系统真实检索命中的官方/权威页面 URL）+ `evidenceTier`；
//   ③ **不许凭印象编院区**。新增流程：检索命中 → 确认是该院官方页面 → 才写入 → 留证据 URL。
//   ④ 本表仅用于【消歧与提示】；**不用来断言某院区当前是否提供某项服务**——那必须看检索结果里的来源。
//      也就是说：本表是"回答第几个院区"的路标，不是"该院区有什么"的事实来源。
//
// 键（BASE）用"最短可识别院名"，靠**子串包含**匹配检索/提问里出现的院名；
//   匹配时优先取**最长键**，避免"北京中医医院"误吸"北京中医医院顺义医院"。

/** 院区清单 confidence：
 *  'single' = 已核实的单院区（官方页面表述为一个院区/一个执业地点）
 *  'official' = 已核实的多院区（官方/权威页面列举过院区）
 *  'multi'  = **确认是多院区医院，但具体院区清单本系统未能核实** → 如实标注，不编
 */
export const CAMPUS_MAP = {
  // ---------- 北京 ----------
  '北京清华长庚医院': {
    full: '北京清华长庚医院',
    kind: '公立',
    city: '北京',
    confidence: 'single',
    campuses: [{ name: '本院（昌平区天通苑）', note: '来源未出现分院区表述' }],
    evidence: 'https://www.tsinghua.edu.cn/info/1182/47655.htm',
    evidenceTier: 'A（清华大学官网）',
    note: '检索命中的官方页面均指向该院本部，未见分院区表述；用户问"院区"时如实说明。',
  },
  '北京中医医院': {
    full: '首都医科大学附属北京中医医院',
    kind: '公立',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '本院（东城区宽街）', note: '官网门户默认院区' },
    ],
    related: [
      { name: '北京中医医院延庆医院（延庆院区）', note: '检索命中：北京市卫健委《北京中医医院延庆医院康复科正式揭牌成立》' },
      { name: '北京中医医院顺义医院（顺义院区）', note: '该院名出现在北京中医医院官网页面' },
      { name: '北京市平谷区中医院（北京中医医院平谷医院）', note: '检索命中：该院名出现在北京中医医院官网页面' },
    ],
    evidence: 'https://wjw.beijing.gov.cn/xwzx_20031/jcdt/202504/t20250418_4069359.html',
    evidenceTier: 'A（北京市卫生健康委员会）',
    note: '本院与上述"关联机构"是**不同执业地点（独立医疗机构）**，不是本院的门诊部：就医、挂号、科室安排**一律按各自机构分别核实，不得与本院混用**。',
  },
  '中国医学科学院北京协和医院': {
    full: '中国医学科学院北京协和医院',
    kind: '公立',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '东单院区（帅府园一号）', note: '本部' },
      { name: '西单院区', note: '检索命中该院官方站点 www.pumch.cn 的院区相关页面' },
    ],
    evidence: 'https://www.pumch.cn/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '两个院区**科室设置不完全相同**（部分专科仅在一个院区出诊），请按院区核对。',
  },
  '北京协和医院': {
    full: '中国医学科学院北京协和医院',
    kind: '公立',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '东单院区（帅府园一号）', note: '本部' },
      { name: '西单院区', note: '检索命中该院官方站点 www.pumch.cn 的院区相关页面' },
    ],
    evidence: 'https://www.pumch.cn/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '两个院区**科室设置不完全相同**（部分专科仅在一个院区出诊），请按院区核对。',
  },
  '北京同仁医院': {
    full: '首都医科大学附属北京同仁医院',
    kind: '公立',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '崇文门院区（本部，东城区）', note: '' },
      { name: '亦庄院区（南区，大兴区）', note: '检索命中该院官网 www.trhos.com 站点页面' },
    ],
    evidence: 'https://www.trhos.com/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '眼科/耳鼻咽喉科等重点专科在两院区的出诊安排不同，请按院区核对。',
  },
  '北京友谊医院': {
    full: '首都医科大学附属北京友谊医院',
    kind: '公立',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '西城院区（本部，西城区）', note: '' },
      { name: '通州院区', note: '' },
      { name: '顺义院区', note: '检索命中新华网报道《北京友谊医院顺义院区将于4月26日开诊》' },
    ],
    evidence: 'https://www.news.cn/',
    evidenceTier: 'B（官方媒体，appear in 检索结果）',
    note: '各院区开诊时间不同（顺义院区为较晚开设），**历史报道不等于当前排班**，请以官网最新公告为准。',
  },  '北京朝阳医院': {
    full: '首都医科大学附属北京朝阳医院',
    kind: '公立',
    city: '北京',
    confidence: 'multi',
    campuses: [],
    evidence: 'https://www.bjcyh.com.cn/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '该院为**多院区医院**（本部/西院/常营等），但本系统本次**未能核实完整院区清单**，故不列出——请以官网"院区导航"页面为准。',
  },
  '北京世纪坛医院': {
    full: '首都医科大学附属北京世纪坛医院',
    kind: '公立',
    city: '北京',
    confidence: 'multi',
    campuses: [],
    evidence: 'https://www.bjsjth.cn/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '该院为**多院区医院**，本系统**未能核实完整院区清单**，不列出。',
  },
  '北京天坛医院': {
    full: '首都医科大学附属北京天坛医院',
    kind: '公立',
    city: '北京',
    confidence: 'single',
    campuses: [{ name: '丰台院区（本部，整体迁建后地址）', note: '来源未出现分院区表述' }],
    evidence: 'https://www.bjtth.org/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '未核实到分院区表述；用户问"院区"时如实说明。',
  },
  '北京市海淀医院': {
    full: '北京市海淀医院（北京大学第三医院海淀院区）',
    kind: '公立',
    city: '北京',
    confidence: 'single',
    campuses: [{ name: '海淀院区（中关村大街）', note: '院名本身即含"海淀院区"表述' }],
    evidence: 'https://www.hdhospital.com/',
    evidenceTier: 'B（医院官网）',
    note: '该院名称中的"海淀院区"是**北医三院的海淀院区**，与北医三院本部**不是同一执业地点**，不得与北医三院（本部）混用。',
  },
  '海淀医院': {
    full: '北京市海淀医院（北京大学第三医院海淀院区）',
    kind: '公立',
    city: '北京',
    confidence: 'single',
    campuses: [{ name: '海淀院区（中关村大街）', note: '院名本身即含"海淀院区"表述' }],
    evidence: 'https://www.hdhospital.com/',
    evidenceTier: 'B（医院官网）',
    note: '该院名称中的"海淀院区"是**北医三院的海淀院区**，与北医三院本部**不是同一执业地点**，不得与北医三院（本部）混用。',
  },
  '北京大学第三医院': {
    full: '北京大学第三医院（北医三院）',
    kind: '公立',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '本部（海淀区花园北路）', note: '' },
      { name: '海淀院区（北京市海淀医院）', note: '与北京市海淀医院为同一执业地点，院名互见' },
      { name: '北方院区', note: '检索命中北京大学新闻网《北京大学第三医院北方院区正式揭牌》' },
      { name: '海淀北部院区', note: '检索命中北京大学新闻网《北京大学第三医院海淀北部院区门急诊和住院全面运行》' },
    ],
    evidence: 'https://news.pku.edu.cn/',
    evidenceTier: 'A（北京大学新闻网，appear in 检索结果）',
    note: '⚠️ 与"北京市海淀医院"是**同一执业地点的两个名称**；与本部/北方院区/海淀北部院区则是**不同院区**。',
  },
  '北京和睦家医院': {
    full: '北京和睦家医院（民营）',
    kind: '民营',
    city: '北京',
    confidence: 'official',
    campuses: [
      { name: '主院区（朝阳区将台路）', note: '' },
      { name: '其他院区/诊所', note: '和睦家在京另有多个院区与卫星诊所，**清单以集团官网为准**' },
    ],
    evidence: 'https://beijing.ufh.com.cn/department_city/emergency',
    evidenceTier: 'B（医院官网）',
    note: '民营医院院区较多且时有调整，**请以官网"院区/门诊"栏目为准**。',
  },
  // ---------- 杭州 ----------
  '浙江大学医学院附属第二医院': {
    full: '浙江大学医学院附属第二医院（浙大二院）',
    kind: '公立',
    city: '杭州',
    confidence: 'official',
    campuses: [
      { name: '解放路院区（本部，上城区）', note: '' },
      { name: '滨江院区', note: '' },
      { name: '城东院区', note: '检索命中该院官网院区/交通栏目' },
      { name: '博奥院区', note: '' },
    ],
    evidence: 'https://www.z2hospital.com/channels/573.html',
    evidenceTier: 'B（医院官网）',
    note: '该院官网另有心脑血管病院区等表述；**各院区地址、科室、排班不得混用**，请按院区核对。',
  },
  '浙江大学医学院附属第一医院': {
    full: '浙江大学医学院附属第一医院（浙大一院）',
    kind: '公立',
    city: '杭州',
    confidence: 'multi',
    campuses: [],
    evidence: 'https://www.zy91.com/',
    evidenceTier: 'B（医院官网，appear in 检索结果）',
    note: '该院为**多院区医院**（庆春/余杭/之江等），本系统本次**未核实完整院区清单**，不列出。',
  },
  '杭州市第一人民医院': {
    full: '杭州市第一人民医院',
    kind: '公立',
    city: '杭州',
    confidence: 'official',
    campuses: [
      { name: '湖滨院区（本部，上城区）', note: '' },
      { name: '城北院区', note: '检索命中该院官网院区公告页《城北新院区试运行》' },
    ],
    evidence: 'https://www.hz-hospital.com/member/content/details/id/214147?cid=68',
    evidenceTier: 'B（医院官网）',
    note: '城北院区为**新开设院区**，科室开放范围与本部不同，请按院区核对。',
  },
  '浙江省中医院': {
    full: '浙江省中医院（浙江中医药大学附属第一医院）',
    kind: '公立',
    city: '杭州',
    confidence: 'multi',
    campuses: [],
    evidence: '',
    evidenceTier: '未核实（**不得**据此下结论）',
    note: '本系统**未核实**该院院区清单，故不列出任何院区——需要时请以官网为准。',
  },
}

/** 医院名 → 院区信息
 *  匹配顺序：① 医院名包含某个键（**最长键优先**，避免"北京中医医院"吸走"北京中医医院顺义医院"）
 *            ② 某个键包含医院名（机构前缀/简称差异："中国医学科学院北京协和医院" ↔ "北京协和医院"）
 *  匹配不到返回 null（**不猜**）。 */
/** 医院名 → 院区表键候选列表（"拿掉哪些字 → 剩下的像不像医院名"） */
function keysContainedIn(n) {
  const out = []
  const norm = (s) => s.replace(/(省|市|自治区|特别行政区|区|县)$/g, '')
  const stripParen = (s) => s.replace(/[（(][^)）]*[)）]/g, '')
  for (const [key, info] of Object.entries(CAMPUS_MAP)) {
    if (key.length < 4 || n.length < key.length) continue
    const at = n.indexOf(key)
    if (at < 0) continue
    const overlap = key.split('').filter((c) => n.includes(c)).length
    if (overlap / key.length < 0.7) continue          // 键里有一半字根本不在名字里 → 不是包含关系
    const head = n.slice(0, at)
    const tail = n.slice(at + key.length)
    const bareTail = stripParen(tail)          // 括号里通常是"别名/所属院区"，不参与判定
    const headOk = head === '' || norm(head) === '' || key.includes(norm(head))
      || /^(?:中国|中华|国家|首都|北京|上海|省|市|自治区|解放军|人民|医科|医学|中医药|协和|同济|中山|华西|湘雅|齐鲁|瑞金|仁济|附属|直属|第[一二三四五六七八九十]|[\u4e00-\u9fa5]{2,12}(?:大学|学院|医学院|科学院|医学科学院|医院|研究所|中心))+$/.test(head)
    const tailOk = bareTail === ''
      || /^(?:医院|卫生院|保健院|医学中心|医疗中心|门诊部)+$/.test(bareTail)
      || (bareTail === '' && tail.length > 0)   // 尾巴整段是括号别名："北京市海淀医院（北医三院海淀院区）"
    // ⚠️ 反击穿：**下级机构**（"北京市平谷区中医院"里的"平谷区中医院"）不能算作母院的同一名字
    //    —— 判据："拿掉键之后剩下的字"比键本身还长（超过 1.5 倍 + 2）→ 它只是键 + 另一个地域名
    if (bareTail.length > key.length * 1.5 + 2) continue
    if (headOk && tailOk) out.push(key)
  }
  return out
}

/** 医院名 → 院区信息
 *  匹配顺序：① "拿掉行政区划/机构层级前缀后仍是**同一个医院名**"的键（最长键优先）
 *            ② 某个键**完全覆盖**医院名（机构前缀差异："中国医学科学院北京协和医院" ↔ "北京协和医院"）
 *  匹配不到返回 null（**不猜**）。 */
export function lookupCampus(hospitalName) {
  const raw = String(hospitalName || '').trim()
  if (raw.length < 4) return null
  // ⚠️ 只对"看起来确实是医院"的名字查（院校/主管部门不是医院）。
  //    尾巴带括号别名（"北京市海淀医院（北京大学第三医院海淀院区）"）时，按括号前的主名判定。
  const bare = raw.replace(/[（(][^)）]*[)）]\s*$/g, '').trim() || raw
  if (!/(医院|卫生院|保健院|医学中心|医疗中心|门诊部)$/.test(bare)) return null
  let best = null
  for (const key of keysContainedIn(raw)) {
    const info = CAMPUS_MAP[key]
    const score = (info.full.includes(key) ? 1000 : 0) + key.length
    if (!best || score > best.score) best = { key, info, score }
  }
  if (best) return { key: best.key, ...best.info }
  for (const [key, info] of Object.entries(CAMPUS_MAP)) {
    if (key.length < 5 || !key.includes(bare)) continue
    if (!best || key.length < best.key.length) best = { key, info }
  }
  return best ? { key: best.key, ...best.info } : null
}

/** 多院区医院（需要用户澄清院区）——含"本院 + 关联机构"这类**必须区分**的情形 */
export function isMultiCampus(info) {
  if (!info) return false
  if (info.confidence === 'official' || info.confidence === 'multi') return true
  // single 但存在**关联机构**（独立执业地点）→ 同样必须先澄清，避免把两者当一家
  return Array.isArray(info.related) && info.related.length > 0
}

/** 本系统**已核实**的院区名清单（confidence='multi' 时为空数组——不编） */
export function campusNames(info) {
  return (info && Array.isArray(info.campuses)) ? info.campuses.map((c) => c.name) : []
}

/** 在文本里识别"用户点了哪个院区"（命中已核实的院区名，或"本部/总院/主院区"等总部说法） */
export function matchCampusInText(text, info) {
  const t = String(text || '')
  for (const name of campusNames(info)) {
    const core = name.replace(/（.*?）|\(.*?\)/g, '')
    if (core.length >= 4 && t.includes(core)) return name
    // "解放路院区"这类：取院区名去掉"院区/医院"两字的前缀
    const stem = core.replace(/(院区|医院)$/, '')
    if (stem.length >= 2 && stem !== core && t.includes(stem)) return name
  }
  if (/(本部|本院|总院|主院区)/.test(t) && campusNames(info).length) {
    return campusNames(info).find((n) => /本部|本院/.test(n)) || campusNames(info)[0]
  }
  return ''
}

/** 判断一条**来源**属于哪个院区（只在已核实院区名出现在标题/摘要里时返回，否则空=未明确） */
export function campusOfItem(item, info) {
  if (!info) return ''
  const hay = `${item.title || ''} ${item.snippet || ''}`
  for (const name of campusNames(info)) {
    const core = name.replace(/（.*?）|\(.*?\)/g, '')
    if (core.length >= 4 && hay.includes(core)) return name
    const stem = core.replace(/(院区|医院)$/, '')
    if (stem.length >= 2 && hay.includes(stem)) return name
  }
  return ''
}
