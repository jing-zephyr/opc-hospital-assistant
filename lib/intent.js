// lib/intent.js —— 规则式意图解析（不依赖大模型：零幻觉、零成本、可解释）
// 会话上下文：parseIntent(message, session) —— 第 2 轮「杭州，优先公立医院」这类"城市 + 筛选条件"
// 必须复用上一轮的科室/资源，否则会退化成"杭州 优先公立医院"（→ no_result）。
import {
  CITIES as SUPPORTED_CITIES, PRIMARY_CITY, RADIATING_CITIES,
  PROVINCES, PROVINCE_CITIES, detectRegion, looksLikeRegion,
} from './cities.js'

/** 城市词表（= **本作品承诺的演示范围**：北京 + 8 个辐射城市，见 lib/cities.js）。
 *  ⚠️ 这里**重新导出**，保持既有 `import { CITIES } from './intent.js'` 的调用方不用改。
 *  ⚠️ 甲方口径：**主打北京，辐射已有的 8 个城市，不再扩城市** —— 词表外地名靠"如实说明范围"处理。 */
export const CITIES = SUPPORTED_CITIES
export { PRIMARY_CITY, RADIATING_CITIES }

export const DEPARTMENTS = [
  '卒中中心', '胸痛中心', '创伤中心', '危重孕产妇救治中心', '危重新生儿救治中心',
  '急诊科', '发热门诊', '耳鼻咽喉头颈外科', '耳鼻喉科', '神经内科', '神经外科',
  '心血管内科', '心内科', '呼吸内科', '消化内科', '内分泌科', '肾内科', '血液科',
  '肿瘤科', '骨科', '普外科', '泌尿外科', '妇产科', '儿科', '眼科', '口腔科',
  '皮肤科', '精神科', '康复科', '中医科', '针灸科', '感染科', '风湿免疫科', '老年医学科',
]

export const SPECIAL_RESOURCES = ['抗蛇毒血清', '蛇毒血清', '解毒血清']
export const DOCTOR_TITLES = ['主任医师', '副主任医师', '主治医师', '知名专家']

// ---------- 口语 → 标准科室（用户说"耳朵"，应检索"耳鼻喉"；映射不到时如实请用户补充） ----------
export const COLLOQUIAL = [
  { re: /(耳朵|耳聋|耳鸣|听力|中耳|耳道|耳科)/, dept: '耳鼻喉科', hint: '耳朵' },
  { re: /(鼻子|鼻炎|鼻窦|鼻塞|打鼾|嗅觉|鼻出血|流鼻血)/, dept: '耳鼻喉科', hint: '鼻子' },
  { re: /(嗓子|喉咙|咽喉|声音嘶哑|声带|扁桃体|卡了鱼刺)/, dept: '耳鼻喉科', hint: '嗓子/喉咙' },
  { re: /(中风|脑梗|脑卒中|脑出血|脑血栓)/, dept: '卒中中心', hint: '中风/脑梗' },
  { re: /(心口|心脏|心慌|心悸|冠心病|心肌|血压|高血压|心律失常|放支架)/, dept: '心血管内科', hint: '心脏/血压' },
  { re: /(头疼|头痛|头晕|手脚麻|癫痫|帕金森|面瘫|失眠|记忆减退)/, dept: '神经内科', hint: '头痛/头晕' },
  { re: /(咳嗽|哮喘|肺|气管|支气管|打呼噜|肺炎)/, dept: '呼吸内科', hint: '咳嗽/肺部' },
  { re: /(胃病|胃疼|胃痛|肚子疼|腹痛|腹泻|拉肚子|便秘|肝|胆|肠|反酸|烧心)/, dept: '消化内科', hint: '胃肠/肝胆' },
  { re: /(甲状腺|糖尿病|血糖|痛风|肥胖|更年期)/, dept: '内分泌科', hint: '甲状腺/血糖' },
  { re: /(尿|肾|前列腺|结石|血尿)/, dept: '泌尿外科', hint: '泌尿/前列腺' },
  { re: /(骨折|腰|关节|颈椎|腰椎|膝盖|肩膀|扭伤|摔伤|椎间盘)/, dept: '骨科', hint: '骨与关节' },
  { re: /(眼睛|视力|白内障|近视|青光眼|眼底|看不清)/, dept: '眼科', hint: '眼睛/视力' },
  { re: /(牙|牙齿|口腔|种植牙|智齿|牙疼)/, dept: '口腔科', hint: '牙齿/口腔' },
  { re: /(皮肤|皮疹|湿疹|痘痘|痤疮|白癜风|脱发|荨麻疹)/, dept: '皮肤科', hint: '皮肤' },
  { re: /(月经|妇科|怀孕|孕|子宫|卵巢|乳腺|产检)/, dept: '妇产科', hint: '妇科/孕产' },
  { re: /(小孩|儿童|宝宝|婴儿|新生儿)/, dept: '儿科', hint: '儿童' },
  { re: /(肿瘤|癌症|癌|化疗|放疗|结节)/, dept: '肿瘤科', hint: '肿瘤/结节' },
  { re: /(心理|抑郁|焦虑|精神|情绪|自闭)/, dept: '精神科', hint: '心理/情绪' },
  { re: /(康复|理疗|针灸|推拿|中医)/, dept: '康复科', hint: '康复/中医' },
  { re: /(发烧|发热|体温)/, dept: '发热门诊', hint: '发热' },
]

