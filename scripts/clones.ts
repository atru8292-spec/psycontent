// Клоны из промпта (zh5, 22.10): цепочки из 4 слов, которые есть в системном промпте, ходах или карточках варианта
// и повторяются в 3 и больше текстах прогона. Бесплатно.
//   npx tsx scripts/clones.ts --v=zh5 --runs=<папка>,<папка>
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as P from '../lib/generation/prompts.generated'
import { FORMAT_CARDS, INTENT_CARDS } from '../lib/generation/prompts'

const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const V = flag('v') || 'zh5'
const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test', 'eval')
const W = (s: string) => (s.toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\d]+/gu) || [])
const vals = (o: any) => (o ? Object.values(o) as string[] : [])
const prompt = V === 'zh5' ? [P.PZH5_SYSTEM, P.PZH5_REELS, ...vals(P.PZH5_MOVES), ...vals(P.PZH5_PICKS), ...vals(P.PZH5_CARDS)]
  : [P.PZH4_SYSTEM, P.PZH4_REELS, ...vals(P.PZH4_MOVES), ...vals(P.PZH4_PICKS), ...vals(P.PZH4_CARDS)]
const src = new Set<string>()
for (const t of [...prompt, ...vals(FORMAT_CARDS), ...vals(INTENT_CARDS), P.PP_USER]) { const w = W(t); for (let i = 0; i + 4 <= w.length; i++) src.add(w.slice(i, i + 4).join(' ')) }
const count = new Map<string, Set<string>>()
for (const run of flag('runs').split(',').filter(Boolean)) {
  const f = join(TEST, run, 'results.json')
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8')).filter((x: any) => x.text)) {
    const w = W(r.text); const seen = new Set<string>()
    for (let i = 0; i + 4 <= w.length; i++) { const g = w.slice(i, i + 4).join(' '); if (src.has(g)) seen.add(g) }
    for (const g of seen) count.set(g, (count.get(g) || new Set()).add(`${run.slice(-8)}/${r.id}`))
  }
}
const hits = [...count.entries()].filter(([, v]) => v.size >= 3).sort((a, b) => b[1].size - a[1].size)
console.log(`Клоны из промпта ${V} (в 3 и больше текстах): ${hits.length}`)
for (const [g, v] of hits) console.log(`- «${g}» ${v.size}`)
