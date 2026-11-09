// zh6-prod: живая проверка zh6 скриптом через тот же код, что вызывают роуты (zh6Plan, zh6Write, zh6Popravit), без
// входа в аккаунт и без записи в базу. План на 10 тем, по одному материалу каждого вида (голова, сценка, беззвучный,
// карусель, пост Instagram, пост Telegram, сторис), одно «Поправить» на сценке и одна генерация старым zh+h7.
// Результат _знания/мозг-генератора/zh6/prod-check/rezultaty.json (его показывает dev-страница /dev/zh6).
// Траты в _знания/мозг-генератора/test/zh6/usage-prod.jsonl, стоп перед каждым вызовом по --stop (рубли этого файла).
//   caffeinate -dimsu $T --env-file=$HOME/Downloads/psycontent/.env.local scripts/zh6/prod-check.ts --stop=40 --yes
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_PRICES, USD_TO_RUB_DRAFT } from '../../lib/energy'
import { buildAuthorSettings } from '../../lib/generation/settings'
import { PERSONAS6 } from './personas'

const ROOT = join(__dirname, '..', '..')
const OUT = join(ROOT, '_знания', 'мозг-генератора', 'zh6', 'prod-check')
const USAGE = join(ROOT, '_знания', 'мозг-генератора', 'test', 'zh6', 'usage-prod.jsonl')
const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const STOP = Number(flag('stop')) || 0
const rub = (m: string, u: any) => { const [a, c, b] = (MODEL_PRICES as any)[m] || (MODEL_PRICES as any)['gpt-5.4']; const ca = u?.prompt_tokens_details?.cached_tokens || 0; return (((u?.prompt_tokens || 0) - ca) / 1e6 * a + ca / 1e6 * c + (u?.completion_tokens || 0) / 1e6 * b) * USD_TO_RUB_DRAFT }
const spent = () => existsSync(USAGE) ? readFileSync(USAGE, 'utf8').split('\n').filter(Boolean).reduce((s, l) => { try { const x = JSON.parse(l); return s + rub(x.model, x.usage) } catch { return s } }, 0) : 0
const KONTROL = JSON.parse(readFileSync(join(ROOT, '_знания', 'мозг-генератора', 'test', 'zh6', 'kontrol.json'), 'utf8'))
const settingsOf = (p: any, who: string) => buildAuthorSettings({ ...p, voice_core: '', voice_samples: KONTROL.obrazcy[who].map((text: string) => ({ text, fit: true, source: 'pasted' })) }, { rotation: 0 })
const mem = () => ({ count: 0, total: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [], zh6: { ustr: [] as string[], primery: [] as string[], kon: [] as string[], priemy: [] as string[] } })

