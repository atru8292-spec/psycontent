// Вид каталога zh6 у каждого формата набора на «Сделать» (zh6.vidy в теле /api/generate-post/group).
// Код принимается, только если тип каталога совпадает с форматом (вид карусели к рилсу не прилипнет).
// Старое поле formatKod с forFormat (один вид на запуск) тоже понимаем.
import { formatByCode } from './formaty'
import { gruppaById, tipOf } from './gruppy'

const TIP: Record<string, string> = { reels: 'reels', carousel: 'carousel', post: 'post', post_tg: 'post', stories: 'stories' }

export function vidyFrom(src: any, formats: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!src || typeof src !== 'object') return out
  const ok = (f: string, kod: unknown): string | undefined => {
    if (typeof kod !== 'string' || !TIP[f]) return undefined
    const f6 = formatByCode(kod.trim().slice(0, 60))
    return f6 && f6.for[0] === TIP[f] ? f6.code : undefined
  }
  const raw = src.vidy && typeof src.vidy === 'object' && !Array.isArray(src.vidy) ? src.vidy : {}
  for (const f of formats) { const k = ok(f, raw[f]); if (k) out[f] = k }
  const legacyFor = typeof src.forFormat === 'string' && formats.includes(src.forFormat) ? src.forFormat : formats.length === 1 ? formats[0] : null
  if (legacyFor && !out[legacyFor]) { const k = ok(legacyFor, src.formatKod); if (k) out[legacyFor] = k }
  return out
}

// Карточка без подвида (zh6.grupy = { reels: 'scenka' }): виды этой карточки, генератор выберет из них под тему.
// Неизвестная карточка или формат без карточек: ничего (подберу сама). Если у формата есть и вид, вид главнее.
export function grupyFrom(src: any, formats: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const raw = src && typeof src === 'object' && src.grupy && typeof src.grupy === 'object' && !Array.isArray(src.grupy) ? src.grupy : {}
  for (const f of formats) {
    const tip = tipOf(f)
    const g = tip && typeof raw[f] === 'string' ? gruppaById(tip, raw[f]) : undefined
    if (g) out[f] = [...g.codes]
  }
  return out
}
