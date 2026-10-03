// Геометрия текста каждого стиля: где стоит текстовая колонка, какими шрифтами и в каких пределах кегля.
// Единый источник: по этим числам слайд рисуется (slides.tsx) и проверяется (audit.ts), поэтому они не расходятся.
// Холст 1080×1440 (3:4, решение 03.10: Instagram принимает 3:4 целиком, в ленте слайд выше, сетка профиля сама 3:4).

import { parseDialog, dialogToText, type Reply, type Who } from './dialog'
import type { SlideLayout } from './layout'
import { ctaOf } from './cta'
import { pairOf } from './pairs'
import type { TemplateStyle } from './styles'
import { fitBlock, isWidow, layoutBlock, longestUnitAt1, paraGapPx, xHeight, type Block, type BlockStyle } from './fit'

export const W = 1080
export const H = 1440

export type Rect = { x: number; y: number; w: number; h: number; what: string }
// marker: список с колонкой номеров и висячим отступом (перенос пункта уходит под текст, а не под номер)
export type Marker = { fmt: (i: number) => string; family: string; weight?: number; col: number; big?: boolean }
// maxLines: предел строк крупного текста (капс до 4, длинная фраза строчными до 5)
export type TextStyle = BlockStyle & { max: number; min: number; accentBold?: boolean; pitch?: (size: number) => number; marker?: Marker; accentKind?: AccentKind; maxLines?: number }
export type Spec = {
  box: Rect                 // колонка текста
  big: TextStyle
  small: TextStyle
  gap: number               // между крупным и мелким
  extra: number             // высота прочего внутри колонки (кавычка, линии, номер)
  smallWidth?: number       // ширина мелкого, если уже колонки (список с маркерами, пузырь)
  bigWidth?: number
  smallBox?: Rect           // мелкий текст в своем блоке (скрапбук с фото)
  align: 'left' | 'center'
  fixed: Rect[]             // прочие элементы слайда: номер, ник, стрелка, счетчик
  list?: boolean            // мелкий текст списком: каждый пункт отдельно, с маркером
  smallText?: (t: string) => string // как мелкий текст подается в верстку (первое предложение отдельно, пункты без номеров)
}
export const firstSentenceApart = (t: string) => {
  const m = t.match(/^([\s\S]*?[.!?…])(\s+[\s\S]*)?$/)
  return m && m[2] ? `${m[1]}\n${m[2].trim()}` : t
}
export const listItems = (t: string) => t.split(/\n+/).map(l => l.trim().replace(/^\s*(\d+[.)]|[-•])\s*/, '')).filter(Boolean).join('\n')
export const smallOf = (sp: Spec, s: SlideLayout) => (sp.smallText ? sp.smallText(s.small) : s.small)

// Нижние границы по задаче: основной текст от 34 px при ширине 1080 (на телефоне около 13 px), рукописные от 40-44
const ONEST = (w = 400): BlockStyle => ({ family: 'Onest', weight: w, lh: 1.35, paraGap: 0.5 })
const t = (b: BlockStyle, max: number, min: number, extra: Partial<TextStyle> = {}): TextStyle => ({ ...b, max, min, ...extra })

// Настройки оформления поверх стиля (carousel_designs.options): вид акцента, крупные номера списка, рубрика, фото на обложке
export type AccentKind = 'color' | 'marker' | 'underline'
// theme: светлая или темная тема (сейчас только у Заметок)
export type DesignOptions = { accentKind?: AccentKind; bigNumbers?: boolean; rubric?: string; coverPhoto?: boolean; theme?: 'light' | 'dark' }
export type SpecCtx = { variant: number; long: boolean; hasPhotos: boolean; hasAvatar?: boolean; fontPair?: number; opts?: DesignOptions }

// Стоп-слайд и финал: своя раскладка поверх геометрии стиля (раздел 2 задачи).
// Стоп: одна короткая фраза крупно на акцентном фоне, без номера и мелкого текста.
// Финал: текст призыва сверху, внизу блок «кто я» (фото или инициалы, имя, строка о себе, ник), без стрелки.
export const AUTHOR_BLOCK_H = 520
const wordCount = (t: string) => String(t || '').trim().split(/\s+/).filter(Boolean).length
export function specFor(style: TemplateStyle, s: SlideLayout, total: number, c: SpecCtx): Spec {
  let sp = withPair(style, specRole(style, s, total, c), c.fontPair)
  // фото на весь слайд, текст на плашках-полосках поверх: обложка и стоп, если фото загружено и включено
  if (c.opts?.coverPhoto && c.hasPhotos && (s.n === 1 || s.role === 'stop')) {
    sp = { ...sp, box: { x: 80, y: H - 200 - 760, w: W - 160 - 40, h: 760, what: 'текст' }, bigWidth: undefined, smallWidth: undefined, smallBox: undefined,
      big: { ...sp.big, max: 96, min: 52, lh: Math.max(sp.big.lh, 1.25) }, small: { ...sp.small, max: 44, min: 36 }, gap: 24, extra: 0, align: 'left',
      fixed: [{ x: 80, y: H - 110 - 34, w: 520, h: 34, what: 'ник' }] }
  }
  // Обложка с очень длинным словом («Гиперответственность»): слово целиком держит заголовок мелким при пустом слайде.
  // Тогда на обложке разрешаем перенос с дефисом (одно деление на слово, fit.ts bestTwo), и кегль считается по части слова
  if (s.n === 1 && s.big && /[\p{L}]{13,}/u.test(s.big)) {
    const capWhole = widthOf(sp, 'big', !!s.accent) / Math.max(1e-6, longestUnitAt1(s.big, sp.big))
    // обложка может быть крупнее предела стиля (fitCover), поэтому перенос по приставке, как только слово не дает дойти до предела
    if (capWhole < sp.big.max) sp = { ...sp, big: { ...sp.big, hyphen: true } }
  }
  // Крупный текст по длине: до 6 слов можно капсом и крупно, но не больше 4 строк; от 7 слов строчными,
  // кеглем меньше (60% предела) и не больше 5 строк. Иначе длинная фраза встает плакатом-стеной (Арина 03.10)
  sp = { ...sp, big: s.n === 1 ? coverPolicy(sp.big, s.big) : phrasePolicy(sp.big, s.big, sp.small.max) }
  if (s.n === 1 && s.big && sp.big.upper && s.role === 'cover') {
    const lower = { ...sp, big: { ...sp.big, upper: false, maxLines: 5 } }
    // строчными, если кегль выходит хотя бы на 15% больше капса (Арина 03.10)
    if (fitCover(lower, s).bs >= fitCover(sp, s).bs * 1.15) sp = lower
  }
  const rub = c.opts?.rubric && s.role !== 'final' && style !== 't_perepiska' && style !== 't_zametki' ? rubricRect(style) : null
  if (rub) sp = { ...sp, fixed: [...sp.fixed, rub] }
  const kind = c.opts?.accentKind
  return kind && kind !== 'color' ? { ...sp, big: { ...sp.big, accentKind: kind }, small: { ...sp.small, accentKind: kind } } : sp
}

