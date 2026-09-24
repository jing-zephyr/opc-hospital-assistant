// scripts/regenerate-all.mjs —— 一键重生成全部**取证文档**（交付前跑一次即可）
//
// ⚠️ 顺序很重要（后面会覆盖/改写前面的产物）：
//   ① test-advanced  → 重写《进阶项实测证据.md》   （会清掉旧的全项实测小节）
//   ② test-final     → 在《进阶项实测证据.md》末尾追加"交付前全项实测"
//   ③ test-mobile    → 重写《进阶项实测证据_手机适配.md》
//   ④ test-cities    → 重写《已验证城市清单.md》
//   ⑤ test-record    → 重写《测试记录_8组.md》
//
// 用法：
//   ① 先起服务：node server.mjs
//   ② BASE=http://127.0.0.1:8891 node scripts/regenerate-all.mjs
//      BASE=https://opc-hospital-assistant.netlify.app node scripts/regenerate-all.mjs   # 打公网入口
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://127.0.0.1:8787'
const here = fileURLToPath(new URL('.', import.meta.url))     // 跨平台（Windows 路径不能直接取 pathname）
const steps = [
  ['test-advanced.mjs', '进阶项实测证据.md'],
  ['verify-final.mjs', '进阶项实测证据.md（追加"交付前全项实测"）'],
  ['gen-mobile-evidence.mjs', '进阶项实测证据_手机适配.md'],
  ['test-cities.mjs', '已验证城市清单.md'],
  ['gen-test-record.mjs', '测试记录_8组.md'],
]
let bad = 0
console.log(`BASE = ${BASE}\n`)
for (const [script, product] of steps) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [here + script], {
    env: { ...process.env, BASE }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  })
  const ok = r.status === 0
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${script.padEnd(26)} → ${product}（${((Date.now() - t0) / 1000).toFixed(1)}s，退出码 ${r.status}）`)
  if (!ok) {
    console.log((r.stdout || '').split('\n').slice(-12).join('\n'))
    console.log((r.stderr || '').split('\n').slice(-12).join('\n'))
  }
}
console.log(bad ? `\n⚠️ 有 ${bad} 个脚本未通过，请按上面的输出定位` : '\n✅ 全部取证文档已重生成')
process.exitCode = bad ? 1 : 0