export function mapColloquial(text) {
  for (const c of COLLOQUIAL) {
    const m = String(text || '').match(c.re)
    if (m) return { dept: c.dept, from: m[0], hint: c.hint }
  }
  return null
}

// ---------- 紧急求助（P0 修复：专有名词优先，症状才判急诊） ----------
// ⚠️ 关键修复：**「胸痛」是国家卫健委推动建设的五大救治中心名称的一部分**
//    （胸痛中心 / 卒中中心 / 创伤中心 / 危重孕产妇救治中心 / 危重新生儿救治中心），
//    问「北京有哪些医院有胸痛中心」是**查资源**，不是**说自己胸痛**。
//    实测：修复前该问句被判 emergency、来源 0 条 —— 官方示例问法直接不可用。
//    规则：先剥掉"科室/资源专名"，再在**剩下的话**里找症状词。
const DEPT_RESOURCE_RE = /(危重孕产妇救治中心|危重新生儿救治中心|胸痛中心|卒中中心|创伤中心|救治中心|胸痛单元|胸痛门诊|急诊科|急诊中心|发热门诊|门诊部|专科|科室|病房|病区|中心)/g

/** 剥掉"科室/资源专名"后的剩余文本（用于症状判定，避免专有名词误触发急诊） */
export function stripDeptResource(text) {
  return String(text || '').replace(DEPT_RESOURCE_RE, ' ')
}

// 症状词（本轮出现这些才可能是"我自己不舒服"）
// ⚠️ 收窄为**症状叙述**用词："胸痛/胸口疼"仍保留（普通用户描述症状最常用），
//    但"胸痛中心"已在上面被剥掉，因此不影响专有名词问法。
const SYMPTOM_RE = /(胸痛|胸口|心口|胸闷|大出血|出血不止|呼吸困难|喘不上气|昏迷|抽搐|意识不清|快不行|救命|急救|车祸|中毒|晕倒|晕厥|休克|窒息|喘不过来)/
// 明确求助意图（"怎么办/去哪儿/打什么电话"这类）
const HELP_RE = /(怎么办|咋办|怎么处理|如何处理|去哪里|去哪|去哪儿|上哪|打什么电话|打哪个电话|求助|急诊在哪|该去哪)/
const EMERGENCY_RE = /(大出血|出血不止|呼吸困难|喘不上气|昏迷|抽搐|意识不清|快不行|救命|急救|车祸|中毒|晕倒|晕厥|休克|窒息)/
const MEDICAL_RE = /(怎么治|如何治|治疗方案|吃什么药|用什么药|用药|开药|处方|诊断一下|我是不是得|能不能治好|要不要手术|剂量|吃什么能好)/
const SCHEDULE_RE = /(出诊|门诊时间|排班|什么时候出诊|挂号|预约|号源|停诊|加号)/
const DOCTOR_RE = /(医生|医师|专家|擅长|大夫|主任|教授)/
const APPOINTMENT_RE = /(预约|挂号|官方入口|怎么挂|咨询电话|联系电话)/
const ADDRESS_RE = /(地址|在哪|怎么走|院区|分院|位置)/
const AUTHENTICATE_RE = /(鉴定|估价|值多少钱|真假|真伪|交易|拍卖|收购)/

// ---------- 结果筛选条件（"优先公立医院""只看民营"）——是**筛选**，不是检索词 ----------
const FILTER_PUBLIC_RE = /(优先公立|公立优先|只看公立|仅看公立|只查公立|只保留公立|要公立|公立医院|公立的|公立三甲)/
const FILTER_PRIVATE_RE = /(优先民营|民营优先|只看民营|仅看民营|只查民营|私立医院|民营医院|民营的|私立的)/

