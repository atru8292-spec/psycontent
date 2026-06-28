export function buildProfileContext(profile: any): string {
  const arr = (val: any) => {
    if (!val) return ''
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }

  const formal = profile.tone_formal ?? 50
  const serious = profile.tone_serious ?? 50
  const cautious = profile.tone_cautious ?? 50

  const toneWords: string[] = []
  if (formal < 30) toneWords.push('неформальный, дружеский')
  else if (formal > 70) toneWords.push('формальный, сдержанный')
  else toneWords.push('средний между формальным и дружеским')

  if (serious < 30) toneWords.push('лёгкий с юмором')
  else if (serious > 70) toneWords.push('серьёзный и глубокий')

  if (cautious > 70) toneWords.push('осторожный и бережный')
  else if (cautious < 30) toneWords.push('прямой и провокационный')

  return `
ПРОФИЛЬ ПСИХОЛОГА:
- Имя (автор постов, НЕ обращение к читателю): ${profile.full_name || 'Психолог'}
- Опыт: ${profile.experience || 'не указан'}
- Путь в профессию: ${profile.path_to_profession || ''}
- Подходы: ${arr(profile.approaches) || 'интегративный'}
- Ниши: ${arr(profile.niches) || 'широкая практика'}
- Главная специализация: ${profile.one_niche || ''}
- Форматы работы: ${arr(profile.formats) || 'консультации'}
- Цена: ${profile.price || ''}

ТОН ГОЛОСА:
- Формальность: ${formal}%, серьёзность: ${serious}%, осторожность: ${cautious}%
- Описание: ${toneWords.join(', ')}
- Как говорит своими словами: ${profile.tone_verbal || ''}
- Голос бренда (описание себя): ${profile.live_voice || ''}

ЦЕННОСТИ И ПОЗИЦИЯ:
- Ценности: ${arr(profile.values) || ''}
${profile.values_custom ? `- Дополнительно: ${profile.values_custom}` : ''}
- Антиценности (что бесит): ${arr(profile.anti_values) || ''}
${profile.anti_values_custom ? `- Подробнее: ${profile.anti_values_custom}` : ''}
- Суперсилы: ${arr(profile.superpowers) || ''}

АВАТАР КЛИЕНТА:
- Кто: ${profile.client_avatar || ''}
- Чем занимается: ${profile.client_job || ''}
- Фразы боли клиента: ${profile.client_pain_phrases || ''}
- Что уже пробовал: ${arr(profile.client_tried) || ''}
- Чего боится: ${arr(profile.client_fear) || ''}
- Результат мечты: ${profile.client_result || ''}

КОНТЕКСТ:
- Площадки: ${arr(profile.platforms) || 'Instagram'}
- Подписчики: ${profile.current_followers || ''}
- Сложности с контентом: ${arr(profile.content_struggles) || ''}
- Боль с контентом: ${profile.content_pain || ''}
- Цель на 3 месяца: ${profile.goal_3_months || ''}
- Блог мечты: ${profile.dream_blog || ''}
- Кумиры: ${profile.idols || ''}
`.trim()
}
