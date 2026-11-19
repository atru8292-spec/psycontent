// zh13: проверка качества каждого текста кодом, без модели и без денег (меры из анализа опыта, scripts/zh13/analiz13.ts
// в ~/Downloads/psy-zh7). Результат пишется в zh13_kachestvo рядом с текстом (lib/generation/zh13/kachestvo-db.ts),
// доли одинаковых начал за 7 дней считаются там же по базе.
import dannye from './dannye.json'
import { ritm, blizost, osnova, frazy, aforizm, obshieCepochki, slova, nGrams, type Ritm } from './tekst'
import type { Format13 } from './formaty'
import { POMETKI } from './pometki'
import { TEKSTY_PRAVOK } from './pravki'

export const PROBLEMY: Record<string, string> = {
  moral: 'Мораль или вывод в конце',
  vopros_konec: 'Вопрос подписчикам в конце',
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
}): Proverka {
  const { f } = o
  const osn = osnova(o.tekst, f.vid) || o.glavnoe
  const F = frazy(osn)
  const konec = F.slice(-1)[0] || ''
  const problemy: string[] = []
  const detali: Record<string, unknown> = {}

  // мораль: конец текста (кроме сценки и сессии, там конец это реплика) или любая фраза подписи
  const moralKonec = !['sessiya', 'scenka'].includes(f.vyvod) && aforizm(konec)
  const moralPodpis = frazy(o.podpis).some(aforizm)
  if (moralKonec || moralPodpis) { problemy.push('moral'); detali.moral = moralPodpis ? o.podpis : konec }

  // вопрос подписчикам: подпись с вопросом; конец текста вопросом, кроме неудобных вопросов и диалогов
  const voprosPodpis = /\?\s*$/.test(o.podpis)
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
  const kopii = [...new Set([...o.obrazcy, o.kusok, ...TEKSTY_PRAVOK].flatMap(x => obshieCepochki(`${osn}\n${o.podpis}`, x, 6)))]
  if (kopii.length) { problemy.push('kopiya'); detali.kopiya = kopii.slice(0, 5) }

  if (o.poslednyayaOpora && o.poslednyayaOpora === o.opora) problemy.push('opora_povtor')

  // неудобные вопросы: хотя бы три разных начала (первые два слова вопроса без номера)
  if (f.kod === 'voprosy') {
    const nach = F.filter(x => /\?\s*$/.test(x)).map(x => slova(x.replace(/^\s*\d+[.)]\s*/, '')).slice(0, 2).join(' '))
    if (nach.length >= 4 && new Set(nach).size < 3) { problemy.push('voprosy_odinakovye'); detali.voprosy = [...new Set(nach)] }
  }

  let r: Ritm | null = null, b: number | null = null
  if (osn && slova(osn).length >= 25) {
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
