// Призыв на последнем слайде карусели: кодовое слово, подписка или канал, вопрос в комментарии, или тихий финал без призыва.
// Призыв не придумываем: берем из текста последнего слайда (по CLAUDE.md призыв нужен не в каждом посте).
export type CtaKind = 'code' | 'subscribe' | 'question' | 'none'
export type Cta = { kind: CtaKind; code: string | null; before: string; after: string }

export function ctaOf(text: string): Cta {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const m = t.match(/^(.*?(?:слово|напиши|пиши)[^«"]{0,40})[«"]([^»"]{2,24})[»"](.*)$/i)
  if (m) return { kind: 'code', code: m[2].trim(), before: m[1].trim().replace(/[,:]\s*$/, ''), after: m[3].trim().replace(/^[,.:;]\s*/, '') }
  if (/подпис|канал|телеграм|в шапке|запис/i.test(t)) return { kind: 'subscribe', code: null, before: t, after: '' }
  if (/\?/.test(t)) return { kind: 'question', code: null, before: t, after: '' }
  return { kind: 'none', code: null, before: t, after: '' }
}
