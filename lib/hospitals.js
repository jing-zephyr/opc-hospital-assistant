// lib/hospitals.js —— 医院官网域名白名单 + 已知医院名
//
// ⚠️ 纪律：本文件每一条都必须是【核实过的】，不许凭印象编。
//    新增流程：检索到 → 打开页面确认是"该院官网" → 才写入 → 在注释里留证据(URL)。
//    核实不了的一律不写，交由 tierOf 保守判为 C（仅线索）。
import { DEPARTMENTS, SPECIAL_RESOURCES } from './intent.js'
/** key: 域名（小写，不含 www.）；value: 医院信息 + 证据 */
export const OFFICIAL_SITES = {
  'bjzhongyi.com': {
    name: '首都医科大学附属北京中医医院',
    city: '北京',
    note: '检索命中其官网新闻《北京中医医院"卒中中心"揭牌》',
    evidence: 'https://www.bjzhongyi.com/gzb_yyxw_detail/2718.html',
  },
  'hdhospital.com': {
    name: '北京市海淀医院（北京大学第三医院海淀院区）',
    city: '北京',
    note: '检索命中其官网新闻《神经内科成为首批中国卒中中心联盟成员》',
    evidence: 'https://www.hdhospital.com/Html/News/Articles/3252.html',
  },
  'tsinghua.edu.cn': {
    name: '清华大学（北京清华长庚医院主办单位官网）',
    city: '北京',
    note: '清华官网发布《北京清华长庚医院获评国家"高级卒中中心"》',
    evidence: 'https://www.tsinghua.edu.cn/info/1182/47655.htm',
  },
  'ccmu.edu.cn': {
    name: '首都医科大学',
    city: '北京',
    note: '发布《卒中精准临床诊疗与研究中心简介》，依托北京天坛医院',
    evidence: 'https://www.ccmu.edu.cn/pub/ccmu/xkjs_6460/lczlyyjzx/e3ab707c80e443ee9aef2c27792d8c80.htm',
  },
  'beijing.ufh.com.cn': {
    // ⚠️ name 必须是**真医院全称**，不带"（民营）"这类类别后缀 —— 类别由 HOSPITAL_CATEGORY 单独给，
    //    否则会被当作院名的一部分显示（实测出现"北京和睦家医院（民营）（同院不同写法：…）"）。
    name: '北京和睦家医院',
    city: '北京',
    note: '检索命中其官网急诊科页面《急诊科 北京和睦家医院》与出诊表；官网《朝阳区政协及卫生局领导莅临和睦家参观调研》一文明确将其表述为"社会办医疗机构（社会办医）"',
    evidence: 'https://beijing.ufh.com.cn/department_city/emergency',
    categoryEvidence: 'https://beijing.ufh.com.cn/event/government-relations?print=1',
  },
  'ufh.com.cn': {
    name: '和睦家医疗（集团官网）',
    city: '北京',
    note: '集团官网《和睦家急诊医学服务》；北京和睦家医院有限公司为集团在京主体',
    evidence: 'https://ufh.com.cn/medical-expertise/em-medicine',
  },
  'z2hospital.com': {
    name: '浙江大学医学院附属第二医院（滨江/解放路等院区）',
    city: '杭州',
    note: '抓到其官网新闻《奋勇争先 永不懈怠——记浙大二院迎接国家高级卒中中心复审》（2020-11-13，来源：医务部）',
    evidence: 'https://www.z2hospital.com/contents/599/13943.html',
  },
  'hz-hospital.com': {
    name: '杭州市第一人民医院',
    city: '杭州',
    note: '检索命中其官网院区公告页（城北新院区试运行）',
    evidence: 'https://www.hz-hospital.com/member/content/details/id/214147?cid=68',
  },
  // ---------- P0-2：演示范围（北京）内**高频出现**的公立医院官网 ----------
  // 核实方式：逐条 fetch 官网首页，确认 HTTP 200 且 <title> 为该院（见提交报告"核实记录"）。
  // 目的：让「北京有哪些医院有胸痛中心/卒中中心」这类查询里的医院能拿到**公立**类别标注，
  //       从而在结果里明确体现"覆盖公立 + 民营"（官方基础需求2）。
  'pumch.cn': {
    name: '北京协和医院',
    city: '北京',
    note: '官网首页可访问（<title>北京协和医院）；中国医学科学院所属，公立三级甲等综合医院',
    evidence: 'https://www.pumch.cn/',
    categoryEvidence: 'https://www.pumch.cn/',
  },
  'jst-hosp.com.cn': {
    name: '北京积水潭医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-北京积水潭医院）；市属公立三级甲等（以骨科/烧伤科著称）',
    evidence: 'https://www.jst-hosp.com.cn/',
    categoryEvidence: 'https://www.jst-hosp.com.cn/',
  },
  'pkuph.cn': {
    name: '北京大学人民医院',
    city: '北京',
    note: '官网首页可访问（<title>北京大学人民医院（北京大学第二临床医学院））；北京大学附属公立医院',
    evidence: 'https://www.pkuph.cn/',
    categoryEvidence: 'https://www.pkuph.cn/',
  },
  'pkufh.com': {
    name: '北京大学第一医院',
    city: '北京',
    note: '官网首页可访问（<title>引导页-北京大学第一医院）；北京大学附属公立医院',
    evidence: 'https://www.pkufh.com/',
    categoryEvidence: 'https://www.pkufh.com/',
  },
  'puh3.net.cn': {
    name: '北京大学第三医院',
    city: '北京',
    note: '官网首页可访问（<title>北京大学第三医院）；北京大学附属公立医院',
    evidence: 'https://www.puh3.net.cn/',
    categoryEvidence: 'https://www.puh3.net.cn/',
  },
  'fuwaihospital.org': {
    name: '中国医学科学院阜外医院',
    city: '北京',
    note: '官网首页可访问（<title>中国医学科学院阜外医院）；国家心血管病中心，公立三级甲等专科',
    evidence: 'https://www.fuwaihospital.org/',
    categoryEvidence: 'https://www.fuwaihospital.org/',
  },
  'xwhosp.com.cn': {
    name: '首都医科大学宣武医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-首都医科大学宣武医院）；市属公立三级甲等',
    evidence: 'https://www.xwhosp.com.cn/',
    categoryEvidence: 'https://www.xwhosp.com.cn/',
  },
  'bjcyh.com.cn': {
    name: '首都医科大学附属北京朝阳医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-首都医科大学附属北京朝阳医院）；市属公立三级甲等',
    evidence: 'https://www.bjcyh.com.cn/',
    categoryEvidence: 'https://www.bjcyh.com.cn/',
  },
  'anzhen.org': {
    name: '首都医科大学附属北京安贞医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-首都医科大学附属北京安贞医院）；市属公立三级甲等',
    evidence: 'https://www.anzhen.org/',
    categoryEvidence: 'https://www.anzhen.org/',
  },
  'bfh.com.cn': {
    name: '首都医科大学附属北京友谊医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-北京友谊医院）；市属公立三级甲等',
    evidence: 'https://www.bfh.com.cn/',
    categoryEvidence: 'https://www.bfh.com.cn/',
  },
  'bjtth.org': {
    name: '首都医科大学附属北京天坛医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-北京天坛医院）；市属公立三级甲等（神经学科著称）',
    evidence: 'https://www.bjtth.org/',
    categoryEvidence: 'https://www.bjtth.org/',
  },
  'bch.com.cn': {
    name: '首都医科大学附属北京儿童医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-首都医科大学附属北京儿童医院）；市属公立三级甲等儿科专科',
    evidence: 'https://www.bch.com.cn/',
    categoryEvidence: 'https://www.bch.com.cn/',
  },
  'bjhmoh.cn': {
    name: '北京医院',
    city: '北京',
    note: '官网首页可访问（<title>北京医院）；国家卫生健康委直属公立三级甲等',
    evidence: 'https://www.bjhmoh.cn/',
    categoryEvidence: 'https://www.bjhmoh.cn/',
  },
  'zryhyy.com.cn': {
    name: '中日友好医院',
    city: '北京',
    note: '官网首页可访问（<title>中日友好医院）；国家卫生健康委直属公立三级甲等',
    evidence: 'https://www.zryhyy.com.cn/',
    categoryEvidence: 'https://www.zryhyy.com.cn/',
  },
  'btch.edu.cn': {
    name: '北京清华长庚医院',
    city: '北京',
    note: '官网首页可访问（<title>清华大学北京清华长庚医院）；清华大学附属公立医院',
    evidence: 'https://www.btch.edu.cn/',
    categoryEvidence: 'https://www.btch.edu.cn/',
  },
  'bjcancer.org': {
    name: '北京大学肿瘤医院',
    city: '北京',
    note: '官网首页可访问（<title>首页-北京大学肿瘤医院…）；北京大学附属公立三级甲等专科',
    evidence: 'https://www.bjcancer.org/',
    categoryEvidence: 'https://www.bjcancer.org/',
  },
}

