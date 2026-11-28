// zh13: проверка качества каждого текста кодом, без модели и без денег (меры из анализа опыта, scripts/zh13/analiz13.ts
// в ~/Downloads/psy-zh7). Результат пишется в zh13_kachestvo рядом с текстом (lib/generation/zh13/kachestvo-db.ts),
// доли одинаковых начал за 7 дней считаются там же по базе.
import dannye from './dannye.json'
import { ritm, blizost, osnova, frazy, aforizm, obshieCepochki, slova, nGrams, pohozhe, shodstvo, estGlagol, type Ritm } from './tekst'

// подпись с моралью (любая фраза подписи похожа на вывод) или с вопросом подписчикам в конце
// мораль в подписи: только последняя фраза (28.11: подпись теперь 3-5 фраз и объясняет; по любой фразе мораль нашлась бы
// у 7 из 14 живых подписей, по последней у 1 из 14)
export const podpisMoral = (p: string) => { const F = frazy(p); return F.length > 0 && aforizm(F[F.length - 1]) }
export const podpisVopros = (p: string) => /\?\s*[»"]?\s*$/.test(p.trim())
// вопрос в подписи можно, если он конкретный (28.11, Арина: вопрос в подписи дает живой разговор); плохо только дежурный
// вопрос в конце («Знакомо?», «А у вас как?», «Согласны?») или два вопроса подряд подписчикам
const DEZHURNYY = /(?<!\p{L})(знакомо|узнали себя|узнаешь себя|согласн\p{L}*|а у вас как|а у тебя как|как у вас|как у тебя|а вы как|а ты как|что думаете|что скажете|было такое|бывало такое|пишите|напишите|делитесь|поделитесь)(?!\p{L})[^.!?]*\?\s*[»"]?\s*$/iu
// пересказ ролика в подписи (28.11, Арина: «в описании не то же самое, что в ролике»). Доля значимых слов подписи (по
// первым пяти буквам), которые есть в самом ролике: у 12 живых подписей dannye от 0 до 0,15, у наших 24 подписей
// прогонов 27-28.11 в половине от 0,2 до 0,6. Порог 0,2.
const STOP_POD = new Set(['и', 'в', 'не', 'на', 'что', 'а', 'я', 'ты', 'он', 'она', 'это', 'как', 'с', 'по', 'к', 'но', 'так', 'же', 'то', 'за', 'у', 'из', 'мне', 'тебе', 'бы', 'ли', 'еще', 'уже', 'все', 'ее', 'его', 'их', 'мы', 'вы', 'был', 'была', 'было', 'быть', 'или', 'если', 'когда', 'потому', 'только', 'даже', 'очень', 'просто', 'там', 'тут', 'вот', 'для', 'о', 'от', 'до', 'ну', 'да', 'нет', 'чтобы', 'себя', 'сама', 'сам'])
const znachimye = (t: string) => slova(t).filter(w => w.length > 3 && !STOP_POD.has(w)).map(w => w.slice(0, 5))
export function dolyaPereskaza(podpis: string, rolik: string): number {
  const P = znachimye(podpis), T = new Set(znachimye(rolik))
  return P.length ? P.filter(w => T.has(w)).length / P.length : 0
}
export const PERESKAZ_POROG = 0.2
export const podpisPereskaz = (podpis: string, rolik: string) => slova(podpis).length >= 8 && dolyaPereskaza(podpis, rolik) > PERESKAZ_POROG
export const podpisVoprosPloho = (p: string) => { const t = p.trim(); return DEZHURNYY.test(t) || (t.match(/\?/g) || []).length >= 3 }
// подпись-перевертыш (правка Арины 19.11: «Звонок на три минуты. Внутренний долг на всю жизнь», «Диплом остается.
// Обязанность ... в комплект не входит»): 2-3 короткие фразы с противопоставлением. Противопоставление: «не X, а Y»,
// коротко и навсегда, остается и не входит, или две фразы без глагола подряд (афоризм из двух существительных).
const KONTRAST = [
  /(?<!\p{L})не\s+(?:\p{L}+\s+){0,4}?\p{L}+,?\s+а\s+\p{L}/iu,
  /,\s*а\s+не\s+\p{L}/iu,
  /в\s+комплект\s+не\s+входит/iu,
  /(?<!\p{L})(остает\p{L}*|остал\p{L}*|остан\p{L}*)(?!\p{L})[\s\S]*(?<!\p{L})(не\s+входит|уходит|не\s+остает\p{L}*|исчеза\p{L}*|не\s+обязан\p{L}*)/iu,
]
const DOLGO = /(?<!\p{L})(на всю жизнь|навсегда|всю жизнь|на годы|годами|на десятилетия|навечно)(?!\p{L})/iu
const KOROTKO = /(?<!\p{L})(минут\p{L}*|секунд\p{L}*|на час|один раз|на день|на вечер|мгновени\p{L}*)(?!\p{L})/iu
export const kontrast = (t: string) => KONTRAST.some(r => r.test(t)) || (DOLGO.test(t) && KOROTKO.test(t))
export function podpisPerevertysh(p: string): boolean {
  const F = frazy(p)
  if (F.length < 2 || F.length > 3 || slova(p).length > 25 || F.some(f => slova(f).length > 12)) return false
  if (kontrast(p)) return true
  return F.filter(f => !estGlagol(f) && slova(f).length <= 6).length >= 2
}
// советы с числом («отложи телефон на десять минут»): одинаковое число со временем в двух текстах психолога подряд
const CHISLO = String.raw`(?:\d+|одн\p{L}*|две|два|двух|тр[иеи]\p{L}*|четыр\p{L}*|пят\p{L}*|шест\p{L}*|сем\p{L}*|восем\p{L}*|девят\p{L}*|десят\p{L}*|пятнадцат\p{L}*|двадцат\p{L}*|тридцат\p{L}*|сорок\p{L}*|полчаса|пару)`
const SOVET = new RegExp(String.raw`(?<!\p{L})(?:на\s+)?${CHISLO}\s+(?:минут\p{L}*|секунд\p{L}*|час\p{L}*|дн\p{L}*|недел\p{L}*|раз\p{L}*)(?!\p{L})`, 'giu')
export const sovetySChislom = (t: string) => [...new Set([...String(t || '').matchAll(SOVET)].map(m => slova(m[0]).filter(w => w !== 'на').join(' ')))]
export function povtorSoveta(tekst: string, proshlyy: string): string[] {
  const bylo = new Set(sovetySChislom(proshlyy))
  return sovetySChislom(tekst).filter(x => bylo.has(x))
}

// мораль в конце текста (кроме сценки и сессии, там конец это реплика); повтор своей мысли моралью не считаем.
// Возвращает место для переписи: последнюю фразу, а если она начинается с «А»/«Но» после «не в том» (или вообще после
// «не ...», как «Задача не в том... А в том...»), то вместе с предыдущей
export function moralKonca(f: Format13, tekst: string, glavnoe: string, mysl?: string | null): string | null {
  if (['sessiya', 'scenka'].includes(f.vyvod)) return null
  const osn = osnova(tekst, f.vid) || glavnoe
  const F = frazy(osn)
  const konec = F.slice(-1)[0] || ''
  if (!konec || !aforizm(konec)) return null
  if (mysl && (pohozhe(konec, mysl) || shodstvo(konec, mysl) > 0.4 || shodstvo(mysl, konec) > 0.4)) return null
  const pred = F.slice(-2)[0]
  if (F.length >= 2 && /^[«"\s]*(а|но)\s/iu.test(konec) && /(?<!\p{L})не\s/iu.test(pred)) {
    const i0 = glavnoe.lastIndexOf(pred), i1 = glavnoe.lastIndexOf(konec)
    if (i0 >= 0 && i1 > i0) return glavnoe.slice(i0, i1 + konec.length)
  }
  return glavnoe.includes(konec) ? konec : null
}
import type { Format13 } from './formaty'
import { POMETKI } from './pometki'
import { TEKSTY_PRAVOK } from './pravki'
import { PODPISI } from './prompt'
import { PODPISI_PUL } from './podpis'

export const PROBLEMY: Record<string, string> = {
  moral: 'Мораль или вывод в конце',
  vopros_konec: 'Вопрос подписчикам в конце',
  pereskaz: 'Подпись пересказывает ролик',
  podozhdi: 'Хук «Подожди,»',
  podpis_shablon: 'Подпись по шаблону («Иногда», «Можно ... и ...»)',
  povtor_podpisi: 'Начало подписи повторяется (больше 15% за неделю)',
  povtor_nachala: 'Первые слова текста повторяются (больше 15% за неделю)',
  opora_povtor: 'Опора подряд та же',
  metki: 'Служебные метки в тексте',
  yo: 'Буква «ё»',
  tire: 'Длинное тире',
  rod: 'Род читателя',
  kopiya: 'Списано с образца (6 слов подряд)',
  ritm_daleko: 'Ритм далеко от живых',
  voprosy_odinakovye: 'Неудобные вопросы: меньше трех разных начал',
  perevertysh: 'Подпись-перевертыш (короткие фразы с противопоставлением)',
  povtor_soveta: 'Совет с тем же числом, что в прошлом тексте («на десять минут»)',
  scena_repliki: 'Реплики сцены не совпадают с записью',
  povtor_oborotov: 'Повтор оборотов (4+ слова) в текстах психолога за неделю',
  // пометки, оставшиеся после переписи (pometki.ts)
  ...Object.fromEntries(Object.entries(POMETKI).map(([k, v]) => [`pometka_${k}`, `Пометка: ${v}`])),
}

const ROD = /(?<!\p{L})(ты|вы)\s+(?:\p{L}+\s+){0,2}(\p{L}{2,}(?:ла|лась)|сама|одна|должна|готова|рада|виновата|уверена|бездельница)(?!\p{L})/giu
// реплики ролей (мама, клиентка) по смыслу бывают в женском роде, их не проверяем
const bezRoley = (t: string) => t.split('\n').filter(l => !/^\s*[А-ЯЁ][а-яё]+(?: \d)?\s*:/u.test(l)).join('\n')
const dvaSlova = (s: string) => slova(String(s || '').replace(/^[«"(\s]+/, '')).slice(0, 2).join(' ')
const RITM_ZHIVYH = (dannye as any).ritm as Record<'reels' | 'carousel' | 'post', Ritm>
// порог «ритм далеко»: у одного текста мера шумная (в опыте среднее по варианту 0,29-0,42), флажок только на явный провал
export const RITM_POROG = 0.8

export type Proverka = {
  podpisNachalo: string
  pervyeSlova: string
  problemy: string[]
  detali: Record<string, unknown>
  ritm: Ritm | null
  blizost: number | null
}

export function proverit(o: {
  f: Format13; syroe: string; tekst: string; glavnoe: string; podpis: string
  obrazcy: string[]; kusok: string; opora: string; poslednyayaOpora: string | null; auditoriyaZhenshiny: boolean
  mysl?: string | null
  proshlyy?: string        // прошлый текст психолога (основной текст и подпись): повтор совета с числом
}): Proverka {
  const { f } = o
  const osn = osnova(o.tekst, f.vid) || o.glavnoe
  const F = frazy(osn)
  const konec = F.slice(-1)[0] || ''
  const problemy: string[] = []
  const detali: Record<string, unknown> = {}

  // мораль: конец текста (кроме сценки и сессии, там конец это реплика) или любая фраза подписи
  // текст из своей мысли: ее повтор в конце моралью не считаем (решение Арины 19.11)
  const povtorMysli = !!o.mysl && (pohozhe(konec, o.mysl) || shodstvo(konec, o.mysl) > 0.4 || shodstvo(o.mysl, konec) > 0.4)
  const moralKonec = !['sessiya', 'scenka'].includes(f.vyvod) && aforizm(konec) && !povtorMysli
  const moralPodpis = frazy(o.podpis).some(aforizm)
  if (moralKonec || moralPodpis) { problemy.push('moral'); detali.moral = moralPodpis ? o.podpis : konec }
  if (o.podpis && podpisPerevertysh(o.podpis)) { problemy.push('perevertysh'); detali.perevertysh = o.podpis }
  if (o.podpis && f.vid !== 'post' && podpisPereskaz(o.podpis.replace(/\n\n(Если (ты|вы) здесь впервые|Я \S+, психолог|Привет, я)[\s\S]*$/u, ''), o.glavnoe)) { problemy.push('pereskaz'); detali.pereskaz = o.podpis }
  if (o.proshlyy) {
    const ps = povtorSoveta(`${osn}\n${o.podpis}`, o.proshlyy)
    if (ps.length) { problemy.push('povtor_soveta'); detali.povtorSoveta = ps }
  }

  // вопрос подписчикам: подпись с вопросом; конец текста вопросом, кроме неудобных вопросов и диалогов
  const voprosPodpis = podpisVoprosPloho(o.podpis)
  const voprosTekst = f.kod !== 'voprosy' && !['sessiya', 'scenka'].includes(f.vyvod) && /\?\s*$/.test(konec)
  if (voprosPodpis || voprosTekst) { problemy.push('vopros_konec'); detali.vopros = voprosPodpis ? o.podpis : konec }

  if (/^[«"\s]*подожди/iu.test(F[0] || o.glavnoe)) problemy.push('podozhdi')
  if (/^[«"\s]*иногда(?!\p{L})/iu.test(o.podpis) || /^[«"\s]*можно\s.+?\sи\s/iu.test(o.podpis)) { problemy.push('podpis_shablon'); detali.podpis = o.podpis }

  if (/<\/?[а-яa-z ]{3,}>/iu.test(o.tekst) || /(?:^|\n)\s*(Образец|Живой кусок|Как снять|Подойдет еще)\s*:?/iu.test(o.glavnoe)) problemy.push('metki')
  // «ё» и длинные тире чистит ochistit13 до показа: проблема, только если они дошли до текста
  if (/[ёЁ]/.test(o.tekst)) problemy.push('yo')
  if (/[—–]/.test(o.tekst)) problemy.push('tire')

  if (!o.auditoriyaZhenshiny) {
    const rod = [...bezRoley(`${o.glavnoe}\n${o.podpis}`).matchAll(ROD)].map(m => m[0])
    if (rod.length) { problemy.push('rod'); detali.rod = rod.slice(0, 5) }
  }

  // копирование образцов, живого куска и примеров из правок Арины (модель может начать копировать ее «живо»)
  // слова, которые требует сам формат («Что слышит психолог: читать в описании»), копией не считаем
  const shablon = new Set(obshieCepochki(f.kak, f.kak, 6))
  const kopii = [...new Set([...o.obrazcy, o.kusok, ...TEKSTY_PRAVOK, ...PODPISI, ...PODPISI_PUL].flatMap(x => obshieCepochki(`${osn}\n${o.podpis}`, x, 6)))].filter(x => !shablon.has(x))
  if (kopii.length) { problemy.push('kopiya'); detali.kopiya = kopii.slice(0, 5) }

  if (o.poslednyayaOpora && o.poslednyayaOpora === o.opora) problemy.push('opora_povtor')

  // неудобные вопросы: хотя бы три разных начала (первые два слова вопроса без номера)
  if (f.kod === 'voprosy') {
    const nach = F.filter(x => /\?\s*$/.test(x)).map(x => slova(x.replace(/^\s*\d+[.)]\s*/, '')).slice(0, 2).join(' '))
    if (nach.length >= 4 && new Set(nach).size < 3) { problemy.push('voprosy_odinakovye'); detali.voprosy = [...new Set(nach)] }
  }

  let r: Ritm | null = null, b: number | null = null
  // ритм речи меряем только там, где речь есть: у надписей на экране и сцены из фильма без лица мерить нечего
  const bezRechi = f.vyvod === 'ekran' || f.kod === 'film_bez'
  if (!bezRechi && osn && slova(osn).length >= 25) {
    r = ritm([osn])
    b = blizost(r, RITM_ZHIVYH[f.vid])
    if (b > RITM_POROG) problemy.push('ritm_daleko')
  }

  return { podpisNachalo: dvaSlova(o.podpis), pervyeSlova: dvaSlova(F[0] || o.glavnoe), problemy, detali, ritm: r, blizost: b }
}

// повтор оборотов: одинаковые цепочки из 4+ слов в разных текстах одного психолога (за 7 дней, kachestvo-db.ts).
// Совпавшие подряд четверки склеиваются в один оборот. Цепочки без двух слов от 4 букв («и я не на») не считаем.
export function povtoryOborotov(tekst: string, drugie: string[], n = 4): string[] {
  const w = slova(tekst)
  const chuzhie = new Set<string>()
  for (const d of drugie) for (const g of nGrams(d, n)) chuzhie.add(g)
  const out: string[] = []
  let i = 0
  while (i + n <= w.length) {
    if (!chuzhie.has(w.slice(i, i + n).join(' '))) { i++; continue }
    let j = i
    while (j + 1 + n <= w.length && chuzhie.has(w.slice(j + 1, j + 1 + n).join(' '))) j++
    const fraza = w.slice(i, j + n)
    if (fraza.filter(x => x.length >= 4).length >= 2) out.push(fraza.join(' '))
    i = j + n
  }
  return [...new Set(out)]
}
