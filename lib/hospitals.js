// lib/hospitals.js —— 医院官网域名白名单 + 已知医院名
//
// ⚠️ 纪律：本文件每一条都必须是【核实过的】，不许凭印象编。
//    新增流程：检索到 → 打开页面确认是"该院官网" → 才写入 → 在注释里留证据(URL)。
//    核实不了的一律不写，交由 tierOf 保守判为 C（仅线索）。

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
    name: '北京和睦家医院（民营）',
    city: '北京',
    note: '检索命中其官网急诊科页面《急诊科 北京和睦家医院》与出诊表',
    evidence: 'https://beijing.ufh.com.cn/department_city/emergency',
  },
  'ufh.com.cn': {
    name: '和睦家医疗（民营，集团官网）',
    city: '北京',
    note: '集团官网《和睦家急诊医学服务》',
    evidence: 'https://ufh.com.cn/medical-expertise/em-medicine',
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
]

export function officialOf(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '')
  if (OFFICIAL_SITES[h]) return { ...OFFICIAL_SITES[h], host: h, kind: 'hospital-official' }
  if (AUTHORITY_SITES[h]) return { name: AUTHORITY_SITES[h], host: h, kind: 'authority' }
  return null
}