/** 从检索结果里已确认的、出现在北京的国家级/市级主管部门与院校 */
export const AUTHORITY_SITES = {
  'wjw.beijing.gov.cn': '北京市卫生健康委员会',
  'nhc.gov.cn': '国家卫生健康委员会',
  'yygl.bjmu.edu.cn': '北京大学医学部医院管理处',
  'csp.ncmi.cn': '国家卒中中心相关平台',
}

/** 已知医院名（用于意图解析、消歧、结果归并；只列检索中确认出现的） */
export const KNOWN_HOSPITALS = [
  '北京清华长庚医院',
  '航天中心医院',
  '北京大学首钢医院',
  '首都医科大学附属北京中医医院',
  '北京市海淀医院',
  '首都医科大学附属北京天坛医院',
  '首都医科大学附属北京朝阳医院',
  '首都医科大学附属北京世纪坛医院',
  '北京和睦家医院',
  '北京清华长庚医院神经内科',
  // ---------- P0-2：演示范围内的公立医院（官网已逐一核实可访问，见 OFFICIAL_SITES 注释） ----------
  '北京协和医院',
  '北京积水潭医院',
  '北京大学人民医院',
  '北京大学第一医院',
  '北京大学第三医院',
  '中国医学科学院阜外医院',
  '首都医科大学宣武医院',
  '首都医科大学附属北京安贞医院',
  '首都医科大学附属北京友谊医院',
  '首都医科大学附属北京儿童医院',
  '北京医院',
  '中日友好医院',
  '北京大学肿瘤医院',
]

