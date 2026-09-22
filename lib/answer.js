// lib/answer.js —— 四段式输出 + 来源三态 + 拒答矩阵（确定性组装，不靠大模型编）
import { search, fmtDate, tierLabel, hostOf } from './search.js'
import { parseIntent, buildQuery } from './intent.js'
import { officialOf, KNOWN_HOSPITALS } from './hospitals.js'

// ---------- 固定话术（写死，不靠模型临场发挥） ----------
export const SAY = {
  EMPTY: '请描述你要查的内容，例如：「北京有哪些医院设有卒中中心」或「XX医院神经内科主任医师出诊安排」。',
  TOO_LONG: '输入过长，请精简到 2000 字以内（可分段提问）。',
  EMERGENCY: '⚠️ **请立即拨打 120 或前往就近医院急诊科。**\n以下信息仅供参考，**请勿用查询替代求助**。',
  MEDICAL: '本系统只提供【医院资源查询】与【便民就医信息】，**不做诊断、治疗方案或用药指导**。\n请携带既往资料咨询专业医务人员；如症状紧急，请立即拨打 120。',
  OUT_OF_SCOPE: '本系统不提供真伪鉴定、估价或交易类信息，请通过官方鉴定机构或正规渠道了解。',
  NEED_CITY: '请告诉我要查的**城市或地区**（例如「北京」），我再为你检索。',
  NO_RESULT: '【未查到】本次检索未获得可核验的公开信息。\n**说明**：检索无结果/来源不可访问，**不代表该医院没有相应科室或资源**。\n**建议核实渠道**：医院官网、官方挂号入口或当地卫生健康主管部门。',
}

// 特殊资源（抗蛇毒血清等）：只描述"能力/历史"，绝不断言"当前可用"
const RESOURCE_CAVEAT =
  '⚠️ **特殊资源的当前可及性无法通过网络公开信息确认。**\n' +
  '公开页面最多只能说明"该院**曾具备相关能力 / 有过相关报道**"，**不等于当前有库存、可立即使用或可随时取用**。\n' +
  '**请直接致电医院急诊科或药房确认**；如为急症，请立即拨打 120。'

// 出诊/排班：区分"固定周期"与"某日场次"，且不从往期推断当前
const SCHEDULE_FIXED =
  '🗓 本次属**固定出诊周期**类查询：请以医院官网 / 官方挂号页的**最新排班**为准。\n' +
  '本系统**不推断当前出诊状态、不承诺号源、不保证预约成功**，也不从往期排班推断今日安排。'
const SCHEDULE_DATE =
  '🗓 本次属**某日场次**类查询：公开页面通常**无法给出当日实时排班**。\n' +
  '请通过**官方挂号渠道**查看当日排班与号源；本系统不作推断或承诺。'
const SCHEDULE_NONE =
  '【未查到可核验的出诊安排】已检索但未获得有效排班信息。\n' +
  '**建议核实渠道**：医院官网 → 官方挂号入口 → 电话咨询门诊服务台。'

const SCHEDULE_HIT_RE = /(出诊|门诊时间|排班|门诊安排|专家门诊|停诊|门诊表)/

function nowCn() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function todayCn() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function clean(s, n = 160) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
}

/** 从检索结果里识别"涉及到的医院"（用于多轮承接：第二家…） */
export function extractHospitals(items) {
  const found = new Map()
  for (const it of items) {
    const hay = (it.title || '') + ' ' + (it.snippet || '') + ' ' + (it.site || '')
    for (const name of KNOWN_HOSPITALS) {
      if (!hay.includes(name)) continue
      // 用去掉"附属/北京"等前缀的短名也做归并
      const key = name.replace(/^首都医科大学附属/, '').replace(/^北京大学/, '')
      if (!found.has(key)) {
        found.set(key, { name, tier: it.tier, url: it.url, title: it.title, site: it.site, date: it.date })
      }
    }
  }
  return [...found.values()]
}

/** 把某级别结果渲染成条目文本 */
function renderGroup(items, limit = 4) {
  const lines = []
  items.slice(0, limit).forEach((it, i) => {
    const off = officialOf(hostOf(it.url))
    lines.push(`${i + 1}. **${clean(it.title, 90)}**`)
    lines.push(`   来源：${it.site || hostOf(it.url)}${off ? `（${off.name}）` : ''} ｜ 链接：${it.url}`)
    lines.push(`   来源更新时间：${fmtDate(it.date)} ｜ 检索通道：${(it.channels || []).join('+')}`)
    lines.push(`   匹配依据（摘要）：${clean(it.snippet, 120)}`)
  })
  if (items.length > limit) lines.push(`   …另有 ${items.length - limit} 条同类来源，见下方"信息依据"清单。`)
  return lines.join('\n')
}

