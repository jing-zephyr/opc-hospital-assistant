// scripts/deploy-netlify.mjs —— 一键部署到 Netlify（免交互）
//
// 前置：把 Netlify 令牌放进库外文件
//   C:\Users\T\.secrets\opc-search.env(.txt)  追加一行：
//   NETLIFY_AUTH_TOKEN=你的令牌
// 令牌获取：Netlify → 右上头像 → User settings → Applications
//          → Personal access tokens → New access token
//
// 用法：node scripts/deploy-netlify.mjs
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ENV_CANDIDATES = [
  'C:\\Users\\T\\.secrets\\opc-search.env',
  'C:\\Users\\T\\.secrets\\opc-search.env.txt',
  'C:\\Users\\T\\.secrets\\netlify.env',
  'C:\\Users\\T\\.secrets\\netlify.env.txt',
]

function readEnv() {
  const out = {}
  for (const p of ENV_CANDIDATES) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      if (!out[k]) out[k] = t.slice(i + 1).trim()
    }
  }
  return out
}

const env = readEnv()
const token = process.env.NETLIFY_AUTH_TOKEN || env.NETLIFY_AUTH_TOKEN

if (!token) {
  console.error('\n❌ 没有找到 Netlify 令牌。\n')
  console.error('请按以下两步操作：')
  console.error('  1) 打开 Netlify → 右上头像 → User settings → Applications')
  console.error('     → Personal access tokens → New access token → 复制')
  console.error('  2) 把它写进库外文件（任选其一）：')
  for (const p of ENV_CANDIDATES.slice(0, 2)) console.error('       ' + p)
  console.error('     内容追加一行： NETLIFY_AUTH_TOKEN=你的令牌\n')
  process.exit(1)
}

// 找缓存里的 netlify-cli（避免 npx 临时下载卡住）
const CACHE = 'C:\\Users\\T\\AppData\\Local\\npm-cache\\_npx'
const candidates = []
for (const id of ['7ed0f2ef719899b5', 'da5c1b6ea715e8b4']) {
  const run = join(CACHE, id, 'node_modules', 'netlify-cli', 'bin', 'run.js')
  if (existsSync(run)) candidates.push(run)
}
if (candidates.length === 0) {
  console.error('❌ 没找到缓存的 netlify-cli。请先执行一次： npx netlify-cli --version')
  process.exit(1)
}
const runJs = candidates[0]

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '..')

console.log('使用 CLI：', runJs)
console.log('应用目录：', appDir)
console.log('令牌：', token.slice(0, 6) + '***' + token.slice(-4), '\n')
console.log('开始部署（首次会提示创建/选择站点，按提示确认即可）…\n')

const r = spawnSync(process.execPath, [runJs, 'deploy', '--prod', '--dir', 'public', '--functions', 'netlify/functions'], {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, NETLIFY_AUTH_TOKEN: token },
})

console.log('\n退出码：', r.status)
if (r.status === 0) {
  console.log('\n✅ 部署完成。若上面输出了 site URL，请打开 /api/health 确认通道已配置。')
  console.log('   ⚠️ 记得在 Netlify 站点设置里配置环境变量：BOCHA_API_KEY / TAVILY_API_KEY')
} else {
  console.log('\n⚠️ 部署未成功。常见原因：网络抖动 / 令牌无效 / 未选择站点。可重试。')
}