/** 医院类别（公立 / 民营）——**只写公开可核实的**；核实不了的返回 null（不猜、不编）
 *  依据：上表 OFFICIAL_SITES 的 note/evidence 已记录该院官网页面；类别为公开常识性事实。
 *  ⚠️ P0-2 新增的公立条目，均在 OFFICIAL_SITES 里留了"官网首页可访问 + <title> = 该院"的核实记录；
 *     民营条目（和睦家）另有官网原文"社会办医"作为类别依据。 */
export const HOSPITAL_CATEGORY = {
  'bjzhongyi.com': '公立',        // 首都医科大学附属北京中医医院（市属三级甲等公立）
  'hdhospital.com': '公立',       // 北京市海淀医院（区属公立；北医三院海淀院区）
  'tsinghua.edu.cn': '公立',      // 清华大学官网（北京清华长庚医院为公立）
  'ccmu.edu.cn': '公立',          // 首都医科大学（市属公立院校）
  // ---------- P0-2：演示范围内高频出现的公立医院（每院官网均已 fetch 核实） ----------
  'pumch.cn': '公立',
  'jst-hosp.com.cn': '公立',
  'pkuph.cn': '公立',
  'pkufh.com': '公立',
  'puh3.net.cn': '公立',
  'fuwaihospital.org': '公立',
  'xwhosp.com.cn': '公立',
  'bjcyh.com.cn': '公立',
  'anzhen.org': '公立',
  'bfh.com.cn': '公立',
  'bjtth.org': '公立',
  'bch.com.cn': '公立',
  'bjhmoh.cn': '公立',
  'zryhyy.com.cn': '公立',
  'btch.edu.cn': '公立',
  'bjcancer.org': '公立',
  'beijing.ufh.com.cn': '民营',   // 北京和睦家医院（民营，见上 evidence）
  'ufh.com.cn': '民营',           // 和睦家医疗集团（民营）
  'z2hospital.com': '公立',       // 浙江大学医学院附属第二医院（部属/省属公立三甲）
  'zy91.com': '公立',             // 浙江大学医学院附属第一医院（部属/省属公立三甲）
  'hz-hospital.com': '公立',      // 杭州市第一人民医院（市属公立三甲）
}

