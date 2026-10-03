// Автопроверка верстки карусели: по каждому слайду кегль, строки, вдовы, висячие предлоги, наложения,
// выход за поля, текст меньше минимума. Без рендера: те же числа, по которым слайд рисуется (spec.ts, fit.ts).
// Цель: ноль наложений, ноль висячих предлогов, ноль вдов в заголовках.

import type { SlideLayout } from './layout'
import type { TemplateStyle } from './styles'
import { STYLES, fitScale, resolvePalette, aboutInk, contrast } from './styles'
import { fitCarousel, fitDialogs, finalSizes, rubricRect, smallOf, specFor, subMinOf, PILL_MIN_W, W, H, type Rect, type SpecCtx } from './spec'
import { ctaOf } from './cta'
import { greedy, hangingEnds, isWidow, layoutBlock, lineText, lineWidth, paragraphs, HYPHEN_PREFIXES, measure as measureText, type Line } from './fit'

export type SlideAudit = {
  n: number
  role?: string
  bigSize: number; smallSize: number; bigLines: number; smallLines: number
  widowBig: number; widowSmall: number; hanging: number
  overlaps: string[]; outOfBounds: string[]; belowMin: string[]
  overflow: boolean; longWord: boolean; tooLong?: boolean
  shortSmall?: boolean // короткий текст (до 15 слов) мелко, хотя больше половины слайда пусто
  capsWall?: boolean   // стена: капс длиннее 6 слов или больше 4 строк, крупный текст строчными больше 5 строк
  coverSmall?: boolean // обложка мельче самого крупного текста на других слайдах (кроме стопа)
  subSmall?: boolean   // подзаголовок обложки мельче 45% заголовка или минимума текста плюс 20%
  aboutBad?: boolean   // строка про автора на финале мельче минимума текста или контраст ниже 4.5
  badHyphen?: boolean  // перенос не по приставке
  pillNarrow?: boolean // плашка кодового слова на финале уже 55% ширины слайда
}
// ширина плашки кода как в FinalSlide: текст и поля по половине кегля, не уже PILL_MIN_W; длинный код (от 13 знаков) без плашки
const pillWidth = (code: string, Z: ReturnType<typeof finalSizes>) => code.length > 12
  ? measureText(code.toUpperCase(), Z.head.big, Z.pill) + 28
  : Math.max(PILL_MIN_W, measureText(code.toUpperCase(), Z.head.big, Z.pill) + Z.pill)
// перенос в строке: часть перед дефисом должна быть приставкой из списка
const badHyphenIn = (lines: Line[][]) => lines.flat().some(l => { const t = lineText(l); return /[\p{L}]-$/u.test(t) && !HYPHEN_PREFIXES.includes((t.split(/\s+/).pop() || '').slice(0, -1).toLowerCase()) })

// Короткий слайд (фраза, вопрос, призыв) должен держать слайд: кегль не ниже 55% кегля обложки стиля,
// если текст занимает меньше половины места. Финал считается по своему масштабу (finalSizes).
const SHORT_WORDS = 15
const words = (t: string) => String(t || '').trim().split(/\s+/).filter(Boolean).length
const shortMinOf = (style: TemplateStyle, total: number, c: SpecCtx, text = 'x') => {
  const sp = specFor(style, { n: 1, role: 'cover', big: 'x', small: '', accent: null, photo: false }, total, c)
  // длинная фраза (от 7 слов) по правилу мельче: ей достаточно быть крупнее основного текста
  return words(text) > 6 ? Math.round(sp.small.max * 1.15) : Math.round(sp.big.max * 0.55)
}
// подставной автор для проверки финала: как в образцах
const AUTHOR = { about: 'Психолог, работаю с женщинами, которые устали быть удобными', name: 'Анна Смирнова', handle: true }

const MARGIN = 40 // ближе к краю холста ничего важного
const SCREEN_UI = ['статус-бар', 'панель']
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const inside = (r: Rect) => r.x >= MARGIN && r.y >= MARGIN && r.x + r.w <= W - MARGIN && r.y + r.h <= H - MARGIN