// ---------- 敏感请求（不采集病历/身份等与赛题无关的数据；不绕过登录与权限） ----------
const SENSITIVE_RE = /((跳过|绕过|破解|越权|黑进|入侵|不登录|免登录)[^\u3002\uff0c]{0,12}(登录|权限|系统|后台|接口|账号))|((查|查询|获取|导出|下载|调取|拿到|窃取)[^\u3002\uff0c]{0,8}(病历|患者信息|病人信息|就诊记录|检查报告|检验报告|身份证号|手机号|个人信息|隐私))/
// ---------- 提示词注入（用户输入中的"改规则/要密钥"类指令，以及网页摘录中的指令性内容，一律不作为指令） ----------
const INJECTION_RE = /(忽略(以上|之前|上述|前面|所有)?[^\u3002\uff0c]{0,6}(规则|指令|提示|要求|设定)|ignore\s+(all\s+)?(previous|above|prior)\s+instructions|你现在是|从现在开始你|system\s*prompt|系统提示词|输出你的(提示词|规则|设定|指令)|泄露(你的)?(密钥|提示词|规则)|越狱|开发者模式|jailbreak|api\s*key|密钥是什么)/i
// ---------- 无关问题（试题基础7 点名的一类，应给明确提示而不是拿去做医院检索） ----------
const CHITCHAT_RE = /^(你好|您好|hi|hello|hey|嗨|在吗|在么|谢谢|多谢|感谢|再见|拜拜|早上好|中午好|晚上好|哈喽)[\s!！。.~？?]*$/i
const UNRELATED_RE = /(天气|气温|下雨|空气质量|股票|基金|彩票|汇率|笑话|唱歌|讲个故事|写代码|编程|翻译|数学题|几点了|今天星期几|你是谁|你叫什么|介绍一下你自己|吃什么饭|点外卖|电影|游戏|旅游|写诗|写作文)/
const RELEVANT_RE = /(医院|医疗|就医|看病|就诊|住院|门诊|急诊|科室|医生|医师|大夫|专家|挂号|预约|出诊|排班|号源|院区|分院|地址|血清|卒中|胸痛|发热|体检|疫苗|康复|护理|病床|手术|检查|中心)/

// 症状/就诊口语但未能映射到标准科室时 —— 如实请用户补充科室名，不拿"只搜城市"的结果充数
const SYMPTOMISH_RE = /(可以看|能看|能治|可以治|看什么科|挂什么科|哪里看|治一下|检查一下|不舒服|疼|痛|痒|肿|症状|有问题)/

// 多轮承接：第N家 / 这个 / 那家 / 第一家
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const ORDINAL_RE = /第\s*([一二两三四五六七八九十]|\d{1,2})\s*(?:家|个|所)/
const ANAPHORA_RE = /(这个|那家|这家|它|上述|前面那|刚才那)/

// 从提问中提取"用户指定的具体医院名"（用于判断"是否真的检索到了这家"）
// 注意：必须排除"有哪些医院 / 的医院 / 哪家医院"这类泛化说法，否则会把普通提问误判成"查不到该院"
const HOSPITAL_RE = /([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:医院|卫生院|保健院|门诊部|医学中心|医疗中心))/g
const GENERIC_IN_NAME = /(哪些|哪家|哪一|什么|哪|各家|有没有|有没|比如|例如|推荐|帮我找|不存在|某个|一家|两家|正规|附近|当地|公立|民营|私立)/
// 尾字必须是"连接词/动词"才算泛化名——⚠️ 不能把 和/与/或/及 当尾字排除，
// 否则"北京协和医院"会被误判成泛化说法（这就是"院名丢失"的根因）。
const BAD_TAIL = /[的对了找查问想要需要是为在呢吗吧啊]$/

function extractHospitalQuery(text) {
  HOSPITAL_RE.lastIndex = 0
  let m
  while ((m = HOSPITAL_RE.exec(text)) !== null) {
    const full = m[1]
    const namePart = full.replace(/(医院|卫生院|保健院|门诊部|医学中心|医疗中心)$/, '')
    if (namePart.length < 2) continue
    if (GENERIC_IN_NAME.test(namePart)) continue
    if (BAD_TAIL.test(namePart)) continue
    if (/^(北京|上海|广州|深圳|天津|重庆|杭州|成都)$/.test(namePart)) continue
    return full
  }
  return ''
}
const SPECIFIC_DATE_RE = /(今天|明天|后天|大后天|本周|这周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日)/

