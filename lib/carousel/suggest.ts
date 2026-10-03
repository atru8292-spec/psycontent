// Три стиля под тон текста карусели (задача karuseli-dvizhok, раздел 3): первым экраном не сетка из 14,
// а три подходящих, отрисованных на настоящей обложке. Без модели: по устройству текста и тону из профиля.

import { parseCarouselText } from './parse'
import { isDialogText } from './dialog'
import type { TemplateStyle } from './styles'

export type ToneHints = { intensity?: string | null; profanity?: string | null }

export function suggestStyles(text: string, tone: ToneHints = {}): TemplateStyle[] {
  const { slides } = parseCarouselText(text)
  const body = slides.slice(1)
  const all = slides.join('\n')
  const out: TemplateStyle[] = []
  const add = (...xs: TemplateStyle[]) => { for (const x of xs) if (!out.includes(x)) out.push(x) }

  const dialog = body.some(isDialogText)
  const lists = body.filter(s => (s.match(/^\s*(\d+[.)]|[-•])\s+/gm) || []).length >= 2).length
  const pairs = body.filter(s => /^\s*[«"]/.test(s) && /\n\s*\n/.test(s)).length
  const quoteCover = /^\s*[«"„]/.test(slides[0] || '')
  const hot = tone.intensity === 'hot' || tone.profanity === 'free' || (all.match(/!/g) || []).length >= 4
  const calm = tone.intensity === 'calm'
  const longText = body.some(s => s.length > 300)

  // устройство текста важнее тона: разговор просится в переписку, фразы с переводом в словарь, пункты в заметки
  if (dialog) add('t_perepiska', 't_stikery')
  if (pairs >= 2) add('t_slovar', 't_citata')
  if (quoteCover) add('t_citata')
  if (lists >= 1) add('t_zametki')
  // тон: громко и прямо, или тихо и бережно, или по-свойски тепло
  if (hot) add('t_plakat', 't_mono', 't_redakciya')
  else if (calm) add('t_vozduh', 't_tetrad', 't_citata')
  // длинный разбор лучше держит строгий журнал, чем рукописный шрифт
  if (longText) add('t_redakciya', 't_zametki')
  add('t_redakciya', 't_stikery', 't_zametki', 't_tetrad')
  return out.slice(0, 3)
}