export function auditCarousel(style: TemplateStyle, layout: SlideLayout[], c: SpecCtx): SlideAudit[] {
  const fits = fitCarousel(style, layout, c)
  const dialogs = fitDialogs(style, layout, c)
  const coverBig = layout[0]?.n === 1 && layout[0].big ? fits[0].big.size : 0
  // самый крупный текст на других слайдах, кроме стопа (финал считаем по его масштабу)
  let others = 0
  layout.forEach((s, i) => {
    if (s.n === 1 || s.role === 'stop' || dialogs[i]) return
    // кодовое слово, стоп-слайд и короткая фраза («Хватит.») под правило не попадают (Арина 03.10)
    if (s.role === 'final' && s.n === layout.length && layout.length > 1) {
      const Z = finalSizes(style, s, layout.length, c, AUTHOR, coverBig || Infinity)
      others = Math.max(others, Z.name, ctaOf(`${s.big} ${s.small}`).kind === 'code' ? 0 : Z.lead)
    } else if (s.small && ['text', 'list', 'pair'].includes(s.role)) others = Math.max(others, s.big ? fits[i].big.size : 0, fits[i].small.size)
  })
  return layout.map((s, i) => {
    const D = dialogs[i]
    if (D) return auditDialog(style, s, D, c)
    if (s.role === 'final' && s.n === layout.length && layout.length > 1) return auditFinal(style, s, layout.length, c, coverBig || Infinity)
    const F = fits[i]
    const sp = F.spec
    const overlaps: string[] = []
    const outOfBounds: string[] = []
    const belowMin: string[] = []
    const textRects: Rect[] = []
    // где текст на самом деле: колонка по высоте занятого текста, ширина по самой длинной строке
    if (sp.smallBox) {
      if (s.big) textRects.push({ ...sp.box, h: Math.min(sp.box.h, F.big.height + sp.extra), what: 'заголовок' })
      if (s.small) textRects.push({ ...sp.smallBox, h: Math.min(sp.smallBox.h, F.small.height), what: 'текст' })
    } else if (s.big || s.small) {
      textRects.push({ ...sp.box, what: 'текст' })
    }
    for (const r of textRects) {
      for (const f of sp.fixed) if (hit(r, f)) overlaps.push(`${r.what} и ${f.what}`)
      if (!inside(r)) outOfBounds.push(r.what)
    }
    // интерфейс экрана (статус-бар и нижняя панель Заметок) стоит у края, как на настоящем скрине: поля к нему не применяем
    for (const f of sp.fixed) if (f.what !== 'фото' && !SCREEN_UI.includes(f.what) && !inside({ ...f })) outOfBounds.push(f.what)
    // строки не шире колонки
    const wBig = sp.bigWidth ?? sp.box.w
    const wSmall = sp.smallBox?.w ?? sp.smallWidth ?? sp.box.w
    if (F.big.width > wBig + 1) outOfBounds.push('строка заголовка шире колонки')
    if (F.small.width > wSmall + 1) outOfBounds.push('строка текста шире колонки')
    if (s.big && F.big.size < sp.big.min) belowMin.push(`заголовок ${F.big.size}`)
    if (s.small && F.small.size < sp.small.min) belowMin.push(`текст ${F.small.size}`)
    return {
      n: s.n, role: s.role,
      bigSize: F.big.size, smallSize: F.small.size, bigLines: F.big.lines, smallLines: F.small.lines,
      widowBig: F.big.paras.filter(isWidow).length, widowSmall: F.small.paras.filter(isWidow).length,
      hanging: [...F.big.paras, ...F.small.paras].reduce((n, p) => n + hangingEnds(p), 0),
      overlaps, outOfBounds, belowMin, overflow: F.overflow, longWord: F.longWord, tooLong: F.tooLong,
      // кегль, который держит длинное слово во всю строку, не мелкий: шире слово не встанет
      capsWall: !!s.big && (sp.big.upper ? words(s.big) > 6 || F.big.lines > 4 : F.big.lines > 5),
      coverSmall: s.n === 1 && !!s.big && F.big.size < others,
      subSmall: s.n === 1 && !!s.big && !!s.small && F.small.size < subMinOf(sp, F.big.size),
      badHyphen: badHyphenIn(F.big.paras),
      // и заголовок, у которого самая длинная строка уже заполняет колонку (широкий шрифт, длинное слово)
      // текст, который упирается в кегль обложки (обложка самый крупный текст карусели), мелким не считаем
      shortSmall: (!s.small || s.n === 1) && !(s.n !== 1 && coverBig && F.big.size >= coverBig) && !F.longWord && !(s.big && F.big.width >= (sp.bigWidth ?? sp.box.w) * 0.9) && words(`${s.big} ${s.small}`) <= SHORT_WORDS && (s.big ? F.big.size : F.small.size) < shortMinOf(style, layout.length, c, `${s.big} ${s.small}`) && F.heightUsed < sp.box.h * 0.5,
    }
  })
}

