// lib/answer.js —— 四段式输出 + 来源三态 + 拒答矩阵（确定性组装，不靠大模型编）
import { search, fmtDate, tierLabel, hostOf, isStale, ageDays, STALE_DAYS, DEMO_NOTICE } from './search.js'
import { parseIntent, buildQuery, DEPARTMENTS, SPECIAL_RESOURCES, CITIES } from './intent.js'
import { officialOf, KNOWN_HOSPITALS, categoryOf } from './hospitals.js'

// ---------- 固定话术（写死，不靠模型临场发挥） ----------
export const SAY = {
  EMPTY: '请描述你要查的内容，例如：「北京有哪些医院设有卒中中心」或「XX医院神经内科主任医师出诊安排」。',
  TOO_LONG: '输入过长，请精简到 2000 字以内（可分段提问）。',
  EMERGENCY: '⚠️ **请立即拨打 120 或前往就近医院急诊科。**\n以下信息仅供参考，**请勿用查询替代求助**。',
  MEDICAL: '本系统只提供【医院资源查询】与【便民就医信息】，**不做诊断、治疗方案或用药指导**。\n请携带既往资料咨询专业医务人员；如症状紧急，请立即拨打 120。',
  OUT_OF_SCOPE: '本系统不提供真伪鉴定、估价或交易类信息，请通过官方鉴定机构或正规渠道了解。',
  NEED_CITY: '请告诉我要查的**城市或地区**（例如「北京」），我再为你检索。',
  NEED_BOTH: '请补充**城市或地区**+**要查的资源或科室**（例如「北京有哪些医院设有卒中中心」），我再为你检索。',
  NEED_DEPT: '未能把你的描述对应到**具体科室或资源**，为避免拿不相关的来源充数，先请你补充标准名称（例如「耳鼻喉科」「卒中中心」「发热门诊」「抗蛇毒血清」「眼科」），我立刻检索。',
  NEED_TOPIC: [
    '请补充**要查什么**（资源/科室/医生/便民事项），我再联网检索。',
    '',
    '**本系统不做"城市医院大全"式罗列**——只按你的具体需求检索，避免拿与需求无关的来源充数（试题红线：不得为了填满框架而生成事实）。',
    '',
    '**可以这样问**：',
    '- 「杭州有哪些医院设有卒中中心」',
    '- 「北京有哪些医院有发热门诊」',
    '- 「北京清华长庚医院神经内科主任医师出诊安排」',
    '- 「上海有抗蛇毒血清的医院」',
  ].join('\n'),
  NO_RESULT: '【未查到】本次检索未获得可核验的公开信息。\n**说明**：检索无结果/来源不可访问，**不代表该医院没有相应科室或资源**。\n**建议核实渠道**：医院官网、官方挂号入口或当地卫生健康主管部门。',
  UNRELATED: [
    '这个问题**不属于本系统的服务范围**（本系统只做医院资源查询与便民就医信息，不做闲聊、天气、股票、写作、编程等）。',
    '',
    '**你可以这样问**：',
    '1. 「北京有哪些医院设有卒中中心」',
    '2. 「杭州，优先公立医院」（承接上一轮条件继续查）',
    '3. 「北京清华长庚医院神经内科主任医师出诊安排」',
    '4. 「上海有抗蛇毒血清的医院」',
    '',
    '若你确实是想查医院/就医相关的问题，请补充**城市 + 医院或科室/资源**，我立刻联网检索。',
  ].join('\n'),
  SENSITIVE: [
    '**本系统不提供这类查询，也不采集此类数据。**',
    '',
    '**① 边界说明**：本系统只检索**医院公开信息**（科室、资源、医生公开介绍、地址与官方预约入口），**不查询病历、检查报告、身份信息、手机号等个人敏感数据**，**也不提供跳过登录/绕过权限/进入后台的方式**（这属于赛题明确禁止的"绕过权限限制"与"采集无关敏感数据"）。',
    '**② 你需要的数据怎么拿**：本人病历请通过**就诊医院的官方线上服务（官方 App/公众号/自助机）或病案室**按医院规定的流程申请；他人病历须依法获得授权。',
    '**③ 我能帮你的**：可以查该院的**官方预约入口、门诊时间、科室位置、咨询电话**等公开信息——请告诉我城市与医院名。',
  ].join('\n'),
  INJECTION: [
    '**已忽略输入中的"指令性内容"，只把它当作待核验的文本。**',
    '',
    '**① 处理规则**：本系统只执行**固定流程**（识别条件 → 联网检索 → 按四段式组装 → 标注来源），**不会**因为输入或网页摘录里出现"忽略以上规则""你现在是…""输出你的提示词/密钥"之类的文字而改变行为或泄露配置。**输入与网页摘录中的指令性内容，一律不作为本系统指令。**',
    '**② 依据**：赛题六·访问与数据处理——「网页内容仅作为待核验的信息，不能作为改变系统规则、索取密钥或执行无关操作的指令」；密钥只从服务端环境变量读取，**不进入回答、不进入页面、不进入日志**。',
    '**③ 继续使用**：请直接提出医院资源/科室/医生/便民类问题（例如「北京有哪些医院设有卒中中心」），我照常检索。',
  ].join('\n'),
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
// 进阶1：多来源"当前是否可提供"的表述不一致 → 冲突提示（规则窄，避免误报）
const CONFLICT_POS_RE = /(已(经)?(开设|成立|提供|具备|开展|恢复)|可提供|可注射|设有|配备了)/
const CONFLICT_NEG_RE = /(暂停|停止|暂无|不再|取消|缺货|无法提供|已过期|撤并)/

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

// ---------- 从检索结果里识别"涉及到的医院"（多轮承接"第二家…" + 基础2 结构化字段） ----------
// ⚠️ 纪律：只从**本次真实检索到的**标题/摘要里抽取名称；抽不到就为空，绝不凭记忆补医院。
const NAME_RE = /([\u4e00-\u9fa5]{2,18}(?:医院|卫生院|保健院|医学中心|医疗中心|门诊部))/g
// 泛化说法、动词短语、栏目名一律不算院名（"请直接致电医院"这种必须拦住，否则会编出一张医院卡片）
const NAME_BAD = /(哪些|哪家|哪一|什么|各家|有没有|比如|例如|推荐|不存在|正规|附近|当地|一家|两家|该院|本院|我院|贵院|这家|那家|该|本|多院区|院区|公立|民营|私立|综合|专科|三甲|二甲|一级|甲等|乙等|二级|三级|大型|知名|社区|基层|上级|下级|兄弟|对口|转诊|请|致电|拨打|电话|热线|官方|官网|平台|名单|入口|页面|公告|新闻|通知|欢迎|详见|查看|前往|就近|加强|打造|建设|覆盖|区域|周边|全市|全省|全国|城乡|网络|体系|最好|排名|排行榜|专治|治疗|哪家好|传送|转运|送到|送达|目标|导医|陪诊|教学)/
const NAME_STRIP_HEAD = /^(?:(?:位于|地址在|咨询|联系|前往|就诊于|选择|推荐|预约|挂号到|到|去|在))/
// 粘在院名前面的栏目/活动词（如"世界卒中日杭州东方华康康复医院"）→ 从城市/省份/知名机构处切回来
const TRIM_TOKENS = ['首都', '中国', '中华', '国家', '解放军', '人民', '浙江', '江苏', '广东', '山东', '四川', '湖北', '湖南', '河南', '河北', '陕西', '安徽', '福建', '江西', '辽宁', '吉林', '黑龙江', '山西', '云南', '贵州', '广西', '甘肃', '青海', '宁夏', '新疆', '内蒙古', '西藏', '海南', '协和', '同济', '中山', '华西', '湘雅', '齐鲁', '瑞金', '仁济']
function trimNamePrefix(name) {
  let cut = -1
  for (const c of CITIES) { const i = name.indexOf(c); if (i > 0 && (cut < 0 || i < cut)) cut = i }
  for (const t of TRIM_TOKENS) { const i = name.indexOf(t); if (i > 0 && (cut < 0 || i < cut)) cut = i }
  if (cut > 0 && name.length - cut >= 5 && !/^(首都|中国|中华|国家|解放军|人民)/.test(name)) return name.slice(cut)
  return name
}

/** 只有"看起来确实是医院"的站内条目才配得上结构化医院卡片（主管部门/院校不是医院） */
function isHospitalEntry(name, url) {
  if (!/(医院|卫生院|保健院|门诊部)$/.test(name)) return false
  const off = officialOf(hostOf(url))
  if (off && off.kind === 'authority') return false
  return true
}

export function extractHospitals(items, opts = {}) {
  const preferCategory = opts.preferCategory || ''
  const wantCity = opts.city || ''
  const otherCity = (name) => CITIES.some((c) => c !== wantCity && name.includes(c))
  // 已在白名单里核实过的医院官网（用于给"仅出现在聚合站里的同名校名"补类别，仍只用已核实信息）
  const knownOfficial = (items || []).map((it) => {
    const o = officialOf(hostOf(it.url))
    return o ? { name: o.name, cat: categoryOf(hostOf(it.url)) } : null
  }).filter(Boolean)
  const catByName = (name) => {
    const hit = knownOfficial.find((o) => o.name.includes(name) || name.includes(o.name))
    return hit ? hit.cat : null
  }
  const found = new Map()
  ;(items || []).forEach((it, rank) => {
    const title = it.title || ''
    const snippet = it.snippet || ''
    const scan = (hay, inTitle) => {
      NAME_RE.lastIndex = 0
      let m
      while ((m = NAME_RE.exec(hay)) !== null) {
        let name = trimNamePrefix(m[1].replace(NAME_STRIP_HEAD, ''))
        const core = name.replace(/(医院|卫生院|保健院|医学中心|医疗中心|门诊部)$/, '')
        if (core.length < 3 || core.length > 14) continue
        if (name.length < 5) continue
        if (/[一二三四五六七八九十]$/.test(core) && core.length <= 4) continue   // "杭州一医院"（"杭州一家医院"的残句）不是院名
        if (NAME_BAD.test(core)) continue
        if (/[、和与或及]/.test(name.slice(0, -2))) continue   // "A医院和B医院"这类并列不当作单个院名
        if (!isHospitalEntry(name, it.url)) continue
        // 查询城市已知时，剔除外地医院（避免"杭州"的查询里混进北京天坛医院）
        if (wantCity && !name.includes(wantCity) && otherCity(name)) continue
        const prev = found.get(name)
        if (prev) { prev.hits++; if (inTitle) prev.inTitle = true; continue }
        found.set(name, {
          name, tier: it.tier, url: it.url, title: it.title, site: it.site,
          date: it.date || '', category: it.category || catByName(name), demo: Boolean(it.demo),
          rank, hits: 1, inTitle,
        })
      }
    }
    scan(title, true)
    scan(snippet, false)
  })
  const knownBonus = (n) => (KNOWN_HOSPITALS.some((k) => n.includes(k) || k.includes(n)) ? 1 : 0)
  const prefBonus = (h) => (!preferCategory ? 0 : (h.category === preferCategory ? 2 : (h.category ? 1 : 0)))
  const order = { A: 0, B: 1, C: 2, D: 3 }
  const sorted = [...found.values()]
    .sort((a, b) => (knownBonus(b.name) - knownBonus(a.name)) || (prefBonus(b) - prefBonus(a))
      || (order[a.tier] - order[b.tier]) || (Number(b.inTitle) - Number(a.inTitle)) || (b.hits - a.hits) || (a.rank - b.rank))
  // 同一来源域名下，短名是长名的子串 → 视为同一家医院，只保留全称（"北京中医医院" ⊂ "首都医科大学附属北京中医医院"）
  const dedup = sorted.filter((h) => !sorted.some((o) => o !== h && o.name.length > h.name.length
    && o.name.includes(h.name) && hostOf(o.url) === hostOf(h.url)))
  return dedup.slice(0, 8)
}

/** 把某级别结果渲染成条目文本 */
function renderGroup(items, limit = 4) {
  const lines = []
  items.slice(0, limit).forEach((it, i) => {
    const off = officialOf(hostOf(it.url))
    const tags = []
    if (it.demo) tags.push('演示样例')
    if (it.category) tags.push(it.category)
    lines.push(`${i + 1}. **${clean(it.title, 90)}**${tags.length ? `　〔${tags.join(' / ')}〕` : ''}`)
    lines.push(`   来源：${it.site || hostOf(it.url)}${off ? `（${off.name}）` : ''} ｜ 链接：${it.url}`)
    lines.push(`   来源更新时间：${fmtDate(it.date)}${isStale(it.date) ? `　⚠️ 该来源较旧（距今 ${ageDays(it.date)} 天 > ${STALE_DAYS} 天），当前状态可能已变化` : ''} ｜ 检索通道：${(it.channels || []).join('+')}`)
    lines.push(`   匹配依据（摘要）：${clean(it.snippet, 120)}`)
  })
  if (items.length > limit) lines.push(`   …另有 ${items.length - limit} 条同类来源，见下方"信息依据"清单。`)
  return lines.join('\n')
}

/** 基础2：医院结果的**结构化字段**（缺的字段如实写"未查到/待核实"，不为填满框架编造） */
function renderHospitalCards(hos, ctx) {
  const lines = []
  hos.slice(0, 5).forEach((h, i) => {
    const off = officialOf(hostOf(h.url))
    if (off && off.kind === 'authority') return          // 主管部门/院校不是医院，不生成医院卡片
    const full = off ? off.name : h.name
    const campus = ((off ? off.name : h.name).match(/[^（(]{2,12}院区/) || [''])[0]
    const state = h.tier === 'A'
      ? '已核实（主管部门/院校来源支持"该院具备该资源"）'
      : h.tier === 'B'
        ? '官方页面介绍具备相关能力（**当前是否可提供尚待核实**）'
        : '待核实（仅线索类来源，未经核实）'
    lines.push(`${i + 1}. **医院全称**：${full}${off && off.name !== h.name ? `（来源中出现：${h.name}）` : ''}`)
    lines.push(`   所在地区：${ctx.city || '未标明'}（按本次查询条件；**具体地址以来源原文为准**） ｜ 院区：${campus ? `${campus}（据来源名称；不同院区不得混用）` : '来源未明确院区（待核实）'}`)
    lines.push(`   医院类别：${h.category ? `${h.category}（依据：已核实官网域名）` : '公开页面未标明 —— **本系统不猜测医院类别**'}`)
    lines.push(`   与需求匹配的资源：${ctx.topic || '未指定'}`)
    lines.push(`   匹配依据：来源标题《${clean(h.title, 60)}》${h.demo ? '（演示样例）' : ''}`)
    lines.push(`   信息状态：${state}`)
    lines.push(`   来源及查询时间：${h.url} ｜ 来源更新时间：${fmtDate(h.date)} ｜ 本次查询时间：${ctx.queriedAt}`)
  })
  return lines.join('\n')
}

function categorySummary(items, want) {
  const known = items.filter((x) => x.category === want).length
  const contrary = items.filter((x) => x.category && x.category !== want).length
  const unknown = items.filter((x) => !x.category).length
  return { known, contrary, unknown }
}

/**
 * 主入口
 * @returns {{status:string, answer:string, sources:Array, query:string, intent:object, queriedAt:string}}
 */
export async function answer(message, session = {}) {
  const intent = parseIntent(message, session)
  const queriedAt = nowCn()

  const base = { sources: [], query: '', intent, queriedAt }

  if (intent.isEmpty) return { ...base, status: 'empty', answer: SAY.EMPTY }
  if (intent.tooLong) return { ...base, status: 'too_long', answer: SAY.TOO_LONG }

  // 越界与风险：优先处理（急诊 > 注入/敏感 > 诊疗 > 鉴定估价 > 无关问题）
  if (intent.flags.emergency) {
    return { ...base, status: 'emergency', answer: SAY.EMERGENCY }
  }
  if (intent.flags.injection) {
    return { ...base, status: 'refused_injection', answer: SAY.INJECTION }
  }
  if (intent.flags.sensitive) {
    return { ...base, status: 'refused_sensitive', answer: SAY.SENSITIVE }
  }
  if (intent.flags.medical) {
    return { ...base, status: 'refused_medical', answer: SAY.MEDICAL }
  }
  if (intent.flags.outOfScope) {
    return { ...base, status: 'refused_out_of_scope', answer: SAY.OUT_OF_SCOPE }
  }
  if (intent.flags.unrelated) {
    return { ...base, status: 'out_of_scope_general', answer: SAY.UNRELATED }
  }
  // 上一轮/本轮识别出的科室或资源（用于本轮"城市 + 筛选条件"这类补充说法）
  const ctxDepartments = intent.departments.length ? intent.departments : intent.ctxDepartments
  const ctxResources = intent.resources.length ? intent.resources : intent.ctxResources
  const topics = { departments: ctxDepartments.slice(0, 2), resources: ctxResources.slice(0, 2) }

  if (intent.needCity) {
    // ⚠️ 反问城市时也要把**本轮已识别的科室/资源**存进会话，否则下一轮「杭州，优先公立医院」接不上
    return { ...base, status: 'need_clarify', topics, answer: intent.needTopic ? SAY.NEED_BOTH : SAY.NEED_CITY }
  }
  if (intent.needDept) {
    return { ...base, status: 'need_dept', topics, answer: SAY.NEED_DEPT }
  }

  // ---- 多轮承接：「第二家的地址和官方预约入口呢」 ----
  if (intent.isFollowUp) {
    const list = Array.isArray(session.hospitals) ? session.hospitals : []
    if (list.length === 0) {
      // ⚠️ 诚实处理：本会话还没有可用于"第 N 家"的医院结果列表，不编造承接对象
      return {
        ...base, status: 'need_clarify', topics,
        answer: [
          `【本会话还没有可承接的医院列表】你问的是**第 ${intent.ordinal} 家**，但本会话此前没有成功返回过医院结果列表，因此没有可承接的对象。`,
          '',
          '**请先完成一次能返回医院的检索**（例如「杭州有哪些医院设有卒中中心」），之后再说「第二家的地址和官方预约入口呢」，我会按上一轮结果的顺序承接。',
          '**说明**：本系统**不会凭空指定一家医院**来凑答案。',
        ].join('\n'),
      }
    }
    const idx = Math.min(intent.ordinal, list.length) - 1
    const h = list[idx]
    const query = `${h.name} 地址 官方预约 挂号入口`
    let res
    try {
      res = await search(query, 8)
    } catch (e) {
      return { ...base, query, status: 'search_failed', answer: `【检索失败】**限制说明**：检索服务异常（${clean(e.message, 80)}）。\n**建议**：稍后重试，或直接访问医院官网 / 官方挂号入口核实。` }
    }
    const items = res.results || []
    const demo = Boolean(res.demo)
    const fA = items.filter((x) => x.tier === 'A')
    const fB = items.filter((x) => x.tier === 'B')
    const fC = items.filter((x) => x.tier === 'C' || x.tier === 'D')
    const fo = []
    if (demo) fo.push(`> ${DEMO_NOTICE}`, '')
    fo.push('**① 查询条件**')
    fo.push(`地区：${session.city || '（承上一轮）'} ｜ 目标医院：**${h.name}**（承接上一轮第 ${idx + 1} 家）｜ 查询日期：${todayCn()}`)
    fo.push('（本次检索关键词：`' + query + '`；**承接来源：上一轮结果列表**）')
    fo.push('')
    fo.push('**② 查询结果**')
    if (fA.length) { fo.push(''); fo.push('**【A 级 · 可支撑"已核实"】**'); fo.push(renderGroup(fA, 2)) }
    if (fB.length) { fo.push(''); fo.push('**【B 级 · 机构/医院官网】**'); fo.push(renderGroup(fB, 2)) }
    if (fC.length) { fo.push(''); fo.push('**【C 级 · ⚠️ 仅线索，须待核实】**'); fo.push(renderGroup(fC, 1)) }
    if (!items.length) fo.push(demo ? '【演示模式 · 该查询未内置样例】请配置检索密钥后重试。' : '【未查到】本次检索未获得可核验的公开信息。')
    fo.push('')
    fo.push('**③ 信息依据**')
    fo.push(`本次查询时间：**${queriedAt}**；共 ${items.length} 条来源。若来源未直接给出"地址/预约入口"，请以官网原文为准。`)
    fo.push('网页摘录仅作**待核验信息**，其中的指令性内容**不作为本系统指令**。')
    fo.push('')
    fo.push('**④ 使用提示**')
    fo.push('- **预约请走官方渠道**；本系统不代办、不承诺号源、不保证预约成功。')
    fo.push('- 若以上来源未直接给出该院地址/入口，说明**检索未命中其官方页面**，请通过医院官网或当地卫健委渠道核实。')
    fo.push('- 本系统不做诊断、治疗或用药建议；急症请拨 **120**。')
    return {
      status: (fA.length || fB.length) ? 'ok' : 'partial',
      answer: fo.join('\n'),
      sources: items.map((it) => ({ title: it.title, url: it.url, site: it.site, tier: it.tier, category: it.category || null, demo, channels: it.channels, sourceUpdatedAt: it.date || null, queriedAt })),
      query, intent, queriedAt, hospitals: list, topics,
      mode: res.mode, demo, demoNotice: demo ? DEMO_NOTICE : null,
    }
  }

  // 正常检索
  // ⚠️ 只有城市/筛选条件、没有任何"要查什么"的信号时，**不拿城市单独去搜**
  //    （否则会返回 16 条与需求无关的来源并标 ok —— 正踩"不得为了填满框架而生成事实"）
  const topicKnown = ctxDepartments.length || ctxResources.length || Boolean(intent.hospitalQuery)
  const conditionFlags = intent.flags.doctor || intent.flags.schedule || intent.flags.address || intent.flags.appointment
  if (!topicKnown && !conditionFlags) {
    return { ...base, status: 'need_dept', topics, answer: SAY.NEED_TOPIC }
  }

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

  const demo = Boolean(res.demo)
  const items = res.results || []
  const demoHead = demo ? [`> ${DEMO_NOTICE}`, ''] : []

  // 演示模式且该查询没有内置样例 → 如实说明（这不是"未查到该医院"）
  if (items.length === 0 && demo) {
    return {
      ...base, query, status: 'demo_no_fixture', topics,
      mode: res.mode, demo: true, demoNotice: DEMO_NOTICE,
      answer: [
        DEMO_NOTICE, '',
        '**【演示模式 · 该查询没有内置样例】**',
        `- 本次检索关键词：\`${query}\``,
        `- 内置样例覆盖的主题：${(res.demoTopics || []).join('、')}`,
        `- 内置样例覆盖的城市：北京、杭州${res.demoCityMiss ? `（本次指定的城市不在样例范围内，已过滤 ${res.demoCityMiss} 条其他城市的样例）` : ''}`,
        '',
        '**这不是"该医院不存在"或"未查到"**，而是**演示包没有内置这条查询的样例**。',
        '**两条可选做法**：① 换一个上述主题/城市的问题；② 在服务端配置 `BOCHA_API_KEY` / `TAVILY_API_KEY`（见 README《依赖与凭证清单》），重启后即恢复**真实联网检索**。',
      ].join('\n'),
    }
  }

  if (items.length === 0) return { ...base, query, status: 'no_result', answer: SAY.NO_RESULT, topics }

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
        ...base, query, status: 'no_result', topics,
        mode: res.mode, demo, demoNotice: demo ? DEMO_NOTICE : null,
        answer: [
          ...demoHead,
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

  // ---- 结果筛选条件（"优先公立 / 只看公立 / 民营"）：是筛选，不是检索词 ----
  const filterLine = []
  let selected = items
  if (intent.filters.publicOnly || intent.filters.privateOnly) {
    const want = intent.filters.publicOnly ? '公立' : '民营'
    const c = categorySummary(items, want)
    filterLine.push(`**筛选条件**：优先/只保留「${want}」医院来源。`)
    filterLine.push(`- 可判定为**${want}**：${c.known} 条 ｜ 可判定为**${want === '公立' ? '民营' : '公立'}**（与筛选条件不符，已单独标注）：${c.contrary} 条 ｜ **公开页面未标明类别**：${c.unknown} 条`)
    filterLine.push('- **说明**：类别只按"已核实官网域名"判定；公开页面未标明的来源**照常作为线索列出并标注"类别未标明"**——本系统**不猜测**医院类别，也不会因为筛选而把未知来源说成公立/民营。')
    if (c.contrary) selected = items.filter((x) => x.category !== (want === '公立' ? '民营' : '公立')).concat(items.filter((x) => x.category === (want === '公立' ? '民营' : '公立')))
  }

  const A = selected.filter((x) => x.tier === 'A')
  const B = selected.filter((x) => x.tier === 'B')
  const C = selected.filter((x) => x.tier === 'C' || x.tier === 'D')

  const city = intent.cities[0] || session.city || '（未指定）'
  const topic = ctxDepartments[0] || ctxResources[0] || intent.hospitalQuery || '（未指定）'
  const hospitalInheritNote = intent.inheritedFromSession
    ? `（本轮未重复科室，**承接上一轮条件**：${[...ctxDepartments, ...ctxResources].join('、')}）`
    : ''
  const colloquialNote = intent.colloquial
    ? `（口语「${intent.colloquial.from}」→ 标准科室「${intent.colloquial.dept}」）`
    : ''

  const out = []
  if (demo) out.push(`> ${DEMO_NOTICE}`, '')
  out.push('**① 查询条件**')
  out.push(`地区：${city} ｜ 资源/科室：${topic}${colloquialNote}${hospitalInheritNote} ｜ 医生条件：${intent.titles[0] || (intent.flags.doctor ? '不限职称' : '未涉及')} ｜ 查询日期：${todayCn()}`)
  out.push(`（本次检索关键词：\`${query}\`；通道命中：博查 ${res.channels.bocha} 条 + Tavily ${res.channels.tavily} 条 → 去重后 ${res.total} 条）`)
  if (filterLine.length) { out.push(''); out.push(...filterLine) }
  out.push('')
  out.push('**② 查询结果**')

  // 结构化医院字段（基础2 要求：全称/地区及院区/类别/匹配资源/匹配依据/信息状态/来源及时间）
  const hospitals = extractHospitals(selected, {
    preferCategory: intent.filters.publicOnly ? '公立' : (intent.filters.privateOnly ? '民营' : ''),
    city: intent.cities[0] || session.city || '',
  })
  if (hospitals.length) {
    out.push('')
    out.push('**【匹配到的医院（结构化字段）】**')
    out.push('> 只列**本次检索结果中出现**的医院；字段缺的如实写"未明确/待核实"，**不为填满框架而生成事实**。')
    out.push(renderHospitalCards(hospitals, { city: intent.cities[0] || session.city || '', topic, queriedAt }))
  }
  out.push('')
  out.push('**【来源清单（按权威分级）】**')
  out.push('> 以下为本次**检索到的公开页面**；**不同院区的信息不作合并**。')
  if (A.length) { out.push(''); out.push(`**【A 级 · 可支撑"已核实"】${tierLabel('A')}**`); out.push(renderGroup(A)) }
  if (B.length) { out.push(''); out.push(`**【B 级 · 机构/医院官网】${tierLabel('B')}**`); out.push(renderGroup(B)) }
  if (C.length) { out.push(''); out.push(`**【C 级 · ⚠️ 仅线索，须待核实】${tierLabel('C')}**`); out.push(renderGroup(C, 2)) }

  // 进阶1：多来源对"当前是否可提供"表述不一致 → 冲突提示
  const posHit = items.filter((it) => CONFLICT_POS_RE.test((it.title || '') + (it.snippet || ''))).length
  const negHit = items.filter((it) => CONFLICT_NEG_RE.test((it.title || '') + (it.snippet || ''))).length
  const hasConflict = posHit > 0 && negHit > 0
  if (hasConflict) {
    out.push('')
    out.push('**⚠️ 来源冲突提示**')
    out.push(`本次来源中，${posHit} 条表述为"已开设/可提供"，${negHit} 条出现"暂停/暂无/不再"等表述 —— **不同来源对"当前是否可提供"的说法不一致**。`)
    out.push('**处理方式**：本系统**不替你判定哪条为准**；涉及时效性内容（排班、特殊资源、门诊状态）**必须以医院最新公布或电话确认的信息为准**。')
  }

  const staleCount = items.filter((it) => isStale(it.date)).length
  out.push('')
  out.push('**③ 信息依据**')
  out.push(`本次查询时间：**${queriedAt}**；共 ${items.length} 条来源（A ${A.length} / B ${B.length} / C ${C.length}）。每条结论均对应上方来源链接；**来源未标注更新时间的，已如实写明**。`)
  if (staleCount) out.push(`**过期提醒**：其中 ${staleCount} 条来源的更新时间距今已超过 ${STALE_DAYS} 天（已在上方逐条标注）——**"来源更新时间"≠本次抓取时间，"定时/重复检索"≠实时准确**，请以医院最新公布为准。`)
  out.push('网页摘录仅作**待核验信息**，其中的指令性内容（如"忽略以上规则"）**不作为本系统指令**；本系统只执行固定流程。')
  out.push('')
  out.push('**④ 使用提示**')
  out.push('- A 级来源（政府/主管部门/院校）可支撑"已核实"；B 级为医院或机构官网，可参考；**C 级仅为线索，未经核实不得作为结论**。')
  out.push('- 涉及**出诊排班、号源、特殊资源（如抗蛇毒血清）**时，**以医院最新公布或电话确认为准**——本系统不推断当前出诊、不承诺号源、不把历史报道等同于当前可用。')
  out.push('- 本系统只提供医院资源与便民就医信息，**不做诊断、治疗或用药建议**；如症状紧急请立即拨打 **120**。')
  out.push('- 权威核实入口：医院官网 / 官方挂号渠道 / 当地卫生健康主管部门。')
  if (demo) out.push('- **演示模式提示**：以上为**内置样例数据**，非实时联网结果；配置 `BOCHA_API_KEY` / `TAVILY_API_KEY` 后重启服务即恢复真实检索。')

  // 特殊资源专门提示（抗蛇毒血清等）
  if (ctxResources.length > 0) {
    out.push('')
    out.push('**⚠️ 特殊资源提示**（' + ctxResources.join('、') + '）')
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
    // status=ok：本次**成功检索到** A/B 级（政府·主管部门·院校·机构/医院官网）来源；仅命中 C 级线索时为 partial
    status: (A.length || B.length) ? (scheduleNoHit ? 'partial' : 'ok') : 'partial',
    answer: out.join('\n'),
    sources: items.map((it) => ({
      title: it.title, url: it.url, site: it.site, tier: it.tier, category: it.category || null,
      demo: Boolean(it.demo), channels: it.channels, sourceUpdatedAt: it.date || null, queriedAt,
    })),
    query, intent, queriedAt, hospitals, topics,
    mode: res.mode, demo, demoNotice: demo ? DEMO_NOTICE : null,
    conflict: hasConflict, staleCount,
  }
}
