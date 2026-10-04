// Ползунки тона (tone_formal, tone_serious, tone_cautious, 0..100, по умолчанию 50) в указание модели.
// Смысл как в движке старых генераторов (lib/profile-context.ts) и в метках экспресса: высокое значение
// это формально / серьезно / бережно, низкое это разговорно / с юмором / прямо.
// Три ступени с каждой стороны и середина. Середина (43..57) ничего не добавляет: нейтрально, тон по голосу.
//
// Спор с явным выбором. «Мат» (profanity) и «Эмоции» (intensity) человек выбирает словами на экране голоса,
// а ползунки стоят в свернутой «тонкой настройке» экспресса и чаще всего не тронуты. Поэтому явный выбор
// главнее: если ползунок с ним спорит, сторону ползунка не выводим совсем.
//   мат точечно или свободно, эмоции «на эмоциях»  → не выводим сдержанную (формальную) сторону tone_formal;
//   эмоции «на эмоциях»                            → не выводим бережную сторону tone_cautious;
//   эмоции «спокойно и ровно»                      → самую прямую ступень tone_cautious («можно резко») меняем на «прямо»,
//                                                     а «много юмора» tone_serious на «с юмором».

type Steps = { low: [string, string, string]; high: [string, string, string] }

const FORMAL: Steps = {
  low: ['очень разговорно, как с подругой на кухне', 'разговорно', 'скорее разговорно'],
  high: ['скорее сдержанно', 'сдержанно, без сленга', 'сдержанно-официально, без сленга и уменьшительных'],
}
const SERIOUS: Steps = {
  low: ['много юмора и самоиронии', 'с юмором', 'с легкой иронией'],
  high: ['скорее серьезно', 'серьезно, шутки редко', 'серьезно, без шуток'],
}
const CAUTIOUS: Steps = {
  low: ['очень прямо, называть вещи своими именами, можно резко', 'прямо', 'скорее прямо'],
  high: ['скорее бережно', 'бережно, мягкие формулировки', 'очень бережно, без резких слов'],
}

// 0..14, 15..28, 29..42 | 43..57 середина | 58..71, 72..85, 86..100
export function toneStep(v: unknown): -3 | -2 | -1 | 0 | 1 | 2 | 3 {
  const n = typeof v === 'number' ? v : Number(v)
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return 0
  if (n <= 14) return -3
  if (n <= 28) return -2
  if (n <= 42) return -1
  if (n <= 57) return 0
  if (n <= 71) return 1
  if (n <= 85) return 2
  return 3
}

function word(steps: Steps, s: number): string {
  if (s < 0) return steps.low[-s === 3 ? 0 : -s === 2 ? 1 : 2]
  if (s > 0) return steps.high[s - 1]
  return ''
}

export function toneText(profile: any): string {
  let f = toneStep(profile?.tone_formal)
  let s = toneStep(profile?.tone_serious)
  let c = toneStep(profile?.tone_cautious)
  const swearing = profile?.profanity === 'light' || profile?.profanity === 'free'
  const hot = profile?.intensity === 'hot'
  const calm = profile?.intensity === 'calm'
  if (f > 0 && (swearing || hot)) f = 0
  if (c > 0 && hot) c = 0
  if (c === -3 && calm) c = -2
  if (s === -3 && calm) s = -2 // «спокойно и ровно» и «много юмора» вместе дают странный текст
  return [word(FORMAL, f), word(SERIOUS, s), word(CAUTIOUS, c)].filter(Boolean).join('; ')
}

// ---------- для экрана голоса: те же ступени, что видит модель ----------
export type ToneAxis = 'tone_formal' | 'tone_serious' | 'tone_cautious'
const AXES: Record<ToneAxis, Steps> = { tone_formal: FORMAL, tone_serious: SERIOUS, tone_cautious: CAUTIOUS }
// Ползунок на экране голоса стоит на одной из 7 позиций; храним середину ступени, чтобы toneStep ее узнал
export const TONE_POSITIONS = [7, 21, 36, 50, 64, 79, 93]
export const tonePosition = (v: unknown) => toneStep(v) + 3

// Что уйдет в промпт по этой оси и не перебивает ли ее явный выбор «Мат» или «Эмоции» (то же правило, что в toneText)
export function toneAxisState(axis: ToneAxis, profile: any): { word: string; overriddenBy: 'profanity' | 'intensity' | null } {
  const v = toneStep(profile?.[axis])
  const swearing = profile?.profanity === 'light' || profile?.profanity === 'free'
  const hot = profile?.intensity === 'hot', calm = profile?.intensity === 'calm'
  let step: number = v
  let by: 'profanity' | 'intensity' | null = null
  if (axis === 'tone_formal' && v > 0 && (swearing || hot)) { step = 0; by = hot ? 'intensity' : 'profanity' }
  if (axis === 'tone_cautious' && v > 0 && hot) { step = 0; by = 'intensity' }
  if (axis === 'tone_cautious' && v === -3 && calm) { step = -2; by = 'intensity' }
  if (axis === 'tone_serious' && v === -3 && calm) { step = -2; by = 'intensity' }
  return { word: word(AXES[axis], step), overriddenBy: by }
}