// Финал «кто я»: все влезает в поле, а призыв не мелкий при пустом месте
function auditFinal(style: TemplateStyle, s: SlideLayout, total: number, c: SpecCtx, capBig = Infinity): SlideAudit {
  const Z = finalSizes(style, s, total, c, AUTHOR, capBig)
  const pal = resolvePalette(style, null).pal
  const cta = ctaOf(`${s.big} ${s.small}`)
  const main = cta.kind === 'code' ? Z.before : Z.lead
  const overflow = Z.height > Z.inset.h
  return {
    n: s.n, role: s.role, bigSize: main, smallSize: 0, bigLines: 0, smallLines: 0, widowBig: 0, widowSmall: 0, hanging: 0,
    overlaps: [], outOfBounds: overflow ? ['финал выше поля'] : [], belowMin: [], overflow, longWord: false,
    shortSmall: main < Math.round(Z.head.small.max * 1.1) && Z.height < Z.inset.h * 0.5,
    // призыв без кодового слова строчными и не длиннее 5 строк
    pillNarrow: cta.kind === 'code' && !!cta.code && pillWidth(cta.code, Z) < W * 0.55,
    aboutBad: Z.about < Z.head.small.min || contrast(aboutInk(pal, pal.bg), pal.bg) < 4.5,
    capsWall: cta.kind !== 'code' && (!!Z.leadSt.upper || layoutBlock(Z.leadText, Z.leadSt, Z.lead, Z.inset.w).lines > 5),
  }
}

// Слайд-диалог: пузыри не налезают друг на друга, на людей и на рубрику, не выходят за поля, кегль не ниже минимума
function auditDialog(style: TemplateStyle, s: SlideLayout, D: NonNullable<ReturnType<typeof fitDialogs>[number]>, c: SpecCtx): SlideAudit {
  const overlaps: string[] = [], outOfBounds: string[] = [], belowMin: string[] = []
  const rub = c.opts?.rubric && style !== 't_perepiska' ? rubricRect(style) : null
  const others: Rect[] = [{ ...D.figs.a, y: D.figs.a.y + 40 }, { ...D.figs.b, y: D.figs.b.y + 40 }, ...(rub ? [rub] : [])]
  D.bubbles.forEach((b, k) => {
    for (const o of others) if (hit(b, o)) overlaps.push(`${b.what} и ${o.what}`)
    for (const o of D.bubbles.slice(k + 1)) if (hit(b, o)) overlaps.push(`${b.what} и ${o.what}`)
    if (!inside(b)) outOfBounds.push(b.what)
    if (b.block.width > b.w - 2 * D.padX + 1) outOfBounds.push('строка шире пузыря')
  })
  if (D.size < D.st.min) belowMin.push(`реплики ${D.size}`)
  const paras = D.bubbles.flatMap(b => b.block.paras)
  return {
    n: s.n, role: s.role, bigSize: 0, smallSize: D.size, bigLines: 0, smallLines: D.bubbles.reduce((n, b) => n + b.block.lines, 0),
    widowBig: 0, widowSmall: paras.filter(isWidow).length, hanging: paras.reduce((n, p) => n + hangingEnds(p), 0),
    overlaps, outOfBounds, belowMin, overflow: D.overflow, longWord: false, tooLong: D.tooLong,
  }
}