// Шрифтовая пара поверх стиля: другие семейства у крупного и мелкого текста, рукописным выше нижний предел кегля
function withPair(style: TemplateStyle, sp: Spec, pair?: number): Spec {
  if (!pair) return sp
  const p = pairOf(style, pair)
  const big = { ...sp.big, family: p.big.family, weight: p.big.weight, upper: !!p.big.upper }
  const small = { ...sp.small, family: p.small.family, weight: p.small.weight }
  if (p.hand) { big.min = Math.max(big.min, 56); small.min = Math.max(small.min, 44) }
  return { ...sp, big, small }
}

function specRole(style: TemplateStyle, s: SlideLayout, total: number, c: SpecCtx): Spec {
  if (s.role === 'stop') {
    const cov = baseSpec(style, { ...s, n: 1 }, total, c)
    return { ...cov, box: { x: 110, y: 260, w: W - 220, h: H - 520, what: 'текст' }, bigWidth: undefined, smallWidth: undefined, smallBox: undefined,
      big: { ...cov.big, max: Math.round(cov.big.max * 1.2) }, gap: 0, extra: 0, align: 'left', fixed: [{ x: 110, y: H - 150 - 30, w: 400, h: 30, what: 'ник' }] }
  }
  if (s.role === 'final' && s.n === total && total > 1) {
    // сверху «кто я» (круг 240, имя, строка о себе, ник, разделитель), ниже призыв
    const b = baseSpec(style, s, total, c)
    const cta = ctaOf(`${s.big} ${s.small}`)
    const top = 170 + AUTHOR_BLOCK_H + 60
    const big = cta.kind === 'question' ? { ...b.big, max: 88, min: 52 } : cta.kind === 'code' ? { ...b.small, max: 46, min: 36 } : { ...b.big, max: 72, min: 48 }
    return { ...b, box: { x: 110, y: top, w: W - 220, h: H - top - 150, what: 'призыв' }, bigWidth: undefined, smallWidth: undefined, smallBox: undefined,
      big, gap: 0, extra: cta.kind === 'code' ? 200 + 40 : cta.kind === 'question' || cta.kind === 'subscribe' ? 80 : 0, align: 'left',
      fixed: [{ x: 110, y: 170, w: W - 220, h: AUTHOR_BLOCK_H, what: 'кто я' }] }
  }
  const b = baseSpec(style, s, total, c)
  // короткая фраза одной крупной строкой (без мелкого текста): кегль до предела обложки, чтобы не терялась на пустом слайде
  // одно-четыре слова («Хватит.») еще крупнее: на пустом слайде фраза должна держать весь слайд, предел ставит ширина колонки
  if (s.n !== 1 && s.big && !s.small && s.role === 'text') {
    const cov = baseSpec(style, { ...s, n: 1 }, total, c)
    // у рукописных шрифтов строчная «о» ниже (Caveat 0.36 кегля против 0.54 у Onest): предел выше на эту разницу,
    // чтобы короткая фраза выглядела так же крупно, как в других стилях; ширину все равно держит колонка
    const hand = Math.max(1, 0.54 / Math.max(0.2, xHeight(b.big, 1)))
    const k = (wordCount(s.big) <= 2 ? 1.6 : wordCount(s.big) <= 4 ? 1.3 : 1.1) * hand
    return { ...b, big: { ...b.big, max: Math.max(b.big.max, Math.round(cov.big.max * k)) } }
  }
  // список: номера стиля в колонке, пункты без своих номеров, ширина текста без колонки
  if (s.role === 'list' && style !== 't_zametki' && style !== 't_perepiska' && !b.smallBox) {
    const m = LIST_MARKERS[style]
    // крупный номер на всю высоту пункта: до 5 пунктов (длинные пункты проверяет фит: не влезет, кегль меньше)
    const items = listItems(s.small).split('\n').filter(Boolean).length
    if (m && c.opts?.bigNumbers && items <= 5) {
      const big = { ...m, big: true, col: 150 }
      return { ...b, smallText: listItems, smallWidth: (b.smallWidth ?? b.box.w) - big.col, small: { ...b.small, paraGap: 0.7, marker: big } }
    }
    if (m) return { ...b, smallText: listItems, smallWidth: (b.smallWidth ?? b.box.w) - m.col, small: { ...b.small, paraGap: 0.6, marker: m } }
  }
  return b
}

// Где стоит метка рубрики: сверху, там, где у стиля свободно (у плаката слева ник, у премиума стрелка и точки)
export function rubricRect(style: TemplateStyle): Rect {
  if (style === 't_plakat') return { x: W - 80 - 420, y: 44, w: 420, h: 40, what: 'рубрика' }
  if (style === 't_premium' || style === 't_zametki') return { x: (W - 420) / 2, y: 40, w: 420, h: 40, what: 'рубрика' }
  if (style === 't_vozduh') return { x: 90, y: 84, w: 420, h: 40, what: 'рубрика' }
  return { x: 80, y: 44, w: 420, h: 40, what: 'рубрика' }
}

const two = (i: number) => String(i + 1).padStart(2, '0')
const LIST_MARKERS: Partial<Record<TemplateStyle, Marker>> = {
  t_redakciya: { fmt: two, family: 'Oswald', weight: 700, col: 96 },
  t_plakat: { fmt: i => String(i + 1), family: 'Unbounded', weight: 700, col: 84 },
  t_tetrad: { fmt: i => `${i + 1}.`, family: 'Caveat', weight: 700, col: 70 },
  t_stikery: { fmt: i => `${i + 1})`, family: 'Caveat', weight: 700, col: 70 },
  t_citata: { fmt: i => String(i + 1), family: 'Cormorant Garamond', weight: 600, col: 64 },
  t_slovar: { fmt: i => `${i + 1}.`, family: 'Manrope', weight: 600, col: 70 },
  t_premium: { fmt: two, family: 'Cormorant Garamond', weight: 600, col: 84 },
  t_mono: { fmt: i => `[${two(i)}]`, family: 'PT Mono', weight: 400, col: 130 },
  t_doska: { fmt: i => String(i + 1), family: 'Neucha', weight: 400, col: 64 },
  t_vozduh: { fmt: i => String(i + 1), family: 'Manrope', weight: 400, col: 56 },
  t_zapiska: { fmt: i => `${i + 1}.`, family: 'Montserrat', weight: 700, col: 70 },
  t_skrapbuk: { fmt: i => `${i + 1}::`, family: 'PT Mono', weight: 400, col: 96 },
}

