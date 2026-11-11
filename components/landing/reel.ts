// Разбор рилса генератора для карточек лендинга (сравнение и примеры): надпись на экране, реплики или речь, подпись.
// Метки как у генератора zh6 («Текст на экране:», «Речь:», «Подпись:»); текст не меняется, только раскладывается по частям.
// Сам components/ReelsScript.tsx сюда не тянем: он тащит аналитику и каталог видов кабинета.

export type ReelLine = { role: string | null; note: string | null; text: string }
export type Reel = { screen: string[]; lines: ReelLine[]; speech: string; caption: string }

const LABEL = /^(Текст на экране|Речь|Подпись)\s*:\s*/u
// Роль в начале строки: имя до трех слов с заглавной, можно уточнение через запятую («Я, обычная реакция:»)
const ROLE = /^([А-ЯЁ][а-яё-]*(?:\s+[а-яё-]+){0,2})(?:,\s*([^:]{1,60}))?:\s+(\S.*)$/u

export function parseReel(text: string): Reel {
  const r: Reel = { screen: [], lines: [], speech: '', caption: '' }
  let block: 'screen' | 'speech' | 'caption' | null = null
  const speech: string[] = []
  const caption: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const m = line.match(LABEL)
    if (m) {
      block = m[1] === 'Текст на экране' ? 'screen' : m[1] === 'Речь' ? 'speech' : 'caption'
      const rest = line.slice(m[0].length)
      if (!rest) continue
      if (block === 'screen') r.screen.push(rest)
      else if (block === 'speech') speech.push(rest)
      else caption.push(rest)
      continue
    }
    if (!line) continue
    if (block === 'screen') r.screen.push(line)
    else if (block === 'caption') caption.push(line)
    else if (block === 'speech') {
      const role = line.match(ROLE)
      if (role) r.lines.push({ role: role[1], note: role[2] ? role[2].trim() : null, text: role[3] })
      else speech.push(line)
    }
  }
  r.speech = speech.join(' ')
  r.caption = caption.join('\n')
  return r
}
