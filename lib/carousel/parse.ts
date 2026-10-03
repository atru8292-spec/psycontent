// Текст карусели из генерации: «Слайд N: текст» ... «Подпись: текст».
// Понимает и старые форматы: «[Слайд N]», «Слайд N.» и перенос текста на следующие строки.

export type ParsedCarousel = { slides: string[]; caption: string }

const SLIDE_RE = /^\s*\[?\s*слайд\s*(\d{1,2})\s*\]?\s*[:.)\-–]?\s*(.*)$/i
const CAPTION_RE = /^\s*\[?\s*подпись\s*\]?\s*[:.\-–]?\s*(.*)$/i

export function parseCarouselText(text: string): ParsedCarousel {
  const slides: string[] = []
  const captionLines: string[] = []
  let mode: 'none' | 'slide' | 'caption' = 'none'
  let cur: string[] = []
  const flush = () => { if (mode === 'slide') slides.push(cur.join('\n').trim()); cur = [] }
  for (const line of String(text || '').split('\n')) {
    const s = line.match(SLIDE_RE)
    const c = line.match(CAPTION_RE)
    if (s) { flush(); mode = 'slide'; cur = s[2] ? [s[2]] : []; continue }
    if (c) { flush(); mode = 'caption'; if (c[1]) captionLines.push(c[1]); continue }
    if (mode === 'slide') cur.push(line)
    else if (mode === 'caption') captionLines.push(line)
  }
  flush()
  return {
    slides: slides.map(s => s.replace(/\n{3,}/g, '\n\n').trim()).filter(Boolean),
    caption: captionLines.join('\n').trim(),
  }
}

// Обратно в текст: чтобы правка слайда на превью попадала и в сам материал
export function carouselToText(slides: string[], caption: string): string {
  const body = slides.map((s, i) => `Слайд ${i + 1}: ${s}`).join('\n')
  return caption ? `${body}\nПодпись: ${caption}` : body
}
