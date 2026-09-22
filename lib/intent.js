// lib/intent.js —— 规则式意图解析（不依赖大模型：零幻觉、零成本、可解释）
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

const EMERGENCY_RE = /(胸痛|大出血|呼吸困难|昏迷|抽搐|意识不清|快不行|急救|救命|车祸|中毒|晕倒)/
const MEDICAL_RE = /(怎么治|如何治|治疗方案|吃什么药|用什么药|用药|开药|处方|诊断一下|我是不是得|能不能治好|要不要手术|剂量|吃什么能好)/
const SCHEDULE_RE = /(出诊|门诊时间|排班|什么时候出诊|挂号|预约|号源|停诊|加号)/
const DOCTOR_RE = /(医生|医师|专家|擅长|大夫|主任|教授)/
const APPOINTMENT_RE = /(预约|挂号|官方入口|怎么挂|咨询电话|联系电话)/
const ADDRESS_RE = /(地址|在哪|怎么走|院区|分院|位置)/
const AUTHENTICATE_RE = /(鉴定|估价|值多少钱|真假|真伪|交易|拍卖|收购)/

// 多轮承接：第N家 / 这个 / 那家 / 第一家
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const ORDINAL_RE = /第\s*([一二两三四五六七八九十]|\d{1,2})\s*(?:家|个|所)/
const ANAPHORA_RE = /(这个|那家|这家|它|上述|前面那|刚才那)/

// 从提问中提取"用户指定的具体医院名"（用于判断"是否真的检索到了这家"）
// 注意：必须排除"有哪些医院 / 的医院 / 哪家医院"这类泛化说法，否则会把普通提问误判成"查不到该院"
const HOSPITAL_RE = /([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:医院|卫生院|保健院|门诊部|医学中心|医疗中心))/g
const GENERIC_IN_NAME = /(哪些|哪家|哪一|什么|哪|各家|有没有|有没|比如|例如|推荐|帮我找|不存在|某个|一家|两家)/
const BAD_TAIL = /[的和对与或及在有为是了找查问想要需要]$/

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

export function parseIntent(message) {
  const text = String(message == null ? '' : message).trim()
  const cities = CITIES.filter((c) => text.includes(c))
  const departments = DEPARTMENTS.filter((d) => text.includes(d))
  const resources = SPECIAL_RESOURCES.filter((r) => text.includes(r))
  const titles = DOCTOR_TITLES.filter((t) => text.includes(t))
  const flags = {
    emergency: EMERGENCY_RE.test(text),
    medical: MEDICAL_RE.test(text),
    schedule: SCHEDULE_RE.test(text),
    doctor: DOCTOR_RE.test(text),
    appointment: APPOINTMENT_RE.test(text),
    address: ADDRESS_RE.test(text),
    outOfScope: AUTHENTICATE_RE.test(text),
  }
  const isResourceQuery = departments.length > 0 || resources.length > 0 || flags.doctor || flags.schedule
  const ordinal = parseOrdinal(text)
  const specificDate = SPECIFIC_DATE_RE.test(text)
  const hm = extractHospitalQuery(text)
  const hospitalQuery = hm || ''
  return {
    raw: text,
    cities, departments, resources, titles, flags,
    ordinal,
    specificDate,
    hospitalQuery,
    isFollowUp: ordinal > 0,
    needCity: cities.length === 0 && isResourceQuery && ordinal === 0,
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
  if (intent.departments[0]) parts.push(intent.departments[0])
  if (intent.resources[0]) parts.push(intent.resources[0])
  if (intent.flags.doctor) parts.push('医生')
  if (intent.flags.schedule) parts.push('出诊')
  if (parts.length === 0) parts.push(intent.raw)
  return [...new Set(parts)].join(' ')
}
