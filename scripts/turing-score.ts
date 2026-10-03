// Режим --score для scripts/turing.ts: судья получает ОДИН текст рилса и ставит ai от 1 (точно живой) до 10 (точно нейросеть),
// три вызова на текст, берется среднее. Живые рилсы (целые транскрипты из lib/generation/voice-bank.json) оцениваются один раз
// и хранятся как эталон в test/turing/etalon/live-scores.json.
//
//   npx tsx --env-file=.env.local scripts/turing.ts --score --runs=<папка прогона> --yes [--label=h3h4] [--fix-etalon]
//
// --fix-etalon (один раз, на базовом прогоне): живые, у которых ai выше медианы наших, выносятся из эталона
// в список «живые, но звучат как нейросеть»; дальше эталон один для всех вариантов.
// Мера варианта: средний ai наших минус средний ai эталона, и доля наших с ai не выше медианы эталона.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { callJson } from '../lib/generation/ai'
import { isReels } from '../lib/generation/text-guard'
import { plainText } from './turing-text'

const ROOT = join(__dirname, '..')
const TEST = join(ROOT, '_знания', 'мозг-генератора', 'test')
const ETALON = join(TEST, 'turing', 'etalon', 'live-scores.json')

const SCORE_SYSTEM = `Тебе дают один текст: то, что психолог говорит в своем ролике Reels (расшифровка устной речи). Его мог сказать живой психолог, а могла написать нейросеть, которую учили писать как живой психолог. Опечатки, ошибки распознавания речи, пропущенные знаки препинания не учитывай: смотри на то, как текст думает и звучит.

Оцени, насколько текст похож на нейросеть: ai от 1 (точно живой человек) до 10 (точно нейросеть). Выпиши дословные фразы, по которым видно нейросеть, и коротко почему; если таких нет, пустой список.

Ответ только JSON: {"ai": число от 1 до 10, "tells": [{"quote": "дословно", "why": "коротко"}]}`

type One = { ai: number; tells: { quote: string; why: string }[] }
export type Scored = { id: string; text: string; ai: number; runs: number[]; tells: { quote: string; why: string }[] }

async function scoreText(id: string, text: string, model?: string): Promise<Scored | null> {
  const runs: One[] = []
  for (let k = 0; k < 3; k++) {
    try {
      const r = await callJson<One>({ system: SCORE_SYSTEM, user: `<текст>\n${text}\n</текст>`, effort: 'medium', verbosity: 'low', maxTokens: 2500, operation: 'eval_score', model })
      if (typeof r?.ai === 'number') runs.push(r)
    } catch (e: any) { console.warn(`оценка ${id} не вышла: ${e?.message || e}`) }
  }
  if (!runs.length) return null
  const ai = Math.round((runs.reduce((a, b) => a + b.ai, 0) / runs.length) * 100) / 100
  return { id, text, ai, runs: runs.map(r => r.ai), tells: runs.flatMap(r => r.tells || []) }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  const q = [...items]
  await Promise.all(Array.from({ length: n }, async () => { for (let x = q.shift(); x !== undefined; x = q.shift()) out.push(await fn(x)) }))
  return out
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }
const mean = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : 0)

type Etalon = { scored: Scored[]; excluded: { id: string; ai: number }[]; fixedBy?: string }

function liveReels(): { id: string; text: string }[] {
  const bank = JSON.parse(readFileSync(join(ROOT, 'lib', 'generation', 'voice-bank.json'), 'utf8')) as any[]
  return bank.filter(t => t.source === 'reels' && !['r03', 'r33', 'r40', 'r62', 'r65'].includes(t.id) && t.words >= 40).map(t => ({ id: t.id, text: t.text }))
}

export async function scoreMain(runs: string[], o: { label: string; fix: boolean; model?: string }) {
  mkdirSync(join(TEST, 'turing', 'etalon'), { recursive: true })
  let et: Etalon = existsSync(ETALON) ? JSON.parse(readFileSync(ETALON, 'utf8')) : { scored: [], excluded: [] }
  if (!et.scored.length) {
    const live = liveReels()
    console.log(`Эталон: оцениваю ${live.length} живых рилсов по три раза...`)
    et.scored = (await pool(live, 4, x => scoreText(x.id, x.text, o.model))).filter(Boolean) as Scored[]
    writeFileSync(ETALON, JSON.stringify(et, null, 2))
  }
  const gen: { id: string; text: string }[] = []
  for (const run of runs) {
    const f = join(TEST, 'eval', run, 'results.json')
    if (!existsSync(f)) { console.warn(`нет прогона ${run}`); continue }
    for (const r of JSON.parse(readFileSync(f, 'utf8'))) if (!r.error && r.text && isReels(r.format)) gen.push({ id: `${run}/${r.id}`, text: plainText(r.text) })
  }
  console.log(`Наших рилсов: ${gen.length}, оцениваю по три раза...`)
  const ours = (await pool(gen, 4, x => scoreText(x.id, x.text, o.model))).filter(Boolean) as Scored[]
  const oursMed = median(ours.map(x => x.ai))
  if (o.fix && !et.fixedBy) {
    et.excluded = et.scored.filter(x => x.ai > oursMed).map(x => ({ id: x.id, ai: x.ai }))
    et.fixedBy = `${runs.join(',')}, медиана наших ${oursMed}`
    writeFileSync(ETALON, JSON.stringify(et, null, 2))
  }
  const ex = new Set(et.excluded.map(x => x.id))
  const ref = et.scored.filter(x => !ex.has(x.id))
  const refMean = mean(ref.map(x => x.ai))
  const refMed = median(ref.map(x => x.ai))
  const oursMean = mean(ours.map(x => x.ai))
  const share = ours.length ? Math.round((ours.filter(x => x.ai <= refMed).length * 100) / ours.length) : 0
  const tellCount = new Map<string, number>()
  for (const x of ours) for (const t of x.tells) { const k = String(t.why || '').toLowerCase().slice(0, 60); tellCount.set(k, (tellCount.get(k) || 0) + 1) }
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const out = join(TEST, 'turing', `${stamp}_score${o.label ? '_' + o.label : ''}`)
  mkdirSync(out, { recursive: true })
  const md = [
    `# Оценка по одному тексту: ${runs.join(', ')}`, '',
    `Наших рилсов: ${ours.length}. Средний ai: ${oursMean}, медиана ${oursMed}.`,
    `Эталон живых: ${ref.length} (вынесено как «звучат как нейросеть»: ${et.excluded.length}). Средний ai: ${refMean}, медиана ${refMed}.`,
    `Разница с живыми: ${Math.round((oursMean - refMean) * 100) / 100}. Доля наших с ai не выше медианы живых: ${share}%.`, '',
    '## Наши по ai (от самых живых)', '',
    ...[...ours].sort((a, b) => a.ai - b.ai).map(x => `- ${x.ai} (${x.runs.join('/')}) ${x.id}`), '',
    '## Что выдает (дословно, у самых «нейросетевых»)', '',
    ...[...ours].sort((a, b) => b.ai - a.ai).slice(0, 10).flatMap(x => x.tells.slice(0, 3).map(t => `- ${x.id}: «${t.quote}» ${t.why}`)),
  ].join('\n')
  writeFileSync(join(out, 'score.md'), md)
  writeFileSync(join(out, 'score.json'), JSON.stringify({ runs, oursMean, oursMed, refMean, refMed, share, diff: oursMean - refMean, ours }, null, 2))
  console.log(md.split('\n').slice(0, 5).join('\n'))
  console.log(`Отчет: ${join(out, 'score.md')}`)
}