function baseSpec(style: TemplateStyle, s: SlideLayout, total: number, c: SpecCtx): Spec {
  const cover = s.n === 1
  const last = s.n === total && total > 1
  const v = c.variant || 0
  switch (style) {
    case 't_redakciya': {
      // 1: большой номер справа сверху, текст под ним; 0 и 2: номер слева сверху
      const y = cover ? 180 : v === 1 ? 440 : 330
      const fixed: Rect[] = [{ x: 80, y: H - 84 - 34, w: 520, h: 34, what: 'ник' }]
      if (!last) fixed.push({ x: W - 70 - 90, y: H - 76 - 36, w: 90, h: 36, what: 'стрелка' })
      if (!cover) fixed.push(v === 1 ? { x: W - 70 - 300, y: 190, w: 300, h: 220, what: 'номер' } : { x: 80, y: 180, w: 180, h: 86, what: 'номер' })
      const centered = v === 2 && !c.long
      return {
        box: { x: 80, y, w: 920, h: H - 200 - y, what: 'текст' },
        big: t({ family: 'Oswald', weight: 700, upper: true, lh: 1.08, paraGap: 0.2, balance: true }, cover ? 150 : 104, cover ? 76 : 60),
        small: t({ ...ONEST(), lh: 1.32 }, 60, 38),
        gap: 44, extra: cover ? 48 : 0, align: centered ? 'center' : 'left', fixed,
      }
    }
    case 't_perepiska': {
      // пузыри: ширина текста 820 минус поля 40+40; у каждого пузыря поля 30 сверху и снизу
      const both = !!(s.big && s.small)
      const bubbles = cover ? 2 : (s.big ? 1 : 0) + (s.small ? 1 : 0)
      return {
        box: { x: 60, y: 220, w: 960, h: H - 220 - 200, what: 'текст' },
        bigWidth: 740, smallWidth: 740,
        big: t({ ...ONEST(700), lh: 1.3 }, cover ? 84 : 66, cover ? 52 : 40),
        small: t({ ...ONEST(), lh: 1.3 }, 58, 38, { accentBold: true }),
        gap: both || cover ? 34 : 0, extra: bubbles * 60 + (cover ? 18 : 0), align: 'left',
        fixed: [{ x: 60, y: 70, w: 960, h: 110, what: 'шапка чата' }, { x: 60, y: H - 80 - 74, w: 960, h: 74, what: 'строка ввода' }],
      }
    }
    case 't_tetrad': {
      const ROW = 76
      // шаг строк растет с кеглем (не меньше линейки): крупная обложка с фиксированным шагом налезала строкой на строку
      return {
        box: { x: 170, y: ROW * 3 - 12, w: 830, h: H - ROW * 4 - (ROW * 3 - 12), what: 'текст' },
        big: t({ family: 'Caveat', weight: 700, lh: 1, paraGap: 0, balance: true }, cover ? 124 : 104, 56, { pitch: sz => (sz > 80 ? Math.max(Math.round((ROW * 4) / 3), Math.round(sz * 1.08)) : ROW) }),
        small: t({ family: 'Caveat', weight: 400, lh: 1, paraGap: 0.5 }, 68, 44, { pitch: sz => Math.max(ROW, Math.round(sz * 1.15)) }),
        gap: ROW / 2, extra: 0, align: 'left',
        fixed: [{ x: 170, y: H - ROW - 14 - 44, w: 420, h: 44, what: 'ник' }, { x: W - 80 - 120, y: H - ROW - 14 - 48, w: 120, h: 48, what: 'счетчик' }],
      }
    }
    case 't_plakat': {
      const fixed: Rect[] = [{ x: 70, y: 90, w: 420, h: 34, what: 'ник' }]
      if (!last) fixed.push({ x: 70, y: H - 86 - 44, w: 110, h: 44, what: 'стрелка' })
      return {
        box: { x: 70, y: 180, w: 940, h: H - 200 - 180, what: 'текст' },
        big: t({ family: 'Unbounded', weight: 700, upper: true, lh: 1.08, paraGap: 0.15, balance: true }, cover ? 130 : 96, cover ? 64 : 52),
        small: t({ ...ONEST(), lh: 1.3 }, 60, 38, { accentBold: true }),
        gap: 50, extra: 0, align: 'left', fixed,
      }
    }
    case 't_mono':
      return {
        box: { x: 80, y: 230, w: 920, h: H - 210 - 230, what: 'текст' },
        big: t({ family: 'Montserrat', weight: 700, upper: true, lh: 1.1, paraGap: 0.15, balance: true }, cover ? 96 : 72, 46),
        small: t({ family: 'PT Mono', weight: 400, lh: 1.45, paraGap: 0.5 }, 50, 38),
        gap: 46, extra: 0, align: 'left',
        fixed: [{ x: 80, y: 110, w: 920, h: 80, what: 'шапка' }, { x: 80, y: H - 100 - 60, w: 920, h: 60, what: 'подвал' }],
      }
    case 't_premium': {
      const photoCover = cover && c.hasPhotos
      return {
        box: photoCover ? { x: 80, y: 560, w: 920, h: H - 200 - 560, what: 'текст' } : { x: 90, y: 180, w: 900, h: H - 180 - 180, what: 'текст' },
        big: t({ family: 'Cormorant Garamond', weight: 600, upper: true, lh: 1.05, paraGap: 0.15, balance: true }, cover ? 104 : 90, 54),
        small: t({ family: 'Manrope', weight: 600, lh: 1.4, paraGap: 0.4 }, 52, 38),
        gap: photoCover ? 28 : 44, extra: 0, align: 'left', smallText: photoCover ? undefined : firstSentenceApart,
        fixed: [{ x: 80, y: 88, w: 920, h: 40, what: 'стрелка и точки' }, { x: 80, y: H - 90 - 30, w: 920, h: 30, what: 'подвал' }],
      }
    }
    case 't_skrapbuk': {
      const has = c.hasPhotos
      if (cover) {
        // карточка обложки не уже 75% слайда (Арина 03.10)
        const pad = has ? 48 : 64, cw = has ? 820 : 880
        return {
          box: { x: (W - cw) / 2 + pad, y: 200, w: cw - pad * 2, h: H - 400 - (has ? 88 : 140), what: 'текст' },
          big: t({ family: 'Unbounded', weight: 700, upper: true, lh: 1.15, paraGap: 0.15, balance: true }, has ? 56 : 76, 40),
          small: t({ family: 'PT Mono', weight: 400, lh: 1.45, paraGap: 0.4 }, has ? 38 : 46, 34),
          gap: 24, extra: 0, align: 'left', fixed: [{ x: 60, y: H - 70 - 26, w: 400, h: 26, what: 'ник' }],
        }
      }
      const mirror = s.n % 2 === 1
      if (!has) {
        return {
          box: { x: 90, y: 180, w: 900, h: H - 200 - 180, what: 'текст' },
          big: t({ family: 'Unbounded', weight: 700, upper: true, lh: 1.15, paraGap: 0.15, balance: true }, 64, 40),
          small: t({ family: 'PT Mono', weight: 400, lh: 1.45, paraGap: 0.5 }, 48, 38),
          gap: 48, extra: s.big ? 64 : 0, align: 'left', fixed: [{ x: 90, y: H - 70 - 24, w: 400, h: 24, what: 'ник' }],
        }
      }
      // с фото: крупное сверху рядом с рамкой, мелкое ниже на всю ширину
      const bigX = mirror ? 380 : 90
      return {
        box: { x: bigX, y: 180, w: 610, h: 300, what: 'заголовок' },
        // без заголовка текст начинается сверху рядом с рамкой фото, поэтому колонка сдвинута от нее
        smallBox: s.big ? { x: 90, y: 500, w: 900, h: H - 360 - 500, what: 'текст' } : { x: mirror ? 380 : 90, y: 180, w: 610, h: H - 360 - 180, what: 'текст' },
        big: t({ family: 'Unbounded', weight: 700, upper: true, lh: 1.15, paraGap: 0.15, balance: true }, 56, 36),
        small: t({ family: 'PT Mono', weight: 400, lh: 1.45, paraGap: 0.5 }, 46, 38),
        gap: 0, extra: 64, align: 'left',
        fixed: [
          mirror ? { x: 60, y: 120, w: 256, h: 316, what: 'фото' } : { x: W - 60 - 256, y: 120, w: 256, h: 316, what: 'фото' },
          mirror ? { x: W - 70 - 176, y: H - 130 - 216, w: 176, h: 216, what: 'фото' } : { x: 70, y: H - 130 - 216, w: 176, h: 216, what: 'фото' },
        ],
      }
    }
    case 't_zapiska':
      return {
        box: { x: 90, y: 180, w: 900, h: H - 300 - 180, what: 'текст' },
        big: t({ family: 'Montserrat', weight: 700, lh: 1.2, paraGap: 0.15, balance: true }, cover ? 96 : 72, 48),
        small: t({ family: 'Montserrat', weight: 400, lh: 1.4, paraGap: 0.5 }, 52, 38, { accentBold: true }),
        gap: 40, extra: 0, align: c.long ? 'left' : 'center',
        fixed: [{ x: 90, y: H - 110 - 96, w: 600, h: 96, what: 'автор' }],
      }
    case 't_zametki': {
      // экран Заметок iPhone: статус-бар, шапка «‹ Все iCloud», внизу панель из четырех иконок (ZM в slides.tsx).
      // Интерфейс не больше 18% высоты; на обложке и финале под шапкой дата по центру
      const isList = s.role === 'list'
      const y = cover ? ZM.textTop + ZM.dateH : ZM.textTop
      return {
        box: { x: ZM.side, y, w: W - ZM.side * 2, h: H - ZM.bottom - 20 - y, what: 'текст' },
        smallWidth: isList ? W - ZM.side * 2 - ZM.check : undefined,
        big: t({ ...ONEST(700), lh: 1.18, paraGap: 0.15, balance: true }, cover ? 120 : 84, 50),
        small: t({ ...ONEST(), lh: 1.42, paraGap: 0.5 }, 60, 38),
        gap: 40, extra: 0, align: 'left', list: isList, smallText: isList ? listItems : undefined,
        fixed: zametkiChrome(cover),
      }
    }
    case 't_stikery':
      // стикер 860 шириной, поля 80 по бокам, 110 сверху и 90 снизу; рукописный шрифт мелко не читается
      return {
        box: { x: 110 + 80, y: 150 + 110, w: 860 - 160, h: H - 300 - 200, what: 'текст' },
        big: t({ family: 'Caveat', weight: 700, lh: 1.05, paraGap: 0.1, balance: true }, cover ? 124 : 104, 60),
        small: t({ family: 'Caveat', weight: 400, lh: 1.2, paraGap: 0.4 }, 72, 46, { accentBold: true }),
        gap: 40, extra: 0, align: 'left',
        fixed: [{ x: 80, y: H - 90 - 50, w: 360, h: 50, what: 'ник' }, { x: W - 80 - 120, y: H - 90 - 50, w: 120, h: 50, what: 'счетчик' }],
      }
    case 't_citata': {
      const center = v === 1 && !c.long
      return {
        box: { x: 90, y: 170, w: 900, h: H - 220 - 170, what: 'текст' },
        big: t({ family: 'Cormorant Garamond', weight: 600, lh: 1.1, paraGap: 0.15, balance: true }, cover ? 108 : 86, 54),
        small: t({ family: 'Manrope', weight: 400, lh: 1.4, paraGap: 0.5 }, 52, 38, { accentBold: true }),
        gap: 40 + 3 + 40, extra: v !== 2 ? 160 + 40 : 0, align: center ? 'center' : 'left',
        fixed: [{ x: 90, y: H - 100 - 30, w: 900, h: 30, what: 'подвал' }],
      }
    }
    case 't_slovar': {
      const bar = v !== 2 ? 50 : 0
      return {
        box: { x: 90 + bar, y: 220, w: 900 - bar, h: H - 200 - 220, what: 'текст' },
        big: t({ family: 'Cormorant Garamond', weight: 600, lh: 1.05, paraGap: 0.12, balance: true }, cover ? 116 : 94, 56),
        small: t({ family: 'Manrope', weight: 400, lh: 1.4, paraGap: 0.5 }, 52, 38, { accentBold: true }),
        gap: s.big && s.small ? 36 + 2 + 36 : 36, extra: 0, align: 'left',
        fixed: [{ x: 90, y: 110, w: 900, h: 46, what: 'колонтитул' }],
      }
    }
    case 't_doska':
      return {
        box: { x: 110, y: 190, w: 860, h: H - 230 - 190, what: 'текст' },
        big: t({ family: 'Neucha', weight: 400, lh: 1.1, paraGap: 0.1, balance: true }, cover ? 116 : 96, 56),
        small: t({ family: 'Neucha', weight: 400, lh: 1.3, paraGap: 0.45 }, 64, 42),
        gap: 44, extra: s.big ? 34 : 0, align: 'left',
        fixed: [{ x: 110, y: H - 100 - 42, w: 400, h: 42, what: 'ник' }, { x: W - 110 - 120, y: H - 100 - 44, w: 120, h: 44, what: 'счетчик' }],
      }
    case 't_vozduh': {
      const align = v === 1 || c.long ? 'left' : 'center'
      return {
        box: { x: 150, y: 220, w: 780, h: H - 240 - 220, what: 'текст' },
        big: t({ family: 'Cormorant Garamond', weight: 600, lh: 1.15, paraGap: 0.12, balance: true }, cover ? 96 : 76, 50),
        small: t({ family: 'Manrope', weight: 400, lh: 1.5, paraGap: 0.5 }, 50, 38),
        gap: 44 + 2 + 44, extra: 0, align,
        fixed: [{ x: 240, y: H - 110 - 30, w: W - 480, h: 30, what: 'подвал' }],
      }
    }
  }
}

