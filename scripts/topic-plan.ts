// План тем на 30 мест каждому тестовому автору и проверка кодом (21.10, раздел «ТП»).
//   npx tsx --env-file=.env.local scripts/topic-plan.ts --yes [--n=30] [--out=<папка>]   три вызова модели, около 10 ₽
//   npx tsx scripts/topic-plan.ts --check=<plans.json>                                      только проверка, бесплатно
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { callJson } from '../lib/generation/ai'
import { planPrompt, checkPlan, crossCommon, planSlots, cleanTopic, WORN, type PlanTopic } from '../lib/generation/topics'
import { PERSONAS, type Who } from './eval-data'

const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const has = (name: string) => argv.includes(`--${name}`)
const N = Number(flag('n')) || 30
const WHO: Who[] = ['A', 'B', 'C']

function report(plans: Record<string, { topics: PlanTopic[] }>): string {
  const lines: string[] = ['# Планы тем', '']
  for (const who of Object.keys(plans)) {
    const t = plans[who].topics
    const c = checkPlan(t, planSlots(t.length, PERSONAS[who as Who].full_name))
    lines.push(`## ${PERSONAS[who as Who].full_name} (${who})`, '',
      `Тем ${c.n}; затертых групп ${c.worn} (${c.wornShare}%), окон по 4 темы с двумя затертыми ${c.windowBreaks}; углов ${c.angles} из 7, повтор угла раньше чем через 5 тем ${c.angleRepeats}; не по месту плана ${c.offSlot}; групп ${c.groups}; похожие темы внутри автора ${c.dups.join(', ') || 'нет'}`, '')
    for (const x of t) lines.push(`${x.n}. ${x.title} · ${x.angle} · ${x.group}${WORN.includes(x.group) ? ' (затертая)' : ''}`)
    lines.push('')
  }
  const cc = crossCommon(Object.fromEntries(Object.entries(plans).map(([k, v]) => [k, v.topics])))
  lines.push('## Похожие ситуации у разных авторов', '', cc.length ? cc.map(x => `- ${x}`).join('\n') : 'нет', '')
  return lines.join('\n')
}

async function main() {
  // --check: проверка готового плана; --clean перепишет в нем названия без тире и «ё»
  if (flag('check')) {
    const plans = JSON.parse(readFileSync(flag('check'), 'utf8'))
    if (has('clean')) { for (const v of Object.values(plans) as any[]) v.topics = v.topics.map((t: any) => ({ ...t, title: cleanTopic(t.title), situation: cleanTopic(t.situation) })); writeFileSync(flag('check'), JSON.stringify(plans, null, 2)); writeFileSync(flag('check').replace(/\.json$/, '.md'), report(plans)) }
    console.log(report(plans)); return
  }
  console.log(`План тем: ${WHO.length} автора по ${N} тем. Около 10 ₽.`)
  if (!has('yes')) { console.log('Это настоящие деньги. Запусти с --yes.'); return }
  const out = flag('out') || join(__dirname, '..', '_знания', 'мозг-генератора', 'test', 'temy', new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-'))
  mkdirSync(out, { recursive: true })
  const plans: Record<string, { topics: PlanTopic[] }> = {}
  await Promise.all(WHO.map(async who => {
    const p = PERSONAS[who]
    const { system, user } = planPrompt(p, p.full_name, N)
    const r = await callJson<{ topics: PlanTopic[] }>({ system, user, effort: 'medium', verbosity: 'low', maxTokens: 9000, operation: 'topic_plan', writer: true, timeoutMs: 150000 })
    plans[who] = { topics: (r.topics || []).map((t, i) => ({ ...t, n: Number(t.n) || i + 1, title: cleanTopic(String(t.title || '')), situation: cleanTopic(String(t.situation || '')) })) }
    console.log(`${p.full_name}: ${plans[who].topics.length} тем`)
  }))
  const ordered = Object.fromEntries(WHO.map(w => [w, plans[w]]))
  writeFileSync(join(out, 'plans.json'), JSON.stringify(ordered, null, 2))
  const md = report(ordered)
  writeFileSync(join(out, 'plans.md'), md)
  console.log(md)
  console.log(`\nГотово: ${out}`)
}
main().catch(e => { console.error(e); process.exit(1) })
