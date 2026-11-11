// Калибровка проверок качества zh6 (lib/generation/zh6/kachestvo.ts) на живых текстах: ни одна проверка не должна
// срабатывать на живых. Без модели и без сети: npx tsx scripts/zh6/kachestvo-kalibr.ts [--pokazat]
// Корпус: банки в репо (zh6-primery, live-bank, voice-bank) и, если есть, живые тексты из _знания основной папки
// (~/Downloads/psycontent/_знания: живые посты Telegram, расшифровки рилсов, живые карусели).
// Вторым аргументом можно дать json с материалами (массив {content, format, check_result}) для проверки «ловит ли».
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { kachestvoMesta, dazheVKonce } from '../../lib/generation/zh6/kachestvo'

export type Zhivoy = { id: string; text: string; scene: boolean }

export function korpus(): Zhivoy[] {
  const ROOT = join(__dirname, '..', '..')
  const out: Zhivoy[] = []
  const bank = (f: string) => JSON.parse(readFileSync(join(ROOT, 'lib', 'generation', f), 'utf8')) as { id: string; text: string }[]
  for (const f of ['zh6-primery.json', 'live-bank.json', 'voice-bank.json']) for (const x of bank(f)) out.push({ id: `${f}:${x.id}`, text: x.text, scene: false })
  const K = join(homedir(), 'Downloads', 'psycontent', '_знания')
  const posty = join(K, 'живые-посты')
  if (existsSync(posty)) for (const f of readdirSync(posty).filter(x => x.endsWith('.txt'))) {
    const parts = readFileSync(join(posty, f), 'utf8').split(/^=====.*=====\s*$/mu).map(x => x.trim()).filter(x => x.length > 80)
    parts.forEach((t, i) => out.push({ id: `posty:${f}#${i + 1}`, text: t, scene: false }))
  }
  const rils = join(K, 'транскрипты-рилсов')
  if (existsSync(rils)) for (const f of readdirSync(rils).filter(x => x.endsWith('.txt'))) out.push({ id: `rils:${f.slice(0, 20)}`, text: readFileSync(join(rils, f), 'utf8'), scene: false })
  const kar = join(K, 'живые-карусели')
  if (existsSync(kar)) for (const f of readdirSync(kar).filter(x => x.endsWith('.md'))) {
    const parts = readFileSync(join(kar, f), 'utf8').split(/^## /mu).slice(1)
    parts.forEach((t, i) => out.push({ id: `kar:${f}#${i + 1}`, text: t.replace(/^###\s*Слайд\s*(\d+)[^\n]*$/gmu, 'Слайд $1:'), scene: false }))
  }
  return out
}

function main() {
  const live = korpus()
  const pokazat = process.argv.includes('--pokazat')
  const hits: Record<string, string[]> = {}
  // жесткий режим: рамку кабинета проверяем у всех как у «Истории из кабинета», обложку у всех каруселей, а «даже»
  // отдельно: как будто у автора «даже» в конце уже было (prevDazhe), это доля живых с «даже» в последней фразе
  let karuselej = 0
  for (const z of live) {
    const carousel = /^\s*Слайд\s*1\s*:/mu.test(z.text)
    if (carousel) karuselej++
    for (const m of kachestvoMesta(z.text, { intro: false, scene: z.scene, format6: 'post_kabinet', carousel })) (hits[m.code] = hits[m.code] || []).push(`${z.id}: ${m.quote.slice(0, 120)}`)
  }
  const dazhe = live.filter(z => dazheVKonce(z.text))
  console.log(`живых текстов: ${live.length}, из них каруселей со «Слайд 1»: ${karuselej}`)
  console.log(`  «даже» в последней фразе у живых: ${dazhe.length} из ${live.length} (${(dazhe.length / live.length * 100).toFixed(1)}%); тик ловится только если «даже» в конце было и в одном из двух прошлых текстов автора`)
  if (pokazat) for (const z of dazhe.slice(0, 5)) console.log(`     ${z.id}`)
  for (const code of ['samopredstavlenie', 'podvodka', 'vopros3', 'vrach_abzac', 'scenka_dlinno', 'abstrakciya', 'ramka_kabineta', 'oblozhka']) {
    const h = hits[code] || []
    console.log(`  ${code}: срабатываний на живых ${h.length}`)
    if (pokazat) for (const x of h.slice(0, 8)) console.log(`     ${x}`)
  }
  const f = process.argv.slice(2).find(a => a.endsWith('.json'))
  if (f) {
    const mats = JSON.parse(readFileSync(f, 'utf8'))
    for (const m of mats) {
      const scene = /scenka/.test(m.check_result?.zh4?.zh6?.ustr || m.kod || m.format || '')
      const carousel = /^\s*Слайд\s*1\s*:/mu.test(m.content || m.text || '')
      const r = kachestvoMesta(m.content || m.text, { intro: false, scene, format6: m.check_result?.zh4?.zh6?.ustr || m.kod || '', carousel, prevDazhe: [true] })
      console.log(`  ${m.vremya || m.n || ''} ${m.check_result?.zh4?.zh6?.formatName || m.formatName || m.format}: ${r.map(x => x.code).join(', ') || 'ничего'}`)
    }
  }
}
if (require.main === module) main()