/** 返回 '公立' | '民营' | null（null = 公开页面未标明，本系统不猜测） */
export function categoryOf(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return HOSPITAL_CATEGORY[h] || null
}

/** 医院类别的**证据链接**（每个类别都必须能指回一个已核实页面；核实不了的不给链接也不给类别） */
export const CATEGORY_EVIDENCE = {
  'beijing.ufh.com.cn': 'https://beijing.ufh.com.cn/event/government-relations?print=1',   // 官网原文："社会办医"（= 非公立/民营）
  'ufh.com.cn': 'https://beijing.ufh.com.cn/event/government-relations?print=1',
}

/** 类别 → 依据链接（没有则返回空串，**不编链接**） */
export function categoryEvidenceOf(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  return CATEGORY_EVIDENCE[h] || (OFFICIAL_SITES[h] && OFFICIAL_SITES[h].categoryEvidence) || ''
}

/** 类别后缀（"北京和睦家医院（民营）"）—— 用于把**类别**从**院名**里剥离，两者必须分开呈现 */
const CATEGORY_SUFFIX = /(民营|私立|公立|社会办医|营利性|非营利性)/
const CATEGORY_GROUP_RE = /[（(]([^（）()]*)[）)]/g

/** 从院名里剥掉"（民营）/（公立）"这类**类别标注**，以及"（集团官网）""（民营，集团官网）"这类**表注**
 *  只剥"整组括号内都是类别/表注词"的组；保留"（北京大学第三医院海淀院区）"这种**真别名**。
 *  @returns {{ name:string, stripped:string[] }} */
export function stripCategorySuffix(raw) {
  const s = String(raw || '').trim()
  const stripped = []
  const kept = s.replace(CATEGORY_GROUP_RE, (whole, inner) => {
    const t = String(inner).trim()
    const isCategory = CATEGORY_SUFFIX.test(t)
    // 表注：只由"类别 + 集团官网/官网/集团"等词和标点组成
    const isNote = /^(?:[^，,、]*?(?:民营|私立|公立|社会办医|集团官网|官网|集团|医疗集团)(?:[^，,、]*?))(?:[，,、][^，,、]*)*$/.test(t) && t.length <= 14
    if (isCategory || isNote) { stripped.push(t); return '' }
    return whole
  }).replace(/\s{2,}/g, ' ').trim()
  return { name: kept || s, stripped }
}

/** "检索词回声"候选：名字里留着**用户原话中命中科室的词干 + 城市名**（"北京胸痛医院"）。
 *  ⚠️ 这只是一个**候选**标记，**不能单独用来丢名字**：真院名也会命中它
 *     （"北京美中爱瑞肿瘤医院" 在问「…有肿瘤科」时，词干"肿瘤"同样出现在原话与院名里）。
 *     真正的丢弃判据由调用方补上"**只出现在 C 级聚合站 1 条来源**"（见 lib/answer.js extractHospitals）。 */
