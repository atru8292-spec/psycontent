// ПЖ5b (эксперимент 22.10, ночь; задача Арины «мысль держит код», разбор zh3/09-MYSL-U-ZHIVYH.md).
// В zh5 одна фраза в промпте про мысль ничего не сдвинула (объяснений 9-12% против 26% у живых, рассказа «вы делаете»
// 8-16% против 3%). Поэтому: код выбирает каркас мысли по памяти автора (как у живых: разоблачение мнения, механизм,
// список, короткий ответ; «образ» только при zh5bx), перед текстом короткий вызов «скелет» (раздел «СК») дает
// утверждение, причины и один пример, текст пишется по скелету. Конец-сарказм отдельным видом, не чаще одного из 8.

import { PZH5B_PICKS } from './prompts.generated'
import { goalOf, seedOf, emptyZh4, type Zh4Memory } from './zh4'
import type { Memory } from './memory'
import type { FormatCode } from './text-guard'

const mem = (m: Memory): Zh4Memory => ({ ...emptyZh4(), ...(m.zh4 || {}) })
const k0 = (m: Memory, who: string) => (m.count || 0) + seedOf(who)
export const card5b = (code: string) => (PZH5B_PICKS[code] || '').split('\n').slice(1).join('\n').trim()
function freshest(list: string[], recent: string[], gap: number, k: number): string {
  const s = ((k % list.length) + list.length) % list.length
  const r = [...list.slice(s), ...list.slice(0, s)]
  return r.find(x => !recent.slice(0, gap).includes(x)) || r[0]
}

// где каркас вместо хода: монолог, ответ, «важные слова», список. Роль, сценка, «малыш», история и карусель
// идут своими ходами, как в zh5.
export const KARKAS_FORMATS: FormatCode[] = ['reels_monolog', 'reels_otvet', 'reels_poslanie', 'reels_spisok']
export function chooseKarkas(m: Memory, format: FormatCode, who: string, obraz: boolean): string | undefined {
  if (!KARKAS_FORMATS.includes(format)) return undefined
  if (format === 'reels_spisok') return 'spisok'
  if (format === 'reels_otvet') return 'otvet'
  const list = ['razoblachenie', 'mehanizm', ...(obraz ? ['obraz'] : [])]
  return freshest(list, mem(m).karkas || [], 1, k0(m, who))
}
// вид первой фразы под каркас: разоблачение начинается с привычной фразы или совета, механизм и образ с утверждения
// или обещания объяснить, список с обещания (заголовок), ответ с вопроса
export function startForKarkas(m: Memory, karkas: string, who: string): string {
  const recent = mem(m).starts
  if (karkas === 'spisok') return 'bez'
  if (karkas === 'otvet') return 'vopros'
  if (karkas === 'razoblachenie') return freshest(['replika', 'sovet'], recent, 1, k0(m, who))
  return freshest(['utverzhdenie', 'obeshanie', 'vopros_z'], recent, 2, k0(m, who))
}
// конец: как в zh5, вопрос не чаще одного из 8, сарказм отдельным видом и тоже не чаще одного из 8
const ENDS: Record<string, string[]> = { ohvat: ['obryv', 'scena', 'shutka', 'vopros', 'sarkazm'], doverie: ['samoironiya', 'mysl', 'obryv', 'scena'], zapis: ['priglashenie'] }
const OWN_END_MOVES = /^Ход: (СПОР В ДВА ГОЛОСА|ИГРАЮ ВРЕДНОГО|ТЕХНИКА В РАЗГОВОРЕ|ЗОВУ ПРЯМО)/mu
const OWN: FormatCode[] = ['reels_scenka', 'reels_rol', 'reels_bez_slov']
export function chooseEnd5b(m: Memory, format: FormatCode, intent: string, moveText: string, who: string): string | undefined {
  if (format === 'carousel' || OWN.includes(format) || OWN_END_MOVES.test(moveText)) return undefined
  const z = mem(m)
  const last7 = z.ends.slice(0, 7)
  const list = ENDS[goalOf(intent)].filter(x => !((x === 'vopros' || x === 'sarkazm') && last7.includes(x)))
  return freshest(list.length ? list : ['obryv'], z.ends, 2, k0(m, who))
}

export type Skeleton = { mysl?: string; pochemu?: string[]; primer?: string; obraz?: string }
// блок для писателя: каркас и скелет; писатель говорит своими словами
export function skeletonText(karkas: string, sk: Skeleton | null, slova: boolean): string {
  const lines = [card5b(`karkas_${karkas}`)]
  if (sk?.mysl) lines.push(`Скелет этого ролика (это заметки для тебя, скажи своими словами): мысль: ${sk.mysl}`)
  if (sk?.pochemu?.length) lines.push(`Почему так: ${sk.pochemu.filter(Boolean).slice(0, 3).join('; ')}`)
  if (sk?.primer) lines.push(`Пример: ${sk.primer}`)
  if (karkas === 'obraz' && sk?.obraz) lines.push(`Сравнение: ${sk.obraz}`)
  if (slova) lines.push(card5b('slova_da'))
  return lines.join('\n')
}
