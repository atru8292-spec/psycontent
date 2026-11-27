// Манеры «Как ты пишешь в блоге?» (27.11.2026): знакомство (шаг 5) и экран голоса в Настройках.
// Коды те же, что читает генератор (MANERA в lib/generation/zh13/prompt.ts), хранятся в onboarding_profiles.manera.
// Фразы-примеры на одну тему (стыдно отдыхать), чтобы выбирали манеру, а не тему. Список и доли по 245 рилсам: _знания/разборы/MANERY-PSIHOLOGOV-2026-11-27.md. Тексты: copywriter-psycont.
export type Manera = { kod: string; imya: string; primer: string }

export const MANERY: Manera[] = [
  { kod: 'obyasnyayu', imya: 'Объясняю, как это устроено', primer: 'Стыдно отдыхать, если в детстве отдых давали за пятерки' },
  { kod: 'ironiya', imya: 'С иронией', primer: 'Отдыхаю как умею: лежу и ругаю себя за потерянный день' },
  { kod: 'pryamo', imya: 'Прямо, без сюсюканья', primer: 'Дела не кончатся никогда. Отдыхать придется с хвостами' },
  { kod: 'berezhno', imya: 'Бережно, по-доброму', primer: 'Можно отдыхать и до того, как все дела сделаны' },
  { kod: 'posvoyski', imya: 'По-свойски, на равных', primer: 'Я психолог и тоже валяюсь в выходной с чувством вины' },
]
export const MANERA_MAX = 2
export const maneraIz = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((k): k is string => typeof k === 'string' && MANERY.some(m => m.kod === k)).slice(0, MANERA_MAX)