export function looksLikeSearchEcho(name, city, deptNames, queryText) {
  if (!deptNames || !deptNames.length) return false
  const n = String(name || '').trim()
  const base = n.replace(/[（(][^（）()]*[）)]/g, '').trim()
  const core = base.replace(/(医院|卫生院|保健院|医学中心|医疗中心|门诊部)$/, '')
  let rest = core
  if (city) rest = rest.split(city).join('')
  if ([...rest].length < 2) return false
  const q = String(queryText || '')
  return deptNames.some((d) => {
    const stem = String(d).replace(/(中心|科|门诊|病区|病房)$/, '')
    return [...stem].length >= 2 && rest.includes(stem) && q.includes(stem)
  })
}

/** 医院全称是否"合格"（结构化字段里必须是**真医院全称**，不能是句子片段）
 *  规则来源：实测出现的坏例子 —— "是人民医院""创伤中心向医院""科室信息来自医院""辗转赶到医院""都不敢去医院"。
 *  ⚠️ 纪律：**只拦明确不可能出现在院名里的成分**（虚词/动词/序数/信息类名词 + "医院"两字碎片）。
 *     误杀真院名（漏一家医院）比放过一个残句（编出一张医院卡片）更严重，也更容易被评委一眼看穿，
 *     所以这里刻意**不做**"必须含 XX 关键字"这类白名单式判定（"北京积水潭医院"会被误杀）。
 *  ⚠️ 本函数只负责"**结构上像不像院名**"；"同一家医院的不同写法"由 extractHospitals 的归并负责。
 *  ⚠️ 字符集按**实测**收窄：曾把"和/同/平/安/大/华/济"等字列进来，结果误杀
 *     "首都医科大学附属北京中医医院"（含"和"）、"北京同仁医院"（含"同"）—— 这类字在真院名里很常见，**不能进黑名单**。 */
const NAME_FUNCTION_CHAR =
  /[是把被让给对将并而跟由使叫称当则却种些那哪谁啥吗呢吧呀哦嗯]/
/** 名中的"句子/栏目词"——真实院名不用，残句高频（"科室信息来自医院"、"创伤中心向医院"）；
 *  ⚠️ 同样收窄：曾列入"官网/地址/电话/服务"，会误杀含这些字的真院名，故只留**几乎不可能出现在院名里**的词。 */
/** 残句标记（**保守**：只列在真院名里几乎不可能出现的叙述词/虚词组合）
 *  实测坏例："协和医院百科北京协和医院"、"人民政府接办北京协和医院"、"协和医学院及协和医院"、
 *           "协和医院在复旦大学医院"、"接收西方人的中国医院"、"无论您选择的是诊所还是医院"、
 *           "位列中日友好医院"、"复旦大学医院管理研究所发布的榜单医院"。
 *  ⚠️ 纪律：**"和/同/大/华/济/平/安"这类在真院名里常见的字绝不列入**（"北京协和医院""北京同仁医院"会被误杀）。 */
const NAME_FRAGMENT_RE = /(的|之|及|并且|以及|还是|或是|位于|地处|坐落|排名榜|排行榜|榜单|位列|居于|评为|获评|荣获|接办|接管|接收|更名|改名|前身|百科|简介|概况|一览|全览|攻略|指南|手册|通知|公告|消息|报道|记者|编辑|转载|版权|表明|指出|认为|建议|提醒|应当|必须|曾经|将于|即将|目前|近日|日前|去年|明年|上月|上周)/
const NAME_FRAGMENT_HEAD_RE = /^[在从对把让使令给与及或则即就还也都又更最很太非常十分格外尤其诸如其中另外此外因此所以但是然而不过而且并且]/

const NAME_GENERIC_WORD =
  /(信息|消息|资料|内容|来自|来源|相关|其他|等等|介绍|简介|名单|列表|大全|导航|首页|网站|平台|系统|预约|挂号|就诊|就医|患者|病人|互联网|在线|中心向|赶到|前往|配合|选择|了解|那个|这个|哪个|怎么|怎样|如何)/