// ---------- подбор кеглей ----------
export type SlideFit = { big: Block; small: Block; overflow: boolean; longWord: boolean; tooLong: boolean; heightUsed: number; spec: Spec }

const widthOf = (sp: Spec, which: 'big' | 'small', accent: boolean) => {
  const base = which === 'big' ? (sp.bigWidth ?? sp.box.w) : (sp.smallBox?.w ?? sp.smallWidth ?? sp.box.w)
  // слово акцента жирнее обычного: оставляем запас 3% ширины
  return Math.floor(base * (accent && sp[which].accentBold ? 0.97 : 1))
}
const blockH = (b: Block, st: TextStyle) => {
  if (!st.pitch) return b.height
  return b.lines * st.pitch(b.size) + Math.max(0, b.paras.length - 1) * paraGapPx(st, b.size)
}
const layoutAt = (text: string, st: TextStyle, size: number, width: number) => {
  const b = layoutBlock(text, st, size, width)
  return { ...b, height: blockH(b, st) }
}

// Высота всего текста слайда при заданных кеглях
function totalH(sp: Spec, s: SlideLayout, bs: number, ss: number) {
  const big = s.big ? layoutAt(s.big, sp.big, bs, widthOf(sp, 'big', !!s.accent)) : null
  const small = s.small ? layoutAt(smallOf(sp, s), sp.small, ss, widthOf(sp, 'small', !!s.accent)) : null
  if (sp.smallBox) return { big, small, h: big ? big.height + sp.extra : 0, hs: small ? small.height : 0 }
  const h = (big ? big.height : 0) + (small ? small.height : 0) + (big && small ? sp.gap : 0) + sp.extra
  return { big, small, h, hs: 0 }
}