function parseOrdinal(text) {
  const m = text.match(ORDINAL_RE)
  if (m) {
    const raw = m[1]
    const n = /^\d+$/.test(raw) ? Number(raw) : CN_NUM[raw]
    if (n) return n
  }
  if (ANAPHORA_RE.test(text)) return 1 // "这个/那家"默认指第一条
  return 0
}

/**
 * 解析本轮意图。
 * @param {string} message 本轮用户输入
 * @param {object} [session] 会话上下文 { city, lastDepartments, lastResources, hospitals }
 */
export function parseIntent(message, session) {
  const sess = session || {}
  const text = String(message == null ? '' : message).trim()
  const cities = CITIES.filter((c) => text.includes(c))
  // ⭐ 地区识别：**词表外的地名也要"认出来"**（"保定"），否则会回一句"请告诉我要查的城市"，
  //    在评委眼里像"没听懂"。识别出来后由 answer.js **如实说明支持范围**（不假装支持、也不装没听懂）。
  const region = detectRegion(text)
  let unsupportedRegion = ''      // 识别到、但不在演示范围内的地名（用于如实说明范围）
  let provinceOnly = ''
  if (!cities.length && region.region) {
    if (region.kind === 'province') {
      provinceOnly = region.region
    } else {
      unsupportedRegion = region.region
    }
  }
  const departments = DEPARTMENTS.filter((d) => text.includes(d))
  const resources = SPECIAL_RESOURCES.filter((r) => text.includes(r))
  const titles = DOCTOR_TITLES.filter((t) => text.includes(t))
  const specificDate = SPECIFIC_DATE_RE.test(text)

  // 口语 → 标准科室（仅在未直接命中标准科室/资源时生效）
  // ⚠️ 必须在判定 emergency 之前算出来：口语映射到**科室**时（"胸口疼"→心血管内科），
  //    说明用户在问"该看哪个科"，而不是在求助（见下方 emergency 判定）。
  const colloquial = (!departments.length && !resources.length) ? mapColloquial(text) : null
  if (colloquial) departments.push(colloquial.dept)

  // ---- 紧急求助判定（P0 修复）----
  // ① 本轮命中**科室/资源专名**（"胸痛中心"）→ 这是**查资源**，一切症状词都不再触发急诊；
  // ② 命中"大出血/昏迷/休克/窒息"这类**无条件急诊**词 → 仍触发；
  // ③ 其余症状词（"胸痛"）：只有在**问了怎么办**（我想求助）或**没映射到任何科室**
  //    （说不清该看什么科）时才触发；口语已明确映射到具体科室（"胸口疼"→心血管内科）时不触发。
  const deptResourceHit = departments.length > 0 || resources.length > 0
  const emergency =
    !deptResourceHit && (
      EMERGENCY_RE.test(text)
      || (SYMPTOM_RE.test(text) && (HELP_RE.test(text) || !colloquial))
    )

  const flags = {
    emergency,
    deptResourceQuery: deptResourceHit,   // 本次是"查科室/资源"，不是"描述症状"
    medical: MEDICAL_RE.test(text),
    // "明天有门诊吗"这类：日期词 + 门诊/专家 也算出诊类查询
    schedule: SCHEDULE_RE.test(text) || (specificDate && /(门诊|排班|大夫|专家|医生|号)/.test(text)),
    doctor: DOCTOR_RE.test(text),
    appointment: APPOINTMENT_RE.test(text),
    address: ADDRESS_RE.test(text),
    outOfScope: AUTHENTICATE_RE.test(text),
    sensitive: SENSITIVE_RE.test(text),
    injection: INJECTION_RE.test(text),
  }
  // 无关问题：既没有医院相关词，又明显是闲聊/别的话题（两者同时成立才判定，避免误伤）
  flags.unrelated = !RELEVANT_RE.test(text) && (CHITCHAT_RE.test(text) || UNRELATED_RE.test(text))

  const filters = {
    publicOnly: FILTER_PUBLIC_RE.test(text),
    privateOnly: FILTER_PRIVATE_RE.test(text),
  }
  if (filters.publicOnly && filters.privateOnly) filters.privateOnly = false // 同时出现时以先说的"公立"为准（保守）

  // 口语 → 标准科室：已在上方（判定 emergency 之前）完成，此处不再重复

  const hm = extractHospitalQuery(text)
  const hospitalQuery = hm || ''
  const ordinal = parseOrdinal(text)

  // ⭐ 会话上下文继承：本轮没给科室/资源时，复用上一轮识别到的（试题示例第 2 步靠这里）
  const ctxDepartments = (!departments.length && Array.isArray(sess.lastDepartments))
    ? sess.lastDepartments.filter(Boolean).slice(0, 2) : []
  const ctxResources = (!resources.length && Array.isArray(sess.lastResources))
    ? sess.lastResources.filter(Boolean).slice(0, 2) : []
  const inheritedFromSession = ctxDepartments.length > 0 || ctxResources.length > 0

  const cityInTurn = cities.length > 0
  const cityInSession = Boolean(sess.city)
  const cityAnywhere = cityInTurn || cityInSession
  const topicInTurn = departments.length > 0 || resources.length > 0
  const topicKnown = topicInTurn || inheritedFromSession || Boolean(hospitalQuery)

  // 条件缺失：需要先问清"城市"（有科室但没城市），或"城市 + 科室"都缺
  const hospitalish = RELEVANT_RE.test(text) || /(医院|就医|看病|门诊|科室|医生|挂号|预约)/.test(text)
  let needCity = !cityAnywhere && ordinal === 0 && (topicKnown || filters.publicOnly || filters.privateOnly || hospitalish)
  // ⭐ 识别到**词表外的地名**（"保定"）→ 不算"用户没说地区"，而是**如实说明支持范围并给出可试的城市**。
  //    这条是本次的核心行为修复：**不许假装支持，也不许让用户觉得"系统没听懂"**。
  const outOfScopeRegion = Boolean(unsupportedRegion) && needCity
  if (outOfScopeRegion) needCity = false
  // ⭐ 只说了省、没说市时：同样不算"没识别出地区"，而是**请用户在省内挑一个市**（并给出候选）
  const needCityInProvince = needCity && Boolean(provinceOnly)
  let needTopic = needCity && !topicKnown
  if (needCityInProvince) {
    // 省名先当地区用（检索词里带省名），同时提示可在省内选市
    if (!cities.includes(provinceOnly)) cities.push(provinceOnly)
    needCity = false
    needTopic = false
  }
  // 有"看病/看什么科"的口语但映射不到标准科室 → 如实请用户补充（避免只搜城市返回无关来源）
  const needDept = !topicKnown && SYMPTOMISH_RE.test(text) && !filters.publicOnly && !filters.privateOnly

  return {
    raw: text,
    cities, departments, resources, titles, flags, filters, colloquial,
    ordinal,
    specificDate,
    hospitalQuery,
    isFollowUp: ordinal > 0,
    ctxDepartments, ctxResources, inheritedFromSession,
    cityInSession,
    needCity,
    needTopic,
    needDept,
    // ⭐ 地区识别（本次追加修复）：**词表外地名**要"认出来 + 如实说明范围"，而不是反问城市
    unsupportedRegion,                                // '保定'（识别到，但不在演示范围内）
    outOfScopeRegion,                                 // true = 走"如实说明支持范围"分支
    provinceOnly,                                     // '河北'（用户只说了省）
    needCityInProvince,                               // true = 请用户在省内挑一个市
    provinceCities: provinceOnly ? (PROVINCE_CITIES[provinceOnly] || []) : [],
    regionKnown: Boolean(cities.length || provinceOnly),
    missing: needCity ? (needTopic ? ['city', 'topic'] : ['city']) : [],
    isEmpty: text.length === 0,
    tooLong: text.length > 2000,
  }
}

/** 把意图拼成检索关键词（可解释；也用于测试记录里"展示了检索关键词"） */
export function buildQuery(intent, session) {
  const city = intent.cities[0] || (session && session.city) || ''
  const hosp = intent.hospitalQuery || ''
  const parts = []
  // 院名已含城市时，城市不再单独出现（避免"北京 北京和睦家医院"）
  const cityRedundant = Boolean(hosp && city && hosp.startsWith(city))
  if (city && !cityRedundant) parts.push(city)
  if (hosp) parts.push(hosp)
  const dept = intent.departments[0] || (intent.ctxDepartments && intent.ctxDepartments[0]) || ''
  const res0 = intent.resources[0] || (intent.ctxResources && intent.ctxResources[0]) || ''
  if (dept) parts.push(dept)
  if (res0) parts.push(res0)
  if (intent.flags.doctor) parts.push('医生')
  // 挂号/预约类：用"挂号 预约入口"更贴合意图；纯出诊类：用"出诊"
  if (intent.flags.appointment) parts.push('挂号 预约入口')
  else if (intent.flags.schedule) parts.push('出诊')
  if (parts.length === 0) parts.push(intent.raw)
  return [...new Set(parts)].join(' ')
}
