// Подсчет архетипа из ответов теста-распаковки.
// Каждый выбранный вариант несет веса 1-2 архетипам (основному +2, смежному +1).
// Суммируем по 12, нормируем в проценты от максимума, берем топ 1-3 по порогам:
//  - ведущий всегда;
//  - оттенок (топ-2) только если >= 70% от ведущего;
//  - если топ-1 и топ-2 в пределах ~10% (нет явного лидера) -> гибкий голос;
//  - топ-3 для карточки, если >= 70% от ведущего и оторван от топ-4.

import type { ArchetypeKey, ArchetypeSelection } from './archetypes'

const ALL_KEYS: ArchetypeKey[] = [
  'sage', 'caregiver', 'everyman', 'jester', 'magician', 'hero',
  'lover', 'creator', 'rebel', 'explorer',
]

export type ArchetypeWeights = Partial<Record<ArchetypeKey, number>>

export interface ArchetypeResult {
  scores: Record<ArchetypeKey, number>       // сырые баллы
  percents: Record<ArchetypeKey, number>     // 0-100 от максимума
  ranked: { key: ArchetypeKey; score: number; percent: number }[] // по убыванию
  selection: ArchetypeSelection              // для промпта: primary/secondary/flexible
  top3: { key: ArchetypeKey; percent: number }[] // для карточки-результата
}

const SHADE_THRESHOLD = 0.70 // оттенок и топ-3: не ниже 70% от ведущего
const FLEXIBLE_GAP = 0.12    // топ-1 и топ-2 ближе 12% -> гибкий голос (ценностные вопросы кладут баллы плотнее)

export function computeArchetypes(answers: ArchetypeWeights[]): ArchetypeResult {
  const scores = Object.fromEntries(ALL_KEYS.map((k) => [k, 0])) as Record<ArchetypeKey, number>
  for (const a of answers) {
    if (!a) continue
    for (const k of ALL_KEYS) {
      const v = a[k]
      if (typeof v === 'number') scores[k] += v
    }
  }

  const maxScore = Math.max(1, ...ALL_KEYS.map((k) => scores[k]))
  const percents = Object.fromEntries(
    ALL_KEYS.map((k) => [k, Math.round((scores[k] / maxScore) * 100)])
  ) as Record<ArchetypeKey, number>

  const ranked = ALL_KEYS
    .map((k) => ({ key: k, score: scores[k], percent: percents[k] }))
    .sort((a, b) => b.score - a.score)

  const first = ranked[0]
  const second = ranked[1]
  const third = ranked[2]
  const fourth = ranked[3]

  // Нет ответов вовсе -> пустой выбор (карточка мягкая, промпт без архетипа).
  if (!first || first.score === 0) {
    return { scores, percents, ranked, selection: { primary: null }, top3: [] }
  }

  // Гибкий голос: лидер не оторвался от второго.
  const flexible =
    !!second && second.score > 0 && (first.score - second.score) <= first.score * FLEXIBLE_GAP

  let selection: ArchetypeSelection
  if (flexible) {
    selection = { primary: first.key, secondary: second ? second.key : null, flexible: true }
  } else {
    const hasShade = !!second && second.score >= first.score * SHADE_THRESHOLD
    selection = { primary: first.key, secondary: hasShade ? second.key : null }
  }

  // Топ-3 для карточки: показываем 2-й если >= порога, 3-й если >= порога и оторван от 4-го.
  const top3: { key: ArchetypeKey; percent: number }[] = [{ key: first.key, percent: first.percent }]
  if (second && second.score >= first.score * SHADE_THRESHOLD) {
    top3.push({ key: second.key, percent: second.percent })
    const thirdQualifies =
      third && third.score >= first.score * SHADE_THRESHOLD &&
      (!fourth || (third.score - fourth.score) > first.score * 0.05)
    if (thirdQualifies) top3.push({ key: third.key, percent: third.percent })
  }

  return { scores, percents, ranked, selection, top3 }
}