// Наибольшие кегли одного слайда: общий множитель между min и max у крупного и мелкого
// Обложка: самый крупный кегль, при котором заголовок не выше 72% зоны текста и не длиннее предела строк
// (цель 55-70% высоты), подзаголовок не мельче 45% заголовка и не мельче минимума текста плюс 20%
// Сравнение по высоте строчной «о» в пикселях: у рукописных шрифтов буквы ниже при том же кегле.
// Подзаголовок: «о» не ниже 45% «о» заголовка и не ниже 1.45 «о» минимального основного текста (Onest 38)
export const XH_BODY_MIN = () => xHeight({ family: 'Onest', weight: 400 }, 38)
export const subMinOf = (sp: Spec, bs: number) => {
  // нижняя граница 1.45 «о» основного текста (около 30 px): так подзаголовок в Воздухе, Словаре и Цитате
  // виден так же, как в Записке и Заметках (Арина 03.10)
  // от заголовка с низкой «о» (антиква Воздуха, Цитаты) считаем как от обычного шрифта (0.54 кегля), иначе подзаголовок мельчает вслед за ним
  const need = Math.max(0.45 * bs * Math.max(xHeight(sp.big, 1), 0.54), 1.45 * XH_BODY_MIN())
  return Math.ceil(need / Math.max(1e-6, xHeight(sp.small, 1)))
}
function fitCover(sp: Spec, s: SlideLayout): { bs: number; ss: number; ok: boolean } {
  const w = widthOf(sp, 'big', !!s.accent)
  const capWord = Math.floor(w / Math.max(1e-6, longestUnitAt1(s.big, sp.big)))
  // короткую обложку (2-3 слова) можно крупнее предела стиля, длинную держат строки и высота
  const k = wordCount(s.big) <= 3 ? 1.6 : 1.35
  const hi = Math.min(Math.round(sp.big.max * k), capWord)
  const lo = Math.min(sp.big.min, hi)
  const sw = widthOf(sp, 'small', !!s.accent)
  // рукописные шрифты (строчная «о» ниже 45% кегля) при той же высоте строки выглядят мельче: им до 85% зоны
  const capH = xHeight(sp.big, 1) < 0.45 && !sp.big.upper ? 0.85 : 0.72
  for (let bs = hi; bs >= lo; bs -= 2) {
    const big = layoutAt(s.big, sp.big, bs, w)
    if (big.width > w + 0.5 || (sp.big.maxLines && big.lines > sp.big.maxLines) || big.height > sp.box.h * capH) continue
    const ss = s.small ? subMinOf(sp, bs) : sp.small.min
    const r = totalH(sp, s, bs, ss)
    const smallOk = !s.small || layoutAt(smallOf(sp, s), sp.small, ss, sw).width <= sw + 0.5
    if (r.h <= sp.box.h && (!sp.smallBox || r.hs <= sp.smallBox.h) && smallOk) return { bs: noWidowSize(sp, s, bs), ss, ok: true }
  }
  return { bs: lo, ss: s.small ? subMinOf(sp, lo) : sp.small.min, ok: false }
}

export function fitOne(sp: Spec, s: SlideLayout): { bs: number; ss: number; ok: boolean } {
  if (s.n === 1 && s.big && s.role === 'cover') return fitCover(sp, s)
  // длинное слово («самообесценивание» капсом): заголовок не крупнее, чем слово влезает в строку; ниже минимума только ради него
  const capWord = s.big ? Math.floor(widthOf(sp, 'big', !!s.accent) / Math.max(1e-6, longestUnitAt1(s.big, sp.big))) : Infinity
  const bMax = Math.min(sp.big.max, capWord), bMin = Math.min(sp.big.min, bMax)
  const at = (k: number) => [Math.round(bMin + (bMax - bMin) * k), Math.round(sp.small.min + (sp.small.max - sp.small.min) * k)]
  const ok = (k: number) => {
    const [bs, ss] = at(k)
    const r = totalH(sp, s, bs, ss)
    const capW = (txt: string, st: TextStyle, size: number, w: number) => !txt || layoutAt(txt, st, size, w).width <= w + 0.5
    const bigFits = capW(s.big, sp.big, bs, widthOf(sp, 'big', !!s.accent)) &&
      (!s.big || !sp.big.maxLines || layoutAt(s.big, sp.big, bs, widthOf(sp, 'big', !!s.accent)).lines <= sp.big.maxLines)
    return r.h <= sp.box.h && (!sp.smallBox || r.hs <= sp.smallBox.h) && bigFits
  }
  if (!ok(0)) return { bs: bMin, ss: sp.small.min, ok: false }
  let lo = 0, hi = 1
  if (ok(1)) return { bs: bMax, ss: sp.small.max, ok: true }
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m }
  const [bs, ss] = at(lo)
  return { bs: noWidowSize(sp, s, bs), ss, ok: true }
}
// Вдова в заголовке, которую не убрать перестановкой: уменьшаем заголовок до 85%, пока она не уйдет
function noWidowSize(sp: Spec, s: SlideLayout, bs: number): number {
  if (!s.big) return bs
  const w = widthOf(sp, 'big', !!s.accent)
  const widow = (size: number) => layoutAt(s.big, sp.big, size, w).paras.some(isWidow)
  if (!widow(bs)) return bs
  for (let k = bs - 1; k >= Math.round(bs * 0.8); k--) if (!widow(k)) return k
  return bs
}

