// zh13: живой прогон генератора прода (lib/generation/zh13/pishi.ts) без базы: рилсы «Сессия на два окна»,
// «Перевожу на человеческий», «Неудобные вопросы», «Сценка», «Просто мысль в камеру», текст из своей мысли, пост,
// карусель (рецепт zh6). База заменена заглушкой (истории нет, ничего не пишется, расход не идет в usage_log),
// профиль тестовый или из файла. Если в прогоне переписано меньше трех фраз, перепись показывается еще на
// сохраненных текстах zh13 с пометками (только вызовы переписи). Стоп по рублям (--stop, по журналу расхода).
// Без --yes только оценка, без вызовов.
//   npx tsx --env-file=$HOME/Downloads/psycontent/.env.local scripts/zh13-progon.ts --stop=15 --yes [--profil=файл.json]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { napisat } from '../lib/generation/zh13/pishi'
import { perepisatFrazy } from '../lib/generation/zh13/perepis'
import { pometit } from '../lib/generation/zh13/pometki'
import { razobrat } from '../lib/generation/zh13/razbor'
import { formatPo } from '../lib/generation/zh13/formaty'
import { MODEL_PRICES, USD_TO_RUB_DRAFT } from '../lib/energy'

const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const NABOR = flag('nabor') || 'zh13'
const DIR = join(process.cwd(), '_знания', 'мозг-генератора', 'zh13-prod', ...(NABOR === 'zh14' ? ['zh14'] : NABOR === 'zh14b' ? ['zh14b'] : NABOR === 'zhivye' ? ['zhivye'] : NABOR === 'zhivye2' ? ['zhivye2'] : NABOR === 'zhivye3' ? ['zhivye3'] : NABOR === 'podpisi' ? ['podpisi'] : []))
// zh14b: 5 текстов zh14 заново после правок 19.11; прошлый текст психолога (для «Слушай» и совета подряд) из zh14
const ZH14 = join(process.cwd(), '_знания', 'мозг-генератора', 'zh13-prod', 'zh14', 'rezultaty.json')
const USAGE = join(DIR, 'usage.jsonl')
const STOP = Number(flag('stop')) || 15