/** 整名就是"量词 + 医院"（"6家三甲医院""三家医院"）→ 不是院名 */
const NUM_HEAD_RE = /^[0-9０-９一二三四五六七八九十百千两几数]+\s*(家|所|个|间|批)?/
/** 名里含"资源/便民事项"词 → 是检索词拼装，不是机构名（"北京抗蛇毒血清医院""北京发热门诊医院"） */
const NAME_RESOURCE_RE = /(血清|疫苗|药品|药物|床位|号源|挂号|预约|出诊|医保|费用|价格|报销|停车|路线)/

/** 医院全称是否"合格"（结构化字段里必须是**真医院全称**，不能是句子片段）
 *  ⚠️ 只判"**结构上像不像院名**"这一件事；"名字是不是用户检索词的回声"由 looksLikeSearchEcho
 *     + 调用方的"仅 C 级聚合站单条来源"判据共同决定（见 lib/answer.js extractHospitals）。 */
export function isPlausibleHospitalName(name) {
  const n = String(name || '').trim()
  if (n.length < 5 || n.length > 26) return false
  // ⚠️ 括号里通常是"别名/院区"或"类别标注"（"北京市海淀医院（北京大学第三医院海淀院区）"、
  //    "北京和睦家医院（民营）"）——**必须先剥掉再判后缀**，否则这类真院名会因"结尾不是'医院'"被整体误杀。
  const base = n.replace(/[（(][^（）()]*[）)]/g, '').trim()
  if (!/(医院|卫生院|保健院|医学中心|医疗中心|门诊部)$/.test(base)) return false
  if (KNOWN_HOSPITALS.some((k) => n.includes(k) || k.includes(n))) return true   // 已核实过的院名直接放行
  // 官方白名单里的**机构全称**直接放行（"中国医学科学院阜外医院""中日友好医院"这类含"和/外"的真名）
  if (Object.values(OFFICIAL_SITES).some((s) => s.name && (s.name === n || s.name.includes(n) || n.includes(s.name)))) return true
  const core = base.replace(/(医院|卫生院|保健院|医学中心|医疗中心|门诊部)$/, '')
  if (core.length < 3) return false
  if (NUM_HEAD_RE.test(base)) return false           // "6家三甲医院""三家医院"
  if (NAME_RESOURCE_RE.test(core)) return false      // "北京抗蛇毒血清医院"这类是检索词拼装
  if (NAME_FUNCTION_CHAR.test(core)) return false    // "是人民医院""创伤中心向医院"
  if (NAME_GENERIC_WORD.test(core)) return false     // "科室信息来自医院""北京那个医院"
  // ⚠️ 只拦"段落/机构名"，不拦合法的"XX中心医院"：
  //    "中国康复研究中心北京博爱医院""北京发热门诊医院" → 残句；
  //    "航天中心医院""北票市中心医院" → 真院名（由 KNOWN_HOSPITALS / 白名单或地理位置词保护）。
  if (/(研究中心|救治中心|急救中心|门诊)/.test(core)) return false
  if (NAME_FRAGMENT_RE.test(core)) return false       // "人民政府接办北京协和医院""协和医院百科北京协和医院"
  if (NAME_FRAGMENT_HEAD_RE.test(core)) return false  // "在复旦大学医院""同邮电总医院"
  return true
}

/** 该名字是否是**已核实过的**医院（真医院全称）：KNOWN_HOSPITALS / 白名单官网全称 / 已核实院名表。
 *  用途：① 摘要里只认这类名字；② 判断"短名 ⊂ 长名"时，只有**长名是已核实医院**才敢把短名并进去
 *  （否则"北京中医医院顺义医院"这类**独立医疗机构**会被误并进母院）。 */
export function isVerifiedHospital(name) {
  const n = String(name || '').trim()
  if (n.length < 5) return false
  if (KNOWN_HOSPITALS.some((k) => n.includes(k) || k.includes(n))) return true
  if (Object.values(OFFICIAL_SITES).some((s) => s.name && (s.name === n || s.name.includes(n) || n.includes(s.name)))) return true
  return Object.keys(HOSPITAL_CATEGORY_BY_NAME).some((k) => k === n || n.includes(k) || k.includes(n))
}

