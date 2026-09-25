// pre-push 钩子（机制，不是提醒）—— OPC 医院助手仓库专用
//
// 为什么这个仓库**尤其**需要这道闸：
//   ① 它是**公开仓库**（github.com/jing-zephyr/opc-hospital-assistant，private=false）
//   ② 有一个「每 ~20 分钟自动推送」的定时任务在跑
//   ⇒ 一旦夹带密钥或真人名，**就是直接推到公网**，没有第二次机会。
//
// 三道闸：
//   ① 真名闸：清单从【库外】读（C:\Users\T\.secrets\alias-map.json）→ 本文件自身不含任何真名，可安全入库
//   ② 密钥闸：扫 sk- / tvly- / nfp_ 等高危令牌模式
//   ③ .env 闸：禁止把真实 .env 纳入版本控制（.env.example 允许）
//
// 库外映射表不存在时：**放行但大声警告**（避免在别的机器上把推送全堵死）
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const MAP = process.env.OPC_ALIAS_MAP || 'C:\\Users\\T\\.secrets\\alias-map.json'

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim()

function die(title, body) {
  console.error('')
  console.error('  ⛔⛔⛔  pre-push 已拦截本次推送  ⛔⛔⛔')
  console.error('')
  console.error('  ' + title)
  console.error('')
  for (const l of body) console.error('  ' + l)
  console.error('')
  process.exit(1)
}

// ---------- 读 pre-push 协议 ----------
// stdin 每行：<localRef> <localSha> <remoteRef> <remoteSha>
let raw = ''
try { raw = readFileSync(0, 'utf8') } catch { raw = '' }
const rows = raw.split(/\r?\n/).filter((l) => l.trim())
const ZERO = /^0+$/

// ---------- 收集"本次真正要推上去"的提交 ----------
const commits = []
for (const row of rows) {
  const parts = row.split(/\s+/)
  const localSha = parts[1]
  const remoteSha = parts[3]
  if (!localSha || ZERO.test(localSha)) continue // 删除分支，跳过
  let range = localSha
  if (remoteSha && !ZERO.test(remoteSha)) {
    try {
      const n = git(['rev-list', '--count', remoteSha + '..' + localSha])
      if (Number(n) === 0) continue
      range = remoteSha + '..' + localSha
    } catch { range = localSha }
  }
  try {
    commits.push(...git(['rev-list', range]).split(/\r?\n/).filter(Boolean))
  } catch { /* 忽略 */ }
}
const uniqCommits = [...new Set(commits)]
if (!uniqCommits.length) {
  console.error('  ✅ pre-push：本次没有需要扫描的新提交')
  process.exit(0)
}
if (uniqCommits.length > 4000) uniqCommits.length = 4000

// ---------- 闸③：.env 不得入库 ----------
try {
  const tracked = git(['ls-files'])
  const bad = tracked.split(/\r?\n/).filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f))
  if (bad.length) {
    die('仓库里跟踪了真实的 .env 文件。', [
      '命中：' + bad.slice(0, 10).join(', '),
      '',
      '请先取消跟踪（**不要删文件**）：',
      '    git rm --cached ' + bad[0],
      '    并把 .env 加入 .gitignore',
      '',
      '（只有 .env.example 允许入库）',
    ])
  }
} catch { /* ls-files 失败不阻断 */ }

// ---------- 组装扫描模式：真名 + 密钥 ----------
const patterns = [
  'sk-[A-Za-z0-9_\\-]{20,}',      // OpenAI/类似风格
  'tvly-[A-Za-z0-9_\\-]{20,}',    // Tavily
  'nfp_[A-Za-z0-9_\\-]{20,}',     // Netlify
  'AKIA[0-9A-Z]{16}',             // AWS AK
  'gh[pousr]_[A-Za-z0-9]{30,}',   // GitHub token
]

let names = []
if (existsSync(MAP)) {
  try {
    // 容忍 BOM：Windows 上用 PowerShell 写出的 UTF-8 常带 \uFEFF，
    // 不剥掉会让 JSON.parse 失败 —— 而解析失败是 fail-open，会**静默放过真名**。
    const txt = readFileSync(MAP, 'utf8').replace(/^\uFEFF/, '')
    const j = JSON.parse(txt)
    names = (j.map || []).map((x) => x[0]).filter(Boolean)
  } catch (e) {
    console.error('  ⚠️  pre-push：映射表解析失败（' + e.message + '）→ 本次只跑密钥闸')
  }
} else {
  console.error('')
  console.error('  ⚠️  pre-push：读不到库外映射表 ' + MAP)
  console.error('     → 本次【跳过真名闸】，只跑密钥闸与 .env 闸。')
  console.error('     → 如果你在另一台机器上，请把映射表放到位后再推。')
  console.error('')
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
if (names.length) patterns.unshift(names.map(esc).join('|'))
const pattern = patterns.join('|')

// ---------- 扫描 ----------
const offenders = []
for (let i = 0; i < uniqCommits.length; i += 400) {
  const batch = uniqCommits.slice(i, i + 400)
  try {
    const hit = execFileSync('git', ['grep', '-l', '-E', '--', pattern, ...batch], {
      encoding: 'utf8', maxBuffer: 1 << 28,
    }).trim()
    if (hit) offenders.push(...hit.split(/\r?\n/).slice(0, 20))
  } catch { /* git grep 无命中时退出码为 1，属正常 */ }
}

if (offenders.length) {
  const uniq = [...new Set(offenders)].slice(0, 20)
  die('被推的提交里含【真人名或密钥】—— 本仓库是公开仓库，绝不能推上去。', [
    '命中的对象（格式：<提交>:<文件>）：',
    ...uniq.map((x) => '    ' + x),
    '',
    '处置：',
    '  · 若只是**尚未提交**的内容 → 删掉敏感内容后重新提交',
    '  · 若已进入本地历史 → 需要改写历史后再推：',
    '        git filter-branch --force --tree-filter "node C:/Users/T/.secrets/history-scrub.mjs" \\',
    '          --tag-name-filter cat -- --all',
    '        git for-each-ref --format="%(refname)" refs/original/ | % { git update-ref -d $_ }',
    '        git reflog expire --expire=now --all ; git gc --prune=now',
    '',
    '  · 密钥一旦推上去，**必须立刻到服务商后台吊销并换新**（改历史不等于没泄露）。',
  ])
}

console.error('  ✅ pre-push：真名闸 + 密钥闸 + .env 闸 均通过（扫了 ' + uniqCommits.length + ' 个提交）')
process.exit(0)
