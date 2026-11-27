// Манеры «Как ты пишешь в блоге?» (27.11.2026): знакомство (шаг 5) и экран голоса в Настройках.
// Коды те же, что читает генератор (MANERA в lib/generation/zh13/prompt.ts), хранятся в onboarding_profiles.manera.
// Список и доли по 245 рилсам: _знания/разборы/MANERY-PSIHOLOGOV-2026-11-27.md. Тексты: copywriter-psycont.
export type Manera = { kod: string; imya: string; primer: string }

export const MANERY: Manera[] = [
  { kod: 'obyasnyayu', imya: 'Объясняю, как это устроено', primer: 'P1' },
  { kod: 'ironiya', imya: 'С иронией', primer: 'P2' },
  { kod: 'pryamo', imya: 'Прямо, без сюсюканья', primer: 'P3' },
  { kod: 'berezhno', imya: 'Бережно, по-доброму', primer: 'P4' },
  { kod: 'posvoyski', imya: 'По-свойски, на равных', primer: 'P5' },
]
export const MANERA_MAX = 2
export const maneraIz = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((k): k is string => typeof k === 'string' && MANERY.some(m => m.kod === k)).slice(0, MANERA_MAX)
