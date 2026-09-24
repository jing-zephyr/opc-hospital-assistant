// lib/intent.js —— 规则式意图解析（不依赖大模型：零幻觉、零成本、可解释）
// 会话上下文：parseIntent(message, session) —— 第 2 轮「杭州，优先公立医院」这类"城市 + 筛选条件"
// 必须复用上一轮的科室/资源，否则会退化成"杭州 优先公立医院"（→ no_result）。
export const CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '南京', '天津', '重庆', '苏州',
  '长沙', '郑州', '青岛', '沈阳', '大连', '济南', '厦门', '福州', '合肥', '昆明', '南昌', '贵阳',
  '南宁', '哈尔滨', '长春', '石家庄', '太原', '兰州', '银川', '西宁', '乌鲁木齐', '呼和浩特', '海口', '拉萨',
]

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

const EMERGENCY_RE = /(胸痛|大出血|呼吸困难|昏迷|抽搐|意识不清|快不行|急救|救命|车祸|中毒|晕倒)/
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
  const departments = DEPARTMENTS.filter((d) => text.includes(d))
  const resources = SPECIAL_RESOURCES.filter((r) => text.includes(r))
  const titles = DOCTOR_TITLES.filter((t) => text.includes(t))
  const specificDate = SPECIFIC_DATE_RE.test(text)
  const flags = {
    emergency: EMERGENCY_RE.test(text),
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

  // 口语 → 标准科室（仅在未直接命中标准科室/资源时生效）
  const colloquial = (!departments.length && !resources.length) ? mapColloquial(text) : null
  if (colloquial) departments.push(colloquial.dept)

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
  const needCity = !cityAnywhere && ordinal === 0 && (topicKnown || filters.publicOnly || filters.privateOnly || hospitalish)
  const needTopic = needCity && !topicKnown
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
