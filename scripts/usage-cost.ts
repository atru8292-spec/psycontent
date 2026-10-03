// Сколько стоили прогоны на самом деле: суммирует токены из файла USAGE_LOG_FILE (его пишет lib/generation/ai.ts)
// по ценам MODEL_PRICES из lib/energy.ts. Бесплатно.
//   npx tsx scripts/usage-cost.ts <файл.jsonl>
import { readFileSync } from 'node:fs'
import { MODEL_PRICES, USD_TO_RUB_DRAFT } from '../lib/energy'

const f = process.argv[2]
if (!f) throw new Error('Укажи файл')
let usd = 0
const byOp: Record<string, number> = {}
for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  const { model, op, usage } = JSON.parse(line)
  const [pIn, pCached, pOut] = MODEL_PRICES[model] || MODEL_PRICES['gpt-5.4']
  const cached = usage?.prompt_tokens_details?.cached_tokens || 0
  const prompt = usage?.prompt_tokens || 0
  const x = ((prompt - cached) / 1e6) * pIn + (cached / 1e6) * pCached + ((usage?.completion_tokens || 0) / 1e6) * pOut
  usd += x
  byOp[op || 'без имени'] = (byOp[op || 'без имени'] || 0) + x
}
console.log(`Итого: ${Math.round(usd * USD_TO_RUB_DRAFT)} ₽ ($${usd.toFixed(2)})`)
for (const [op, x] of Object.entries(byOp)) console.log(`  ${op}: ${Math.round(x * USD_TO_RUB_DRAFT)} ₽`)