const PROFIL = flag('profil') ? JSON.parse(readFileSync(flag('profil'), 'utf8')) : {
  full_name: 'Тест', author_gender: 'female', reader_address: 'ty', profanity: 'no', approaches: ['КПТ', 'Гештальт'],
  niches: ['Тревога и накручивание', 'Ревность', 'Вина после «нет»', 'Выгорание', 'Мамы и взрослые дочери', 'Зависть и сравнение'],
  klienty: { groups: ['trevoga', 'otnosheniya', 'rabota', 'roditeli'], age: ['25-45'], gender: 'Все', format: ['Онлайн'] },
  tone_verbal: 'Слушай, давай без паники. С тобой все нормально, просто сил нет, и от этого страшно. Это лечится.',
  client_pain_phrases: 'Я опять накручиваю\nНе могу сказать нет',
}
const FAKTY = 'В 20 лет я вышла замуж за первого парня, потому что боялась остаться одна. Через семь лет развелась. Работала бухгалтером и только в 32 пошла учиться на психолога. Долго считала, что просить о помощи стыдно.'
// zh13: прошлый набор (8 текстов); zh14: новые форматы 19.11 (9 текстов) и «Подбери сам» (один целиком, второй только выбор)
// zhivye (27.11): темы с живыми ситуациями, у каждого текста свой психолог (u), писатель придумывает ситуацию сам
// по трем живым строкам темы; последний текст: та же тема и формат, что у первого, другой психолог (разброс)
// zhivye2 (27.11 вечер): тот же набор после правок по оценкам Арины, для сравнения «было / стало»
// podpisi (28.11): шесть рилсов из набора zhivye у тех же психологов, после правки подписей
const ZADANIYA: { kod: string; mysl?: string; tema?: string; tolkoVybor?: boolean; n?: number; pred?: string; u?: string }[] = NABOR === 'podpisi' ? [
  { kod: 'scenka', tema: 'Панические атаки', u: 'psiholog-1' }, { kod: 'pov_assoc', tema: 'Одиночество без пары', u: 'psiholog-4' },
  { kod: 'mysl', tema: 'Стареющие родители и уход за ними', u: 'psiholog-5' }, { kod: 'voprosy', tema: 'Обида', u: 'psiholog-6' },
  { kod: 'scenka', tema: 'Подростки: закрытая дверь', u: 'psiholog-7' }, { kod: 'perevod', tema: 'Стыд', u: 'psiholog-8' },
] : NABOR === 'zhivye' || NABOR === 'zhivye2' || NABOR === 'zhivye3' ? [
  { kod: 'scenka', tema: 'Панические атаки', u: 'psiholog-1' }, { kod: 'auto', tema: 'Утрата и горе', u: 'psiholog-2' },
  { kod: 'p_paradoks', tema: 'Материнское выгорание и декрет', u: 'psiholog-3' }, { kod: 'pov_assoc', tema: 'Одиночество без пары', u: 'psiholog-4' },
  { kod: 'mysl', tema: 'Стареющие родители и уход за ними', u: 'psiholog-5' }, { kod: 'voprosy', tema: 'Обида', u: 'psiholog-6' },
  { kod: 'auto', tema: 'Подростки: закрытая дверь', u: 'psiholog-7' }, { kod: 'perevod', tema: 'Стыд', u: 'psiholog-8' },
  { kod: 'auto', tema: 'Смена профессии', u: 'psiholog-9' }, { kod: 'auto', tema: 'Сравнение с другими и зависть', u: 'psiholog-10' },
  { kod: 'scenka', tema: 'Панические атаки', u: 'psiholog-11' },
  // темы с тремя строками (ревью 27.11): по две строки у каждого, два психолога на тему, сравнить придуманные ситуации
  { kod: 'mysl', tema: 'Перфекционизм', u: 'psiholog-12' }, { kod: 'mysl', tema: 'Перфекционизм', u: 'psiholog-13' },
  { kod: 'p_paradoks', tema: 'Неумение отдыхать и вина за отдых', u: 'psiholog-14' }, { kod: 'p_paradoks', tema: 'Неумение отдыхать и вина за отдых', u: 'psiholog-15' },
] : NABOR === 'zh14b' ? [
  { kod: 'pov_assoc', tema: 'Тревога и накручивание', n: 0 }, { kod: 'vrednye', tema: 'Сепарация от родителей', n: 3, pred: 'golos' },
  { kod: 'sebe20', mysl: FAKTY, n: 4, pred: 'vrednye' }, { kod: 'dve_zhizni', tema: 'Страх ошибиться', n: 6, pred: 'slyshit' },
  { kod: 'film_bez', tema: 'Мамы и взрослые дочери', n: 7, pred: 'dve_zhizni' },
] : NABOR === 'zh14' ? [
  { kod: 'pov_assoc', tema: 'Тревога и накручивание' }, { kod: 'pov_scenka', tema: 'Неумение отдыхать и вина за отдых' },
  { kod: 'golos', tema: 'Внутренний критик' }, { kod: 'vrednye', tema: 'Сепарация от родителей' },
  { kod: 'sebe20', mysl: FAKTY }, { kod: 'slyshit', tema: 'Депрессия и апатия' }, { kod: 'dve_zhizni', tema: 'Страх ошибиться' },
  { kod: 'film_bez', tema: 'Мамы и взрослые дочери' }, { kod: 'film_lico', tema: 'Смена профессии' },
  { kod: 'auto', tema: 'Ревность' }, { kod: 'auto', tema: 'Выгорание', tolkoVybor: true },
] : [
  { kod: 'sessiya' }, { kod: 'perevod' }, { kod: 'voprosy' }, { kod: 'scenka' }, { kod: 'mysl' },
  { kod: 'mysl', mysl: 'Тревога не враг. Она сторож, который слишком старается и лает на каждый шорох' },
  { kod: 'p_paradoks' }, { kod: 'karusel' },
]