async function main() {
  console.log(`проверка zh6-prod: план, 7 материалов, «Поправить», zh+h7; смета около 12 ₽; потрачено в этом файле ${spent().toFixed(2)} ₽, стоп ${STOP}`)
  if (!argv.includes('--yes')) { console.log('Без --yes ничего не вызываю.'); return }
  if (!STOP || !process.env.OPENAI_API_KEY) throw new Error('нужны --stop и ключ (--env-file)')
  process.env.USAGE_LOG_FILE = USAGE
  mkdirSync(OUT, { recursive: true })
  const f = join(OUT, 'rezultaty.json')
  const rez: any = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}
  const save = () => writeFileSync(f, JSON.stringify(rez, null, 1))
  const guard = () => { if (spent() >= STOP) throw new Error(`стоп: потрачено ${spent().toFixed(2)} ₽`) }
  process.env.PROMPT_HYP = 'zh6'
  const { zh6Plan, zh6Write, zh6Popravit } = await import('../../lib/generation/zh6/write')
  const { formatByCode } = await import('../../lib/generation/zh6/formaty')
  // Захар: мат, ирония и резкость, ему подходят все виды форматов
  const s = settingsOf(PERSONAS6.I, 'I')
  if (!rez.plan) { guard(); const p = await zh6Plan(s, { n: 10, rotation: 3 }); rez.plan = p.temy; rez.smesh = p.smesh; save(); console.log('план готов') }
  const plan: any[] = rez.plan
  const m = mem()
  const VIDY: { key: string; format: string; ok: (code: string) => boolean; zapas: string }[] = [
    { key: 'golova', format: 'reels_monolog', ok: c => formatByCode(c)?.talking_head === true && formatByCode(c)?.for[0] === 'reels', zapas: 'reels_golova' },
    { key: 'scenka', format: 'reels_monolog', ok: c => !!formatByCode(c)?.scene && formatByCode(c)?.for[0] === 'reels', zapas: 'reels_scenka_vnutr_golos' },
    { key: 'bezslov', format: 'reels_monolog', ok: c => c === 'reels_bez_slov' || c === 'reels_kabinet' || c === 'reels_ispoved', zapas: 'reels_bez_slov' },
    { key: 'karusel', format: 'carousel', ok: c => formatByCode(c)?.for[0] === 'carousel', zapas: 'carousel_odna_mysl' },
    { key: 'post', format: 'post', ok: c => formatByCode(c)?.for[0] === 'post', zapas: 'post_udar' },
    { key: 'post_tg', format: 'post_tg', ok: c => formatByCode(c)?.for[0] === 'post', zapas: 'post_spor' },
    { key: 'stories', format: 'stories', ok: () => false, zapas: 'stories_razgovor' },
  ]
  const vzyato = new Set<number>()
  rez.materialy = rez.materialy || {}
  for (const v of VIDY) {
    if (rez.materialy[v.key]?.text) continue
    const t = plan.find(x => !vzyato.has(x.n) && v.ok(x.format)) || plan.find(x => !vzyato.has(x.n)) || plan[0]
    vzyato.add(t.n)
    const kod = v.ok(t.format) ? t.format : v.zapas
    guard()
    const r = await zh6Write({ userId: '', settings: s, memory: m } as any, { topic: t.tema, format: v.format as any, intent: t.zadacha === 'zapis' ? 'priglashenie' : 'uznavanie', rol: t.zadacha, reakciya: t.reakciya, formatKod: kod } as any)
    m.zh6.ustr.push(r.zh6.ustr); m.zh6.priemy.push(...r.zh6.priemy); m.zh6.kon.push(r.zh6.kon); m.count++; m.total++
    rez.materialy[v.key] = { tema: t.tema, zaprosheno: v.format, formatKod: kod, format: r.format, formatName: r.zh6.formatName, text: r.text, mesta: r.zh6.mesta.length, ostalos: r.zh6.ostalos.length }
    save(); console.log(`${v.key}: ${r.format} «${r.zh6.formatName}»`)
  }
  if (!rez.popravit && rez.materialy.scenka?.text) {
    guard()
    const p = await zh6Popravit({ userId: '', settings: s, memory: m } as any, rez.materialy.scenka.text, 'Сделай короче и проще, убери одну лишнюю реплику.')
    rez.popravit = { do: rez.materialy.scenka.text, posle: p.text, used: p.used, reason: p.reason || '' }
    save(); console.log(`«Поправить» на сценке: ${p.used ? 'взято' : `не взято (${p.reason})`}`)
  }
  if (!rez.zhh7) {
    delete process.env.PROMPT_HYP
    const { simpleWrite } = await import('../../lib/generation/simple')
    guard()
    const r = await simpleWrite({ userId: '', settings: s, memory: mem() } as any, { topic: plan[0].tema, format: 'post', intent: 'uznavanie' } as any)
    rez.zhh7 = { tema: plan[0].tema, format: r.format, text: r.text }
    save(); console.log('zh+h7: готово')
  }
  console.log(`потрачено в этом файле ${spent().toFixed(2)} ₽`)
}
main().catch(e => { console.error(e); process.exit(1) })