// Кегли на всю карусель: обложка своя; у обычных слайдов один кегль мелкого и один крупного (наименьшие из подобранных),
// чтобы соседние слайды не прыгали. Если слайд не влезает даже на минимуме: overflow, в интерфейсе «Разделить на два слайда».
const memo = new Map<string, SlideFit[]>()
export function fitCarousel(style: TemplateStyle, all: SlideLayout[], c: SpecCtx): SlideFit[] {
  const key = JSON.stringify([style, c, all.map(s => [s.n, s.role, s.big, s.small, s.accent])])
  const hit = memo.get(key)
  if (hit) return hit
  const total = all.length
  const specs = all.map(s => specFor(style, s, total, c))
  const own = all.map((s, i) => fitOne(specs[i], s))
  const body = all.map((s, i) => ({ s, i })).filter(({ s }) => s.n !== 1 && s.role !== 'stop' && s.role !== 'final' && s.role !== 'dialog')
  // выброс: слайд, у которого свой кегль текста меньше 85% медианы (очень длинный), в общий кегль не входит,
  // иначе один длинный слайд мельчит всю карусель; у него своя отметка «длинноват» и кнопка «Разделить на два слайда»
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : Infinity }
  const smallSizes = body.filter(({ s }) => s.small).map(({ i }) => own[i].ss)
  const mSmall = med(smallSizes)
  const outlier = new Set(body.filter(({ s, i }) => s.small && own[i].ss < mSmall * 0.85).map(({ i }) => i))
  const sharedSmall = Math.min(...body.filter(({ s, i }) => s.small && !outlier.has(i)).map(({ i }) => own[i].ss), Infinity)
  // заголовок слайда без мелкого текста (короткая фраза крупно) держит свой кегль; длинное слово в заголовке общий кегль не тянет
  const capped = (i: number) => { const sp = specs[i]; const s = all[i]; return !!s.big && Math.floor(widthOf(sp, 'big', !!s.accent) / Math.max(1e-6, longestUnitAt1(s.big, sp.big))) <= own[i].bs }
  const sharedBig = Math.min(...body.filter(({ s, i }) => s.big && s.small && !capped(i)).map(({ i }) => own[i].bs), Infinity)
  const out = all.map((s, i) => {
    const sp = specs[i]
    const cover = s.n === 1 || s.role === 'stop' || s.role === 'final'
    const ownBig = cover || !s.small
    // обложка самый крупный текст карусели: остальные (кроме стоп-слайда) не крупнее ее заголовка
    const coverBig = all[0]?.n === 1 && all[0].big ? own[0].bs : Infinity
    // только обычный текст (слайд с заголовком и текстом text/list/pair); стоп-слайд и короткая фраза («Хватит.») без предела
    const capC = (x: number) => (s.n !== 1 && !!s.small && ['text', 'list', 'pair'].includes(s.role) ? Math.min(x, coverBig) : x)
    const bs = capC(ownBig ? own[i].bs : Math.max(Math.min(sp.big.min, own[i].bs), Math.min(own[i].bs, isFinite(sharedBig) ? sharedBig : own[i].bs)))
    const ss = cover || outlier.has(i) ? own[i].ss : Math.max(sp.small.min, Math.min(own[i].ss, isFinite(sharedSmall) ? sharedSmall : own[i].ss))
    const r = totalH(sp, s, bs, ss)
    const longWord = !!s.big && fitBlock(s.big, sp.big, widthOf(sp, 'big', !!s.accent), 99999, sp.big.min, sp.big.max).longWord
    const emptyBlock = { paras: [], size: 0, height: 0, width: 0, lines: 0, longWord: false }
    return {
      big: r.big || emptyBlock, small: r.small || emptyBlock,
      overflow: !own[i].ok, longWord, tooLong: outlier.has(i) || !own[i].ok,
      heightUsed: r.h, spec: sp,
    }
  })
  if (memo.size > 200) memo.clear()
  memo.set(key, out)
  return out
}

// Делим длинный слайд на два по границе предложения ближе к середине (кнопка «Разделить на два слайда», без модели)
export function splitSlideText(text: string): [string, string] | null {
  const t = String(text || '').trim()
  // список: только по переносу строки перед пунктом, ближе к середине, номер пункта не отрываем от текста
  const ITEM = /^\s*(\d+[.)]|[-•])\s+/
  const lines = t.split('\n')
  if (lines.filter(l => ITEM.test(l)).length >= 2) {
    const at = lines.map((l, i) => i).filter(i => i > 0 && ITEM.test(lines[i]))
    const half = t.length / 2
    let best = -1, dist = Infinity
    for (const i of at) { const pos = lines.slice(0, i).join('\n').length; if (Math.abs(pos - half) < dist) { dist = Math.abs(pos - half); best = i } }
    if (best < 0) return null
    const a = lines.slice(0, best).join('\n').trim(), b = lines.slice(best).join('\n').trim()
    return a && b ? [a, b] : null
  }
  // диалог делим между репликами, ближе к середине по длине
  const rs = parseDialog(t)
  if (rs) {
    if (rs.length < 2) return null
    const lens = rs.map(r => r.text.length)
    const half = lens.reduce((a, b) => a + b, 0) / 2
    let acc = 0, at = 1, best = Infinity
    for (let k = 1; k < rs.length; k++) { acc += lens[k - 1]; if (Math.abs(acc - half) < best) { best = Math.abs(acc - half); at = k } }
    return [dialogToText(rs.slice(0, at)), dialogToText(rs.slice(at))]
  }
  const cuts: number[] = []
  const re = /[.!?…]["»]?\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) cuts.push(m.index + m[0].length)
  if (!cuts.length) return null
  const mid = t.length / 2
  const at = cuts.reduce((best, x) => (Math.abs(x - mid) < Math.abs(best - mid) ? x : best), cuts[0])
  const a = t.slice(0, at).trim(), b = t.slice(at).trim()
  return a && b ? [a, b] : null
}

