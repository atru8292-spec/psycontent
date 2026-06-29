// Профиль считаем «неполным» (прошел только экспресс), если пусты глубокие поля
// голоса, которые экспресс не заполняет, а полный онбординг и edit-profile да.
// По ним показываем приглашение «настроить голос точнее» (дополнить профиль).
// Экспресс заполняет: full_name, approaches, niches/one_niche, tone_verbal,
// client_pain_phrases. Все остальное (ценности, живой голос, суперсилы, тон-оси,
// аватар клиента, цели) остается пустым.

function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

// true, если стоит предложить углубить голос (пусты и живой голос, и ценности).
export function isVoiceIncomplete(profile: any): boolean {
  if (!profile) return false
  return isEmpty(profile.live_voice) && isEmpty(profile.values)
}
