// Профиль считаем «без пройденного теста-архетипа», если психолог еще не прошел
// тест на авторский архетип. По этому сигналу зовем пройти тест (полоса после
// первого поста, карточка на главной). Приглашение гаснет, как только тест пройден.
// Экспресс тест не проходит, значит после экспресса сигнал true, пока не пройдут тест.
// Раньше сигнал смотрел на пустые live_voice/values (deepen старой анкеты), теперь
// стиль несет архетип (этап 5.5), поэтому мерило полноты голоса, это пройденный тест.

function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

// true, если стоит предложить пройти тест-архетип (архетип еще не определен).
export function isArchetypeIncomplete(profile: any): boolean {
  if (!profile) return false
  const primary = profile.archetype_scores?.selection?.primary || profile.archetype_primary
  return isEmpty(primary)
}