// ---------------- Диалог ----------------
// Слайд из реплик: внизу двое (клиент слева, психолог справа), над ними пузыри реплик, у клиента слева, у психолога справа.
// Кегль реплик один на все диалог-слайды карусели (очень длинный слайд держит свой и получает «длинноват»).
// Поля те же, что у оболочки стиля (Shell в slides.tsx): тетрадь, доска, воздух, переписка со своими полями.
export function dialogInset(style: TemplateStyle): Rect {
  switch (style) {
    case 't_tetrad': return { x: 170, y: 160, w: W - 250, h: H - 320, what: 'поле' }
    case 't_doska': return { x: 130, y: 170, w: W - 260, h: H - 340, what: 'поле' }
    case 't_vozduh': return { x: 150, y: 170, w: W - 300, h: H - 340, what: 'поле' }
    case 't_perepiska': return { x: 110, y: 260, w: W - 220, h: H - 490, what: 'поле' }
    default: return { x: 110, y: 150, w: W - 220, h: H - 300, what: 'поле' }
  }
}
export type DialogBubble = Rect & { who: Who; block: Block }
export type DialogFit = { size: number; st: TextStyle; bubbles: DialogBubble[]; figs: { a: Rect; b: Rect }; area: Rect; padX: number; padY: number; overflow: boolean; tooLong: boolean }
const PEEP_RATIO = 1170 / 1280
const BUBBLE_GAP = 30 // место под хвостик пузыря
// Фигуры крупно (около 42% высоты) и в обрез снизу, как будто сидят у нижней кромки; люди внутри картинки
// стоят ближе друг к другу (между ними 150-180 px), чтобы смотрели друг на друга, а не жили в разных комнатах.
// В Переписке фигур нет: стиль сам про разговор, там чистый чат на всю высоту.
// Нижняя кромка: край слайда, а у стилей с рамкой (доска, воздух) край рамки.
const DIALOG_BOTTOM: Partial<Record<TemplateStyle, number>> = { t_doska: H - 30, t_vozduh: H - 62 }
export const dialogHasFigures = (style: TemplateStyle) => style !== 't_perepiska'
function dialogGeom(style: TemplateStyle, c: SpecCtx) {
  const I = dialogInset(style)
  const rub = c.opts?.rubric && style !== 't_perepiska' ? rubricRect(style) : null
  const top = rub ? Math.max(I.y, rub.y + rub.h + 24) : I.y
  if (!dialogHasFigures(style)) {
    const none = { x: 0, y: H, w: 0, h: 0, what: 'нет' }
    return { I, figs: { a: { ...none, what: 'клиент' }, b: { ...none, what: 'психолог' } }, area: { x: I.x, y: top, w: I.w, h: I.y + I.h - top, what: 'реплики' } }
  }
  const bottom = DIALOG_BOTTOM[style] ?? H
  const figH = Math.round(H * 0.42)
  const figW = Math.round(figH * PEEP_RATIO)
  const figY = bottom - figH
  // центр человека в картинке на 425/1170 ширины (поле под жесты по краям)
  const cx = (k: number) => Math.round(k - figW * (585 / 1170))
  return {
    I,
    figs: { a: { x: cx(W / 2 - 255), y: figY, w: figW, h: figH, what: 'клиент' }, b: { x: cx(W / 2 + 255), y: figY, w: figW, h: figH, what: 'психолог' } },
    // макушки начинаются ниже верха картинки (около 8% высоты): пузыри можно опустить до них
    area: { x: I.x, y: top, w: I.w, h: figY + Math.round(figH * 0.06) - 30 - top, what: 'реплики' },
  }
}
function dialogStyle(style: TemplateStyle, c: SpecCtx): TextStyle {
  // шрифт основного текста стиля (с выбранной парой), реплики чуть крупнее обычного текста: их мало
  const base = specFor(style, { n: 2, role: 'text', big: '', small: 'x', accent: null, photo: false }, 3, c).small
  // без шага линовки тетради: в пузыре строки идут своим интервалом
  return { ...base, balance: false, pitch: undefined, max: Math.round(base.max * 1.15), min: base.min }
}
function layDialog(rs: Reply[], st: TextStyle, size: number, g: ReturnType<typeof dialogGeom>) {
  const padX = Math.round(size * 0.7), padY = Math.round(size * 0.45)
  const maxW = Math.round(g.area.w * 0.8)
  const blocks = rs.map(r => layoutBlock(r.text, st, size, maxW - 2 * padX))
  const hs = blocks.map(b => Math.round(b.height + 2 * padY))
  const total = hs.reduce((a, b) => a + b, 0) + BUBBLE_GAP * Math.max(0, rs.length - 1)
  const wide = blocks.some(b => b.width > maxW - 2 * padX + 0.5)
  // пузыри стоят над головами: блок прижат к низу области, ближе к говорящим
  let y = g.area.y + Math.max(0, g.area.h - total)
  const bubbles: DialogBubble[] = rs.map((r, i) => {
    const w = Math.round(Math.min(maxW, blocks[i].width + 2 * padX))
    const x = r.who === 'a' ? g.area.x : g.area.x + g.area.w - w
    const b = { x, y, w, h: hs[i], what: r.who === 'a' ? 'реплика клиента' : 'реплика психолога', who: r.who, block: blocks[i] }
    y += hs[i] + BUBBLE_GAP
    return b
  })
  return { bubbles, total, padX, padY, fits: total <= g.area.h && !wide }
}
const dmemo = new Map<string, (DialogFit | null)[]>()
export function fitDialogs(style: TemplateStyle, all: SlideLayout[], c: SpecCtx): (DialogFit | null)[] {
  const key = JSON.stringify([style, c, all.map(s => [s.role, s.small])])
  const hit = dmemo.get(key)
  if (hit) return hit
  const g = dialogGeom(style, c)
  const st = dialogStyle(style, c)
  const reps = all.map(s => (s.role === 'dialog' ? parseDialog(`${s.big}\n${s.small}`) : null))
  // свой наибольший кегль каждого диалог-слайда
  const own = reps.map(rs => {
    if (!rs) return 0
    const cap = Math.floor((g.area.w * 0.8 - 2 * st.min * 0.7) / Math.max(1e-6, longestUnitAt1(rs.map(r => r.text).join('\n'), st)))
    let lo = Math.min(st.min, cap), hi = Math.min(st.max, cap)
    if (!layDialog(rs, st, lo, g).fits) return -lo
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (layDialog(rs, st, m, g).fits) lo = m; else hi = m }
    return layDialog(rs, st, hi, g).fits ? hi : lo
  })
  const ok = own.filter(x => x > 0)
  const sorted = [...ok].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  const shared = Math.min(...ok.filter(x => x >= median * 0.85), Infinity)
  const out = reps.map((rs, i) => {
    if (!rs) return null
    const overflow = own[i] <= 0
    // свой кегль меньше общего: держит его, других не мельчит; «длинноват» только если кегль у самого минимума
    const tooLong = overflow || (own[i] < median * 0.85 && own[i] <= Math.round(st.min * 1.1))
    const size = overflow ? -own[i] : tooLong ? own[i] : Math.min(own[i], isFinite(shared) ? shared : own[i])
    const l = layDialog(rs, st, size, g)
    return { size, st, bubbles: l.bubbles, figs: g.figs, area: g.area, padX: l.padX, padY: l.padY, overflow, tooLong }
  })
  if (dmemo.size > 200) dmemo.clear()
  dmemo.set(key, out)
  return out
}

// ---------------- Поля оболочки стиля и финал «кто я» ----------------
// Поля оболочки (Shell в slides.tsx) для стоп-слайда, финала и диалога: один источник для рендера и проверки
export function shellInset(style: TemplateStyle, mode: 'stop' | 'final' | 'dialog'): Rect {
  // Заметки: поле между шапкой и нижней панелью, на финале под датой
  if (style === 't_zametki') { const y = ZM.textTop + (mode === 'final' ? ZM.dateH : 0); return { x: ZM.side, y, w: W - ZM.side * 2, h: H - ZM.bottom - 20 - y, what: 'поле' } }
  if (style === 't_stikery' && mode === 'final') return { x: 160, y: 200, w: W - 320, h: H - 420, what: 'поле' }
  return dialogInset(style)
}

