// Живая проверка правок качества zh6 (11.11): путь экрана «Сделать» (ядро мысли, потом писатель zh6 с тем же видом
// формата) на профиле из файла, без входа и без записи в базу (userId пустой, расход в файл USAGE_LOG_FILE).
//   npx tsx --env-file=<файл с OPENAI_API_KEY> scripts/zh6/kachestvo-zhivaya.ts --profil=<json> --out=<папка> --yes
// Готовые результаты не перегенерирует (без повторов и лишних трат). 401 или 429: сразу стоп.
// Формат рилса передавать кодом reels_* (reels_scenka): просто «reels» генератор считает постом (ошибка прогона 11.11).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_PRICES, USD_TO_RUB_DRAFT } from '../../lib/energy'

const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const OUT = flag('out')
const PROFIL = flag('profil')

export const SLUCHAI = [
  { n: 1, kod: 'post_direkt', format: 'post', tema: 'Усталость, которую не лечит отпуск', intent: 'uznavanie', bylo: '12:10' },
  { n: 2, kod: 'post_kabinet', format: 'post', tema: 'я заебалась делать все за всех', intent: 'mehanizm', bylo: '12:37' },
  { n: 3, kod: 'reels_scenka_pervaya_sessiya', format: 'reels_scenka', tema: 'почему я все знаю и ничего не делаю', intent: 'podderzhka', bylo: '12:30' },
  { n: 4, kod: 'carousel_spisok_priznakov', format: 'carousel', tema: 'Лежишь в выходной и чувствуешь вину', intent: 'uznavanie', bylo: '12:31' },
  { n: 5, kod: 'reels_scenka_pervaya_sessiya', format: 'reels_scenka', tema: 'Усталость, которую не лечит отпуск', intent: 'uznavanie', bylo: '' },
  { n: 6, kod: 'carousel_spisok_priznakov', format: 'carousel', tema: 'я заебалась делать все за всех', intent: 'mehanizm', bylo: '' },
]

const mem = () => ({ count: 0, total: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [], zh6: { ustr: [] as string[], primery: [] as string[], kon: [] as string[], priemy: [] as string[] } })

async function main() {
  if (!OUT || !PROFIL) throw new Error('нужны --out и --profil')
  const usage = join(OUT, 'usage.jsonl')
  const rub = () => existsSync(usage) ? readFileSync(usage, 'utf8').split('\n').filter(Boolean).reduce((s, l) => {
    const x = JSON.parse(l); const [a, c, b] = (MODEL_PRICES as any)[x.model] || (MODEL_PRICES as any)['gpt-5.4']
    const u = x.usage || {}; const ca = u.prompt_tokens_details?.cached_tokens || 0
    return s + (((u.prompt_tokens - ca) * a + ca * c + u.completion_tokens * b) / 1e6) * USD_TO_RUB_DRAFT
  }, 0) : 0
  console.log(`живая проверка: ${SLUCHAI.length} материалов, потрачено по файлу ${rub().toFixed(2)} ₽`)
  if (!argv.includes('--yes')) { console.log('Без --yes ничего не вызываю.'); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('нет ключа (--env-file)')
  mkdirSync(OUT, { recursive: true })
  process.env.USAGE_LOG_FILE = usage
  process.env.PROMPT_HYP = 'zh6'
  const { buildAuthorSettings } = await import('../../lib/generation/settings')
  const { buildCore } = await import('../../lib/generation/core')
  const { coreBlockFor } = await import('../../lib/generation/group')
  const { simpleWrite } = await import('../../lib/generation/simple')
  const profil = JSON.parse(readFileSync(PROFIL, 'utf8'))
  const settings = buildAuthorSettings({ ...profil, voice_core: profil.voice_core || '' }, { rotation: 0 })
  const f = join(OUT, 'stalo.json')
  const rez: any[] = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
  for (const c of SLUCHAI) {
    if (rez.find(x => x.n === c.n)) { console.log(`${c.n}: уже есть, пропускаю`); continue }
    const ctx: any = { userId: '', settings, memory: mem(), editPairs: '' }
    try {
      const core = await buildCore(ctx, { topic: c.tema, intent: c.intent, intentLabel: 'любая' })
      const r: any = await simpleWrite(ctx, { topic: c.tema, format: c.format as any, intent: c.intent, coreBlock: coreBlockFor(core, c.format as any), formatKod: c.kod } as any)
      rez.push({ ...c, core, text: r.text, formatName: r.zh6?.formatName, mesta: r.zh6?.mesta?.map((m: any) => m.code), ostalos: r.zh6?.ostalos?.map((m: any) => m.code), pravka: r.zh6?.pravka })
      writeFileSync(f, JSON.stringify(rez, null, 1))
      console.log(`${c.n}: ${r.zh6?.formatName}, находок ${r.zh6?.mesta?.length || 0} [${(r.zh6?.mesta || []).map((m: any) => m.code).join(',')}], правка ${r.zh6?.pravka ? 'взята' : 'нет'}, всего ${rub().toFixed(2)} ₽`)
    } catch (e: any) {
      const msg = String(e?.message || e)
      if (/\b(401|429)\b/.test(msg)) { console.log(`СТОП на ${c.n}: ${msg.match(/\b(401|429)\b/)![1]}`); process.exit(2) }
      throw e
    }
  }
  console.log(`готово, всего ${rub().toFixed(2)} ₽`)
}
main().catch(e => { console.error('ошибка:', String(e?.message || e).slice(0, 200)); process.exit(1) })