// заглушка базы: любой запрос отвечает пусто (или одним прошлым текстом психолога)
function stubDb(n: number, pred?: any): any {
  const pusto = { data: pred ? [{ id: 'pred', created_at: new Date().toISOString(), topic: null, group_id: null, check_result: { zh13: pred } }] : [], count: n, error: null }
  const q: any = new Proxy(function () {}, {
    get: (_t, k) => k === 'then' ? (ok: any) => ok(pusto) : k === 'maybeSingle' || k === 'single' ? async () => ({ data: null, error: null }) : () => q,
    apply: () => q,
  })
  return { from: () => q, rpc: () => q }
}
const rub = () => !existsSync(USAGE) ? 0 : readFileSync(USAGE, 'utf8').split('\n').filter(Boolean).reduce((s, l) => {
  try {
    const x = JSON.parse(l); const [i, c, o] = (MODEL_PRICES as any)[x.model] || [2, 0.1, 10]
    const cached = x.usage?.prompt_tokens_details?.cached_tokens || 0
    return s + (((x.usage?.prompt_tokens || 0) - cached) * i + cached * c + (x.usage?.completion_tokens || 0) * o) / 1e6 * USD_TO_RUB_DRAFT
  } catch { return s }
}, 0)

async function main() {
  mkdirSync(DIR, { recursive: true })
  if (!argv.includes('--yes')) { console.log(`Без --yes ничего не вызываю. ${ZADANIYA.length} текстов gpt-6.1-sol, стоп ${STOP} ₽, по опыту около 1-2 ₽ за текст с переписью.`); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('нужен ключ (--env-file)')
  process.env.USAGE_LOG_FILE = USAGE
  process.env.PROMPT_HYP = 'zh6' // карусель пишет zh6, как на проде
  delete process.env.GENERATION_MODEL; delete process.env.GENERATION_WRITER_MODEL
  const fR = join(DIR, 'rezultaty.json')
  const out: any[] = existsSync(fR) ? JSON.parse(readFileSync(fR, 'utf8')) : []
  for (let i = 0; i < ZADANIYA.length; i++) {
    const z = ZADANIYA[i]
    const key = z.u ? `${z.kod}:${z.tema}:${z.u}` : `${z.kod}${z.mysl ? ':mysl' : ''}${z.tema && z.kod === 'auto' ? ':' + z.tema : ''}`
    if (out.some(x => x.key === key)) continue
    if (rub() >= STOP - 1.5) { console.log(`стоп по лимиту: ${rub().toFixed(2)} ₽`); break }
    const t0 = Date.now()
    try {
      if (z.tolkoVybor) {
        // только выбор формата: ранжирование моделью и смесь, без текста
        const { ranzhirovat } = await import('../lib/generation/zh13/podbor')
        const { vybratFormat } = await import('../lib/generation/zh13/smes')
        const { FORMATY } = await import('../lib/generation/zh13/formaty')
        const rang = await ranzhirovat({ tema: z.tema || null, mysl: null, situaciya: null, formaty: FORMATY.filter(f => !f.trebuet), timeoutMs: 20000, knownNames: [] })
        const v = vybratFormat(rang.map(x => x.kod), [], 0, { fakty: false, scena: false, tema: z.tema || '' })
        out.push({ key, kod: 'auto', tolkoVybor: true, tema: z.tema, rang, vybor: v })
        console.log(`${key}: только выбор: ${v.kod} (${v.pochemu}); ранжирование: ${rang.map(x => x.kod).join(', ')}`)
        writeFileSync(fR, JSON.stringify(out, null, 1)); continue
      }
      const pred = z.pred && existsSync(ZH14) ? JSON.parse(readFileSync(ZH14, 'utf8')).find((x: any) => x.key === z.pred)?.meta : undefined
      const it = await napisat(stubDb((z.n ?? i) * 5 + 1, pred), z.u || '', NABOR === 'zhivye' || NABOR === 'zhivye2' || NABOR === 'zhivye3' || NABOR === 'podpisi' ? { ...PROFIL, niches: ZADANIYA.map(x => x.tema).filter(Boolean), klienty: { ...PROFIL.klienty, groups: [] } } : PROFIL, { formatKod: z.kod === 'auto' ? null : z.kod, mysl: z.mysl || null, tema: z.tema || null, fromPostId: null }, [], { bezUcheta: true })
      out.push({ key, kod: z.kod, imya: it.f.imya, vid: it.f.vid, ms: Date.now() - t0, meta: it.meta, problemy: it.proverka.problemy, detali: it.proverka.detali, blizost: it.proverka.blizost, tekst: it.rez.tekst, glavnoe: it.rez.glavnoe, podpis: it.rez.podpis, syroe: it.syroe })
      console.log(`${key}: ${Math.round((Date.now() - t0) / 1000)} с, пометок ${it.meta.pometki.length}, переписано ${it.meta.perepis.filter(x => x.vzyato).length}, проблемы: ${it.proverka.problemy.join(', ') || 'нет'}; всего ${rub().toFixed(2)} ₽`)
    } catch (e: any) {
      const m = String(e?.message || e)
      console.log(`${key}: ошибка ${m.slice(0, 160)}`)
      if (/credit_balance|insufficient_quota|openai_401/i.test(m)) { console.log('на счете OpenAI кончились деньги, стоп'); break }
    }
    writeFileSync(fR, JSON.stringify(out, null, 1))
  }

  // до и после переписи: из прогона, а если там меньше трех, на сохраненных текстах zh13 с пометками
  if (argv.includes('--tolko-perepis')) out.filter(x => x.meta).forEach(x => { x.meta.perepis = x.meta.perepis || [] })
  const doPosle: any[] = out.filter(x => x.meta).flatMap(x => (x.meta.perepis || []).map((p: any) => ({ istochnik: `прогон: ${x.imya}`, ...p })))
    .concat(out.filter(x => x.meta?.perepisCelikom).map(x => ({ istochnik: `прогон: ${x.imya} (рубрика целиком)`, kod: 'adresat', ...x.meta.perepisCelikom })))
  const fD = join(DIR, 'do-posle.json')
  if (NABOR === 'zh13' && doPosle.filter(x => x.vzyato).length < 3 && rub() < STOP - 1.5) {
    const R = JSON.parse(readFileSync(join(process.env.HOME || '', 'Downloads/psy-zh7/_знания/мозг-генератора/zh13/rezultaty-zh13.json'), 'utf8'))
    for (const [k, kod] of [['p2:p2:P1', 'p_razoblachenie'], ['p2:k2:K1', 'mysl'], ['p2:k2:K2', 'mysl']] as const) {
      const f = formatPo(kod)!; const r = razobrat(R[k].text, f)
      const pom = pometit(r.glavnoe, kod, r.nadpis)
      if (!pom.length) continue
      const pr = await perepisatFrazy({ text: r.glavnoe, kod, nadpis: r.nadpis, pometki: pom, kusok: 'Вдруг начнет орать. Или скажет: «На такси езди». И все будут смотреть, а я... Проще потерпеть.', mat: false, deadline: Date.now() + 60000, knownNames: [] })
      for (const p of pr.perepis) doPosle.push({ istochnik: `сохраненный текст zh13 ${k}`, ...p })
    }
  }
  writeFileSync(fD, JSON.stringify(doPosle, null, 1))
  console.log(`готово: ${out.length} текстов, переписей ${doPosle.length} (взято ${doPosle.filter(x => x.vzyato).length}); всего ${rub().toFixed(2)} ₽`)
}
main().catch(e => { console.error('ошибка:', String(e?.message || e).slice(0, 300)); process.exit(1) })