// «До»: как было раньше. Кегль по счету символов (fitScale 100/90/80%), перенос строк делал Satori сам
// (жадно, со склейкой только коротких слов до 10 знаков). Считаем тем же замером, чтобы сравнить честно.
const OLD_BASE: Record<TemplateStyle, { big: [number, number]; small: number }> = {
  t_redakciya: { big: [116, 96], small: 52 }, t_perepiska: { big: [72, 56], small: 50 }, t_tetrad: { big: [112, 92], small: 60 },
  t_plakat: { big: [118, 80], small: 52 }, t_mono: { big: [84, 62], small: 44 }, t_premium: { big: [92, 80], small: 46 },
  t_skrapbuk: { big: [62, 52], small: 42 }, t_zapiska: { big: [88, 62], small: 46 }, t_zametki: { big: [84, 64], small: 52 },
  t_stikery: { big: [108, 88], small: 60 }, t_citata: { big: [96, 76], small: 46 }, t_slovar: { big: [104, 84], small: 46 },
  t_doska: { big: [104, 84], small: 54 }, t_vozduh: { big: [84, 66], small: 44 },
}
const CAPS_OLD: TemplateStyle[] = ['t_redakciya', 't_plakat', 't_mono', 't_premium', 't_skrapbuk']
const OLD_SHORT = /^[«„"(]*(?:[\p{L}]{1,2}|для|без|под|над|при|про|что|как|или|где|чем)$/iu
function oldUnits(p: string): string[] {
  const out: string[] = []
  for (const t of p.split(/[ \t]+/).filter(Boolean)) {
    const prev = out[out.length - 1]
    const last = prev?.split(' ').pop() || ''
    if (prev !== undefined && OLD_SHORT.test(last) && (prev + ' ' + t).length <= 10) out[out.length - 1] = prev + ' ' + t
    else out.push(t)
  }
  return out
}
export function auditOld(style: TemplateStyle, layout: SlideLayout[], c: SpecCtx): SlideAudit[] {
  const lim = STYLES[style].limits
  const base = OLD_BASE[style]
  return layout.map(s => {
    const sp = specFor(style, s, layout.length, c)
    const cover = s.n === 1
    const fb = fitScale(s.big.length, cover ? lim.coverBig : lim.big)
    const solo = !s.big.trim()
    const fs = fitScale(s.small.length, solo ? Math.round(lim.small / 1.32) : lim.small)
    const bs = Math.round((cover ? base.big[0] : base.big[1]) * fb.scale)
    const ss = Math.round(base.small * fs.scale * (solo ? 1.15 : 1))
    const wBig = sp.bigWidth ?? sp.box.w
    const wSmall = sp.smallBox?.w ?? sp.smallWidth ?? sp.box.w
    const br = (t: string, st: typeof sp.big, size: number, w: number) => paragraphs(t).map(p => greedy(oldUnits(p), st, size, w))
    const bigP: Line[][] = s.big ? br(s.big, sp.big, bs, wBig) : []
    const smallP: Line[][] = s.small ? br(smallOf(sp, s), sp.small, ss, wSmall) : []
    const lines = (ps: Line[][]) => ps.reduce((n, p) => n + p.length, 0)
    const hBig = lines(bigP) * bs * sp.big.lh, hSmall = lines(smallP) * ss * sp.small.lh
    const overflowH = hBig + hSmall + (s.big && s.small ? sp.gap : 0) + sp.extra > sp.box.h
    const tooWide = [...bigP.flat().map(l => lineWidth(l, sp.big, bs) > wBig), ...smallP.flat().map(l => lineWidth(l, sp.small, ss) > wSmall)].some(Boolean)
    return {
      n: s.n, bigSize: s.big ? bs : 0, smallSize: s.small ? ss : 0, bigLines: lines(bigP), smallLines: lines(smallP),
      widowBig: bigP.filter(isWidow).length, widowSmall: smallP.filter(isWidow).length,
      hanging: [...bigP, ...smallP].reduce((n, p) => n + hangingEnds(p), 0),
      overlaps: [], outOfBounds: tooWide ? ['строка шире колонки'] : [], belowMin: [
        ...(s.big && bs < sp.big.min ? [`заголовок ${bs}`] : []), ...(s.small && ss < sp.small.min ? [`текст ${ss}`] : []),
      ],
      overflow: overflowH, longWord: tooWide,
      capsWall: !!s.big && (sp.big.upper || CAPS_OLD.includes(style)) && (words(s.big) > 6 || bigP.reduce((n, p) => n + p.length, 0) > 4),
      shortSmall: words(`${s.big} ${s.small}`) <= SHORT_WORDS && (s.big ? bs : ss) < shortMinOf(style, layout.length, c) && hBig + hSmall < sp.box.h * 0.5,
    }
  })
}

export function summarize(rows: SlideAudit[]) {
  const sizesSmall = rows.filter(r => r.smallSize && r.n !== 1 && r.role !== 'stop' && r.role !== 'final' && r.role !== 'dialog' && !r.tooLong).map(r => r.smallSize)
  return {
    slides: rows.length,
    overlaps: rows.reduce((n, r) => n + r.overlaps.length, 0),
    outOfBounds: rows.reduce((n, r) => n + r.outOfBounds.length, 0),
    hanging: rows.reduce((n, r) => n + r.hanging, 0),
    widowsBig: rows.reduce((n, r) => n + r.widowBig, 0),
    widowsSmall: rows.reduce((n, r) => n + r.widowSmall, 0),
    belowMin: rows.reduce((n, r) => n + r.belowMin.length, 0),
    overflow: rows.filter(r => r.overflow).length,
    shortSmall: rows.filter(r => r.shortSmall).length,
    capsWall: rows.filter(r => r.capsWall).length,
    coverSmall: rows.filter(r => r.coverSmall).length,
    subSmall: rows.filter(r => r.subSmall).length,
    aboutBad: rows.filter(r => r.aboutBad).length,
    badHyphen: rows.filter(r => r.badHyphen).length,
    pillNarrow: rows.filter(r => r.pillNarrow).length,
    // разный кегль основного текста на соседних обычных слайдах одной карусели
    jumpy: new Set(sizesSmall).size > 1 ? 1 : 0,
  }
}