// Финал: фото или инициалы, имя, строка о себе, ник, линия, призыв. Раньше кегли были постоянные (имя 52, призыв 44),
// и на пустом слайде финал стоял мелко. Теперь общий масштаб k подбирается, пока все влезает в поле (0.7..1.6).
export type FinalSizes = {
  leadSt: BlockStyle; leadText: string; restText: string
  k: number; photo: number; name: number; about: number; handle: number; gap: number; line: number
  lead: number; rest: number; before: number; after: number; pill: number
  head: Spec; height: number; inset: Rect
}
const HAND_FAMILIES = new Set(['Caveat', 'Neucha', 'Bad Script', 'Marck Script'])
export function finalSizes(style: TemplateStyle, s: SlideLayout, total: number, c: SpecCtx, a: { about: string; name: string; handle: boolean }, capBig = Infinity): FinalSizes {
  const inset = shellInset(style, 'final')
  const head = specFor(style, { ...s, role: 'text', n: 2 }, total, c)
  const cta = ctaOf(`${s.big} ${s.small}`)
  const hand = HAND_FAMILIES.has(head.small.family)
  const text = `${s.big} ${s.small}`.trim()
  const w = inset.w
  const lead1 = cta.kind === 'question' ? text : text.match(/^[\s\S]*?[.!?…](?=\s|$)/)?.[0] || text
  const rest1 = cta.kind === 'question' ? '' : text.slice(lead1.length).trim()
  // имя одной строкой в ширину поля
  const nameMax = a.name ? Math.floor(w / Math.max(1e-6, measureFS(a.name, head.big) * 1.02)) : 999
  // призыв без кодового слова: шрифт заголовка, но строчными
  const leadSt: BlockStyle = { ...head.big, upper: false, lh: Math.max(head.big.lh, 1.15) }
  const sizes = (k: number) => {
    const z = {
      // имя читается с телефона (около 88 px при ширине 1080, но не шире поля), строка о себе не мельче
      // основного текста стиля; призыв главный: фраза призыва и кодовое слово крупнее имени
      // имя заметно крупнее строки о себе (в 1.6-2 раза) и читается с телефона; призыв без кодового слова
      // строчными, на четверть крупнее основного текста, не плакатом (Арина 03.10)
      k, photo: Math.round(170 * Math.min(k, 1.2)), name: 0, about: Math.max(Math.round((hand ? 40 : 34) * k), head.small.min, Math.round(head.small.max * 0.85)),
      handle: Math.max(Math.round(30 * k), Math.round(head.small.min * 0.85)),
      gap: Math.round(14 * k), line: Math.round(36 * k),
      lead: 0, rest: Math.max(Math.round(46 * k), head.small.min),
      before: Math.max(Math.round(62 * k), head.small.min), after: Math.max(Math.round(48 * k), head.small.min), pill: 0,
    }
    // ни имя, ни призыв, ни кодовое слово не крупнее заголовка обложки
    z.name = Math.min(Math.max(Math.round(z.about * 1.7), Math.round(60 * k)), nameMax, capBig)
    z.lead = Math.round(head.small.max * 1.25 * Math.min(k, 1.1))
    // длинный призыв широким шрифтом: мельче, пока не встанет в 5 строк, но не мельче основного текста
    z.lead = Math.min(z.lead, capBig)
    while (cta.kind !== 'code' && z.lead > head.small.min && layoutBlock(lead1, leadSt, z.lead, w).lines > 5) z.lead -= 2
    // кодовое слово на пилюле: крупно, но в ширину поля
    // кодовое слово главный призыв: без предела обложки, как было (Арина 03.10)
    if (cta.code) z.pill = Math.min(Math.round(132 * k), Math.floor((w - 120) / Math.max(1e-6, measureFS(cta.code.toUpperCase(), head.big))))
    let h = z.photo + z.gap + (a.name ? z.gap + z.name * 1.1 : 0) + z.gap + layoutBlock(a.about || 'Психолог', head.small, z.about, w).height + (a.handle ? z.gap + z.handle * 1.3 : 0)
    h += z.line * 2 + 5
    let wide = false
    const blk = (t: string, st: BlockStyle, size: number) => { if (!t) return 0; const b = layoutBlock(t, st, size, w); if (b.width > w + 0.5) wide = true; return b.height }
    if (cta.kind === 'code') h += blk(cta.before, head.small, z.before) + 26 + z.pill + 44 + 26 + blk(cta.after, head.small, z.after)
    else h += blk(lead1, leadSt, z.lead) + (rest1 ? 22 + blk(rest1, head.small, z.rest) : 0) + (cta.kind === 'question' || cta.kind === 'subscribe' ? 22 + z.rest * 1.6 : 0)
    return { ...z, height: Math.round(h), wide }
  }
  // от 1.6 вниз; в узком поле (переписка, скрапбук) можно и мельче исходного, до 0.7
  let best = sizes(0.7)
  for (let k = 1.6; k >= 0.7; k -= 0.05) { const z = sizes(k); if (z.height <= inset.h * 0.94 && !z.wide) { best = z; break } }
  const { wide: _w, ...z } = best
  return { ...z, head, inset, leadSt, leadText: lead1, restText: rest1 }
}
const measureFS = (t: string, f: BlockStyle) => longestUnitAt1(t.replace(/\s+/g, ''), f)

export const CAPS_MAX_WORDS = 6
// плашка кодового слова на финале не уже 55% ширины слайда
export const PILL_MIN_W = Math.round(W * 0.55)
// Обложка: самый крупный текст карусели, правило «от 7 слов меньше» к ней не относится. Капс только до 6 слов,
// длиннее строчными, тем же крупным кеглем, до 5 строк; капс до 4 строк (Арина 03.10)
export function coverPolicy(st: TextStyle, text: string): TextStyle {
  const n = wordCount(text)
  if (n > CAPS_MAX_WORDS) return { ...st, upper: false, maxLines: 5 }
  return { ...st, maxLines: st.upper ? 4 : 5 }
}
// длинная фраза мельче крупной, но заметно крупнее основного текста (в 1.35 раза), чтобы не потерялась на пустом слайде
export function phrasePolicy(st: TextStyle, text: string, bodyMax = 0): TextStyle {
  const n = wordCount(text)
  if (!n) return st
  if (n > CAPS_MAX_WORDS) return { ...st, upper: false, max: Math.min(st.max, Math.max(st.min, Math.round(st.max * 0.6), Math.round(bodyMax * 1.35))), maxLines: 5 }
  return st.upper ? { ...st, maxLines: 4 } : { ...st, maxLines: 5 }
}

// ---------------- Заметки iPhone ----------------
// Высоты интерфейса при ширине 1080: статус-бар 64, шапка до 140, нижняя панель 110. Вместе 250 px, это 17% высоты.
export const ZM = { status: 64, header: 140, bottom: 110, side: 70, textTop: 170, dateH: 70, check: 84 }
export function zametkiChrome(withDate: boolean): Rect[] {
  const r: Rect[] = [
    { x: 60, y: 18, w: W - 120, h: 40, what: 'статус-бар' },
    { x: 60, y: 82, w: W - 120, h: 50, what: 'шапка' },
    { x: 60, y: H - ZM.bottom + 20, w: W - 120, h: 60, what: 'панель' },
  ]
  if (withDate) r.push({ x: 240, y: ZM.textTop + 6, w: W - 480, h: 40, what: 'дата' })
  return r
}