/**
 * 主入口
 * @returns {{status:string, answer:string, sources:Array, query:string, intent:object, queriedAt:string}}
 */
export async function answer(message, session = {}) {
  const intent = parseIntent(message)
  const queriedAt = nowCn()

  const base = { sources: [], query: '', intent, queriedAt }

  if (intent.isEmpty) return { ...base, status: 'empty', answer: SAY.EMPTY }
  if (intent.tooLong) return { ...base, status: 'too_long', answer: SAY.TOO_LONG }

  // 越界与风险：优先处理（急诊 > 诊疗 > 鉴定估价）
  if (intent.flags.emergency) {
    return { ...base, status: 'emergency', answer: SAY.EMERGENCY }
  }
  if (intent.flags.medical) {
    return { ...base, status: 'refused_medical', answer: SAY.MEDICAL }
  }
  if (intent.flags.outOfScope) {
    return { ...base, status: 'refused_out_of_scope', answer: SAY.OUT_OF_SCOPE }
  }
  if (intent.needCity) {
    return { ...base, status: 'need_clarify', answer: SAY.NEED_CITY }
  }

  // ---- 多轮承接：「第二家的地址和官方预约入口呢」 ----
  if (intent.isFollowUp && Array.isArray(session.hospitals) && session.hospitals.length > 0) {
    const idx = Math.min(intent.ordinal, session.hospitals.length) - 1
    const h = session.hospitals[idx]
    const query = `${h.name} 地址 官方预约 挂号入口`
    let res
    try {
      res = await search(query, 8)
    } catch (e) {
      return { ...base, query, status: 'search_failed', answer: `【检索失败】**限制说明**：检索服务异常（${clean(e.message, 80)}）。\n**建议**：稍后重试，或直接访问医院官网 / 官方挂号入口核实。` }
    }
    const items = res.results || []
    const fA = items.filter((x) => x.tier === 'A')
    const fB = items.filter((x) => x.tier === 'B')
    const fC = items.filter((x) => x.tier === 'C' || x.tier === 'D')
    const fo = []
    fo.push('**① 查询条件**')
    fo.push(`地区：${session.city || '（承上一轮）'} ｜ 目标医院：**${h.name}**（承接上一轮第 ${idx + 1} 家）｜ 查询日期：${todayCn()}`)
    fo.push('（本次检索关键词：`' + query + '`；**承接来源：上一轮结果列表**）')
    fo.push('')
    fo.push('**② 查询结果**')
    if (fA.length) { fo.push(''); fo.push('**【A 级 · 可支撑"已核实"】**'); fo.push(renderGroup(fA, 2)) }
    if (fB.length) { fo.push(''); fo.push('**【B 级 · 机构/医院官网】**'); fo.push(renderGroup(fB, 2)) }
    if (fC.length) { fo.push(''); fo.push('**【C 级 · ⚠️ 仅线索，须待核实】**'); fo.push(renderGroup(fC, 1)) }
    fo.push('')
    fo.push('**③ 信息依据**')
    fo.push(`本次查询时间：**${queriedAt}**；共 ${items.length} 条来源。若来源未直接给出"地址/预约入口"，请以官网原文为准。`)
    fo.push('')
    fo.push('**④ 使用提示**')
    fo.push('- **预约请走官方渠道**；本系统不代办、不承诺号源、不保证预约成功。')
    fo.push('- 若以上来源未直接给出该院地址/入口，说明**检索未命中其官方页面**，请通过医院官网或当地卫健委渠道核实。')
    fo.push('- 本系统不做诊断、治疗或用药建议；急症请拨 **120**。')
    return {
      status: fA.length ? 'ok' : 'partial',
      answer: fo.join('\n'),
      sources: items.map((it) => ({ title: it.title, url: it.url, site: it.site, tier: it.tier, channels: it.channels, sourceUpdatedAt: it.date || null, queriedAt })),
      query, intent, queriedAt, hospitals: session.hospitals,
    }
  }

  // 正常检索
  const query = buildQuery(intent, session)
  let res
  try {
    res = await search(query, 8)
  } catch (e) {
    return {
      ...base, query, status: 'search_failed',
      answer: `【检索失败】**限制说明**：检索服务异常（${clean(e.message, 80)}）。\n**建议**：稍后重试，或直接访问医院官网 / 官方挂号入口核实。`,
    }
  }

  const items = res.results || []
  if (items.length === 0) return { ...base, query, status: 'no_result', answer: SAY.NO_RESULT }

  // 用户指定了具体医院，但检索结果里没有它 → 如实报"未查到该院"，**不断言"没有"**
  if (intent.hospitalQuery) {
    const full = intent.hospitalQuery
    // 只认"院名全称"命中；不再用去掉后缀的短名（短名如"不存在"会误命中通用文字）
    const hit = items.some((it) => {
      const hay = (it.title || '') + ' ' + (it.snippet || '') + ' ' + (it.site || '')
      return hay.includes(full)
    })
    if (!hit) {
      return {
        ...base, query, status: 'no_result',
        answer: [
          `【未查到】未检索到「**${intent.hospitalQuery}**」的可核验公开信息。`,
          '',
          `**已检索**：\`${query}\`（通道命中：博查 ${res.channels.bocha} 条 + Tavily ${res.channels.tavily} 条）`,
          '**说明**：检索无结果或来源不可访问，**不代表该医院不存在、也不代表它不具备相应科室**；也可能是**该院名称与公开页面用词不一致**。',
          '',
          '**建议核实渠道**：',
          '1. 确认**医院全称（含院区）**后重试（例如「首都医科大学附属北京中医医院」）；',
          '2. 医院**官网 / 官方公众号**；',
          '3. 当地**卫生健康主管部门**官网。',
        ].join('\n'),
      }
    }
  }

  const A = items.filter((x) => x.tier === 'A')
  const B = items.filter((x) => x.tier === 'B')
  const C = items.filter((x) => x.tier === 'C' || x.tier === 'D')

  const city = intent.cities[0] || session.city || '（未指定）'
  const dept = intent.departments[0] || intent.resources[0] || '（未指定）'

  const out = []
  out.push('**① 查询条件**')
  out.push(`地区：${city} ｜ 资源/科室：${dept} ｜ 医生条件：${intent.titles[0] || (intent.flags.doctor ? '不限职称' : '未涉及')} ｜ 查询日期：${todayCn()}`)
  out.push(`（本次检索关键词：\`${query}\`；通道命中：博查 ${res.channels.bocha} 条 + Tavily ${res.channels.tavily} 条 → 去重后 ${res.total} 条）`)
  out.push('')
  out.push('**② 查询结果**')
  out.push('> 以下为本次**检索到的公开页面**，按来源权威分级列出；**不同院区的信息不作合并**。')
  if (A.length) { out.push(''); out.push(`**【A 级 · 可支撑"已核实"】${tierLabel('A')}**`); out.push(renderGroup(A)) }
  if (B.length) { out.push(''); out.push(`**【B 级 · 机构/医院官网】${tierLabel('B')}**`); out.push(renderGroup(B)) }
  if (C.length) { out.push(''); out.push(`**【C 级 · ⚠️ 仅线索，须待核实】${tierLabel('C')}**`); out.push(renderGroup(C, 2)) }
  out.push('')
  out.push('**③ 信息依据**')
  out.push(`本次查询时间：**${queriedAt}**；共 ${items.length} 条来源（A ${A.length} / B ${B.length} / C ${C.length}）。每条结论均对应上方来源链接；**来源未标注更新时间的，已如实写明**。`)
  out.push('')
  out.push('**④ 使用提示**')
  out.push('- A 级来源（政府/主管部门/院校）可支撑"已核实"；B 级为医院或机构官网，可参考；**C 级仅为线索，未经核实不得作为结论**。')
  out.push('- 涉及**出诊排班、号源、特殊资源（如抗蛇毒血清）**时，**以医院最新公布或电话确认为准**——本系统不推断当前出诊、不承诺号源、不把历史报道等同于当前可用。')
  out.push('- 本系统只提供医院资源与便民就医信息，**不做诊断、治疗或用药建议**；如症状紧急请立即拨打 **120**。')
  out.push('- 权威核实入口：医院官网 / 官方挂号渠道 / 当地卫生健康主管部门。')

  // 特殊资源专门提示（抗蛇毒血清等）
  if (intent.resources.length > 0) {
    out.push('')
    out.push('**⚠️ 特殊资源提示**（' + intent.resources.join('、') + '）')
    out.push(RESOURCE_CAVEAT)
  }

  // 出诊排班专门提示
  let scheduleNoHit = false
  if (intent.flags.schedule) {
    scheduleNoHit = !items.some((it) => SCHEDULE_HIT_RE.test((it.title || '') + ' ' + (it.snippet || '')))
    out.push('')
    out.push('**🗓 出诊 / 排班提示**')
    out.push(intent.specificDate ? SCHEDULE_DATE : SCHEDULE_FIXED)
    if (scheduleNoHit) out.push(SCHEDULE_NONE)
  }

  return {
    status: A.length ? (scheduleNoHit ? 'partial' : 'ok') : 'partial',
    answer: out.join('\n'),
    sources: items.map((it) => ({
      title: it.title, url: it.url, site: it.site, tier: it.tier,
      channels: it.channels, sourceUpdatedAt: it.date || null, queriedAt,
    })),
    query, intent, queriedAt,
    hospitals: extractHospitals(items),
  }
}