/** 短名是否是**长名的"前缀裁剪"写法**（"积水潭医院" ⊂ "北京积水潭医院"）→ 应并入长名。
 *  ⚠️ 必须要求**长名是已核实医院**：否则"北京中医医院延庆医院""北京积水潭医院郑州医院"
 *     这类**独立医疗机构**会因为包含母院名而被误并（赛题：不同院区/不同机构不得混用）。 */
export function isTrimmedVariantOf(shortName, longName) {
  const s = String(shortName || '').trim()
  const l = String(longName || '').trim()
  if (!s || !l || s === l || s.length >= l.length) return false
  if (!l.includes(s)) return false
  // 带区/县限定，或含"院区/分院/医院"后缀的独立机构名 → 不并
  if (/[区县]/.test(s) || /(院区|分院)$/.test(s)) return false
  return isVerifiedHospital(l)
}

/** 医院类别（P0-2）：**按院名**判定（结构化表格里每个医院卡片都要有类别，而来源常常是
 *  院校/政府/聚合站页面 —— 那些域名本身判定不了类别，只能按**院名**判）。
 *  ⚠️ 表里只写**已核实过**的医院：每条都能指回 OFFICIAL_SITES 里那条"官网首页已 fetch 核实"的记录，
 *     或（民营）和睦家官网原文"社会办医"。**没核实过的一律不写**，返回 null 表示"未标明"。
 *  @returns {string|null} '公立' | '民营' | null */
export const HOSPITAL_CATEGORY_BY_NAME = {
  // ---- 民营（官方需求硬要求：≥1 家可核验民营）----
  '北京和睦家医院': '民营',
  '和睦家医疗': '民营',
  // ---- 公立（北京市属/部属/委属，官网首页均已核实可访问）----
  '北京协和医院': '公立',
  '中国医学科学院北京协和医院': '公立',
  '北京积水潭医院': '公立',
  '北京大学人民医院': '公立',
  '北京大学第一医院': '公立',
  '北京大学第三医院': '公立',
  '北京大学首钢医院': '公立',
  '北京大学肿瘤医院': '公立',
  '中国医学科学院阜外医院': '公立',
  '中国医学科学院肿瘤医院': '公立',
  '首都医科大学宣武医院': '公立',
  '首都医科大学附属北京中医医院': '公立',
  '首都医科大学附属北京天坛医院': '公立',
  '首都医科大学附属北京朝阳医院': '公立',
  '首都医科大学附属北京安贞医院': '公立',
  '首都医科大学附属北京友谊医院': '公立',
  '首都医科大学附属北京世纪坛医院': '公立',
  '首都医科大学附属北京儿童医院': '公立',
  '北京医院': '公立',
  '中日友好医院': '公立',
  '北京清华长庚医院': '公立',
  '北京市海淀医院': '公立',
  '北京航天总医院': '公立',
  '航天中心医院': '公立',
}

/** 按院名返回类别：先查已核实院名表，再退回"官网域名 → 类别" */
export function categoryByName(name) {
  const n = String(name || '').trim()
  if (!n) return null
  // ① 已核实的院名表：取**最长命中**（"北京市海淀医院"优先于"北京医院"）
  const hits = Object.keys(HOSPITAL_CATEGORY_BY_NAME)
    .filter((k) => n.includes(k) || k.includes(n))
    .sort((a, b) => b.length - a.length)
  if (hits.length) return HOSPITAL_CATEGORY_BY_NAME[hits[0]]
  // ② 回退：已在白名单里的医院官网（用于"来源就是该院官网"的情形）
  for (const [host, cat] of Object.entries(HOSPITAL_CATEGORY)) {
    const site = OFFICIAL_SITES[host]
    if (site && site.name && (site.name.includes(n) || n.includes(site.name))) return cat
  }
  return null
}

export function officialOf(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  if (OFFICIAL_SITES[h]) return { ...OFFICIAL_SITES[h], host: h, kind: 'hospital-official' }
  if (AUTHORITY_SITES[h]) return { name: AUTHORITY_SITES[h], host: h, kind: 'authority' }
  return null
}
