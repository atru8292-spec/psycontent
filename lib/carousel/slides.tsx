/** @jsxRuntime automatic */
// Слайды шаблонных каруселей для рендера через ImageResponse (Satori).
// Satori понимает только flex и абсолютное позиционирование: у каждого div с несколькими
// детьми display flex, текст с выделением собирается из слов-спанов.
// Все цвета берутся из палитры (фон, текст, акцент): психолог может поставить свои.

import type { ReactElement } from 'react'
import { ctaOf, type SlideLayout } from './layout'
import { STYLES, fitScale, mix, contrast, isDark, DECOR_STYLES, aboutInk, ZAMETKI_THEMES, type TemplateStyle, type Palette, type Decor } from './styles'
import { lineText, layoutBlock, measure, type Block } from './fit'
import { specFor, fitCarousel, fitOne, rubricRect, fitDialogs, dialogHasFigures, finalSizes, shellInset, PILL_MIN_W, ZM, type SlideFit, type TextStyle, type DesignOptions } from './spec'
import { parseDialog, slidePoses, peepUrl } from './dialog'

export const W = 1080
export const H = 1440

export type SlideCtx = {
  style: TemplateStyle
  slide: SlideLayout
  total: number
  pal: Palette
  handle: string        // ник без @
  name: string
  avatar: string | null // data URL
  photos: string[]      // data URL, по кругу
  paper: string | null  // data URL фона записки
  chalk?: string | null // data URL текстуры доски
  variant?: number      // вариант компоновки 0..2, чтобы одинаковые стили у разных психологов не совпадали
  decor?: Decor         // узор фона: ленты или линии через всю карусель
  long?: boolean        // в карусели есть длинный слайд: центрованные компоновки уходят влево, длинный текст по центру не читается
  all?: SlideLayout[]   // вся карусель: кегли подбираются на все слайды сразу (один кегль текста на всю карусель)
  about?: string        // строка о себе для финала («Ольга, психолог, работаю с ...»)
  signature?: boolean   // подпись «Имя | психолог» внизу обложки
  fontPair?: number     // шрифтовая пара стиля 0..2 (pairs.ts)
  opts?: DesignOptions  // вид акцента, крупные номера, рубрика, фото на обложке
}

// Подбор текста для этого слайда: по всей карусели, если она передана, иначе по одному слайду
export function fitOf(c: SlideCtx): SlideFit {
  const sc = { variant: c.variant || 0, long: !!c.long, hasPhotos: c.photos.length > 0, hasAvatar: !!c.avatar, fontPair: c.fontPair || 0, opts: c.opts }
  if (c.all && c.all.length === c.total) return fitCarousel(c.style, c.all, sc)[c.slide.n - 1]
  const fake = Array.from({ length: c.total }, (_, i) => (i === c.slide.n - 1 ? c.slide : { ...c.slide, n: i + 1, big: '', small: '' }))
  return fitCarousel(c.style, fake, sc)[c.slide.n - 1]
}
// один пункт списка как отдельный блок
const subBlock = (b: Block, i: number): Block => ({ ...b, paras: b.paras[i] ? [b.paras[i]] : [], lines: b.paras[i]?.length || 0 })

// ---------------- Узор фона ----------------
// Кривые считаются на всю ширину карусели (слайды подряд), каждый слайд показывает свое окно,
// поэтому лента, ушедшая за край одного слайда, продолжается на следующем.
const DECOR_SEED: Record<Decor, number> = { none: 0, lenty: 1, linii: 2, zmeyki: 3, kletka: 4, dymka: 5 }
function rnd(seed: number) {
  let t = seed >>> 0
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296 }
}
function wave(total: number, base: number, amp: number, r: () => number): string {
  const L1 = 300 + r() * 250, L2 = 700 + r() * 400, p1 = r() * 6.28, p2 = r() * 6.28
  const pts: [number, number][] = []
  for (let x = -80; x <= W * total + 80; x += 36) {
    pts.push([x, base + amp * Math.sin(x / L1 + p1) + amp * 0.6 * Math.sin(x / L2 + p2)])
  }
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  return d
}
// Цвет узора: чем сильнее, тем заметнее, но текст поверх него должен читаться (контраст от 4.5)
function tone(bg: string, to: string, t: number, ink: string): string {
  for (let k = t; k > 0.04; k -= 0.02) {
    const c = mix(bg, to, k)
    if (contrast(ink, c) >= 4.5) return c
  }
  return mix(bg, to, 0.04)
}

// Змейки: изолинии плавного поля (сумма синусов), как на топографической карте.
// Изолинии не пересекаются, поле одно на всю карусель, поэтому на стыке слайдов линия продолжается.
function zmeykiPath(n: number, seed: number): string {
  const r = rnd(seed)
  const waves = Array.from({ length: 4 }, () => {
    const a = r() * Math.PI, L = 560 + r() * 420
    return { kx: Math.cos(a) * 6.283 / L, ky: Math.sin(a) * 6.283 / L, p: r() * 6.283 }
  })
  const f = (x: number, y: number) => waves.reduce((sum, w) => sum + Math.sin(w.kx * x + w.ky * y + w.p), 0)
  const levels = [-0.9, 1.1]
  const g = 24
  const x0 = (n - 1) * W - g * 2, x1 = n * W + g * 2
  let d = ''
  const pt = (ax: number, ay: number, av: number, bx: number, by: number, bv: number, lv: number) => {
    const t = (lv - av) / (bv - av)
    return [ax + (bx - ax) * t, ay + (by - ay) * t]
  }
  for (let x = x0; x < x1; x += g) {
    for (let y = -g * 2; y < H + g * 2; y += g) {
      const a = f(x, y), b = f(x + g, y), c = f(x + g, y + g), e = f(x, y + g)
      for (const lv of levels) {
        const edges: number[][] = []
        if ((a < lv) !== (b < lv)) edges.push(pt(x, y, a, x + g, y, b, lv))
        if ((b < lv) !== (c < lv)) edges.push(pt(x + g, y, b, x + g, y + g, c, lv))
        if ((c < lv) !== (e < lv)) edges.push(pt(x + g, y + g, c, x, y + g, e, lv))
        if ((e < lv) !== (a < lv)) edges.push(pt(x, y + g, e, x, y, a, lv))
        for (let i = 0; i + 1 < edges.length; i += 2) {
          d += `M${edges[i][0].toFixed(1)} ${edges[i][1].toFixed(1)}L${edges[i + 1][0].toFixed(1)} ${edges[i + 1][1].toFixed(1)}`
        }
      }
    }
  }
  return d
}

function Decor({ kind, n, total, variant, bg, ink, accent }: { kind: Decor; n: number; total: number; variant: number; bg: string; ink: string; accent: string }) {
  if (kind === 'none') return null
  const seed = 1000 + variant * 97 + DECOR_SEED[kind] * 13
  const r = rnd(seed)
  const dark = isDark(bg)
  const soft = tone(bg, accent, dark ? 0.22 : 0.16, ink)
  const thin = tone(bg, ink, dark ? 0.3 : 0.28, ink)
  const box = { width: W, height: H, viewBox: `${(n - 1) * W} 0 ${W} ${H}`, style: { position: 'absolute' as const, top: 0, left: 0 } }

  if (kind === 'zmeyki') {
    return (
      <svg {...box}>
        {/* под текстом змейки бледнеют: полная сила у верхнего и нижнего края, в середине треть */}
        <defs>
          <linearGradient id="zf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.13" stopColor="#FFFFFF" />
            <stop offset="0.27" stopColor="#555555" />
            <stop offset="0.76" stopColor="#555555" />
            <stop offset="0.9" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#FFFFFF" />
          </linearGradient>
          <mask id="zm"><rect x={(n - 1) * W} y={0} width={W} height={H} fill="url(#zf)" /></mask>
        </defs>
        <path d={zmeykiPath(n, seed)} mask="url(#zm)" stroke={tone(bg, accent, dark ? 0.22 : 0.18, ink)} strokeWidth={40} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'kletka') {
    // клетка 40 px: 1080 и 1440 делятся на 40, сетка на стыке совпадает сама
    const c = tone(bg, ink, dark ? 0.2 : 0.17, ink)
    let d = ''
    for (let x = (n - 1) * W; x <= n * W; x += 40) d += `M${x} 0V${H}`
    for (let y = 0; y <= H; y += 40) d += `M${(n - 1) * W} ${y}H${n * W}`
    return <svg {...box}><path d={d} stroke={c} strokeWidth={1.5} fill="none" /></svg>
  }
  if (kind === 'dymka') {
    // размытые пятна на всю карусель и зерно поверх
    const blob = tone(bg, dark ? accent : ink, dark ? 0.3 : 0.2, ink)
    const count = Math.max(3, Math.round(total * 1.6))
    const blobs = Array.from({ length: count }, (_, i) => ({
      cx: (i + 0.2 + r() * 0.6) * (W * total) / count,
      cy: H * (0.1 + r() * 0.8),
      rx: 420 + r() * 220,
      ry: 320 + r() * 200,
    }))
    return (
      <svg {...box}>
        <defs>
          {/* мягкое пятно градиентом: размытие фильтром в 3 раза дольше рендерится */}
          <radialGradient id="blob">
            <stop offset="0" stopColor={blob} stopOpacity="1" />
            <stop offset="0.3" stopColor={blob} stopOpacity="0.85" />
            <stop offset="0.55" stopColor={blob} stopOpacity="0.5" />
            <stop offset="0.8" stopColor={blob} stopOpacity="0.15" />
            <stop offset="1" stopColor={blob} stopOpacity="0" />
          </radialGradient>
          <filter id="grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed={String(variant + 1)} />
            <feColorMatrix type="matrix" values="3 0 0 0 -1  3 0 0 0 -1  3 0 0 0 -1  0 0 0 0 0.06" />
          </filter>
        </defs>
        {blobs.map((b, i) => <ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill="url(#blob)" />)}
        <rect x={(n - 1) * W} y={0} width={W} height={H} filter="url(#grain)" />
      </svg>
    )
  }

  const paths: { d: string; w: number; c: string }[] = []
  if (kind === 'lenty') {
    // толстые ленты держим у верха и низа, середина остается под текст
    const a = wave(total, H * 0.07, 55, r), b = wave(total, H * 0.955, 48, r)
    paths.push({ d: a, w: 78, c: soft }, { d: b, w: 64, c: soft })
    paths.push({ d: wave(total, H * 0.12, 90, r), w: 2, c: thin })
  } else {
    paths.push({ d: wave(total, H * 0.955, 48, r), w: 56, c: soft })
    for (let i = 0; i < 3; i++) paths.push({ d: wave(total, H * (0.2 + i * 0.3), 220 + r() * 160, r), w: 3, c: thin })
  }
  return (
    <svg width={W} height={H} viewBox={`${(n - 1) * W} 0 ${W} ${H}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      {paths.map((p, i) => <path key={i} d={p.d} stroke={p.c} strokeWidth={p.w} fill="none" strokeLinecap="round" />)}
    </svg>
  )
}
// узор для обычного однотонного фона стиля
const decorFor = (c: SlideCtx, bg = c.pal.bg, ink = c.pal.text) =>
  c.decor && c.decor !== 'none' && DECOR_STYLES.includes(c.style)
    ? <Decor kind={c.decor} n={c.slide.n} total={c.total} variant={c.variant || 0} bg={bg} ink={ink} accent={c.pal.accent} />
    : null

type TextOpts = {
  font: string
  size: number
  weight?: number
  lh: number
  color: string
  upper?: boolean
  align?: 'left' | 'center'
  accentColor?: string
  accentWeight?: number
  markerBg?: string     // выделение маркером: фон под словом
  gap?: number          // отступ между абзацами
  cursor?: string       // цвет курсора-палочки в конце текста (последний слайд Заметок)
}

// Предлоги, союзы и короткие слова не висят в конце строки: склеиваем их со следующим словом неразрывным пробелом (если кусок выходит не длиннее 10 знаков).
const NB = '\u00A0'
const SHORT = /^[«„"(]*(?:[\p{L}]{1,2}|для|без|под|над|при|про|что|как|или|где|чем)$/iu
const glueTokens = (toks: string[]) => {
  const out: string[] = []
  for (let i = 0; i < toks.length; i++) {
    const prev = out[out.length - 1]
    const lastWord = prev !== undefined ? prev.split(NB).pop() as string : ''
    // склейка не длиннее 10 знаков: длинный неразрывный кусок не влезет в строку крупным кеглем
    if (prev !== undefined && SHORT.test(lastWord) && (prev + NB + toks[i]).length <= 10) out[out.length - 1] = prev + NB + toks[i]
    else out.push(toks[i])
  }
  return out
}
const nbsp = (t: string) => glueTokens(t.split(/[ \t]+/).filter(Boolean)).join(' ')

// Абзацы через перенос строки; accent выделяется цветом, жирным или маркером.
// С block (движок fit.ts) рисуем готовые строки без переносов Satori: сколько строк посчитано, столько и будет.
function Rich({ text, accent, o, block, st, firstParaWeight }: { text?: string; accent: string | null; o: TextOpts; block?: Block; st?: TextStyle; firstParaWeight?: number }): ReactElement {
  if (block && st) return <Lines block={block} st={st} accent={accent} o={o} firstParaWeight={firstParaWeight} />
  const base = {
    fontFamily: o.font,
    fontSize: o.size,
    fontWeight: o.weight || 400,
    lineHeight: o.lh,
    color: o.color,
    textTransform: o.upper ? ('uppercase' as const) : ('none' as const),
  }
  const paras = String(text || '').split(/\n+/).map(p => p.trim()).filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: o.gap ?? Math.round(o.size * 0.5) }}>
      {paras.map((p, k) => <div key={k} style={{ display: 'flex', ...base, textAlign: o.align || 'left', justifyContent: o.align === 'center' ? 'center' : 'flex-start' }}>{nbsp(p)}</div>)}
    </div>
  )
}

const strip = (w: string) => w.toLowerCase().replace(/^[«„"'(]+|[»"'),.!?:;…]+$/g, '')
// какие слова абзаца входят в акцент: ищем фразу акцента по словам
function accentMask(words: string[], accent: string | null): boolean[] {
  const mask = words.map(() => false)
  if (!accent) return mask
  const a = accent.split(/\s+/).map(strip).filter(Boolean)
  if (!a.length) return mask
  for (let i = 0; i + a.length <= words.length; i++) {
    if (a.every((x, j) => strip(words[i + j]) === x)) { for (let j = 0; j < a.length; j++) mask[i + j] = true; return mask }
  }
  return mask
}

function Lines({ block, st, accent, o, firstParaWeight }: { block: Block; st: TextStyle; accent: string | null; o: TextOpts; firstParaWeight?: number }) {
  const size = block.size
  const lh = st.pitch ? st.pitch(size) / size : st.lh
  const justify = o.align === 'center' ? 'center' : 'flex-start'
  const gap = Math.round(size * st.paraGap)
  const wordGap = Math.round(size * 0.26)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: o.align === 'center' ? 'center' : 'flex-start' }}>
      {block.paras.map((lines, k) => {
        const words = lines.flatMap(l => lineText(l).split(' '))
        const mask = accentMask(words, accent)
        let wi = 0
        const weight = k === 0 && firstParaWeight ? firstParaWeight : (st.weight || 400)
        const base = {
          fontFamily: st.family, fontSize: size, fontWeight: weight, lineHeight: lh, color: o.color,
          textTransform: st.upper ? ('uppercase' as const) : ('none' as const), whiteSpace: 'nowrap' as const,
        }
        const mk = st.marker
        const body = (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: o.align === 'center' && !mk ? 'center' : 'flex-start' }}>
            {lines.map((l, li) => {
              const ws = lineText(l).split(' ')
              const from = wi
              wi += ws.length
              // курсор-палочка после последнего слова (Заметки)
              const caret = o.cursor && k === block.paras.length - 1 && li === lines.length - 1
                ? <div style={{ display: 'flex', width: Math.max(4, Math.round(size * 0.07)), height: Math.round(size * 1.12), background: o.cursor, marginLeft: Math.round(size * 0.05), borderRadius: 2 }} />
                : null
              if (!ws.some((_, j) => mask[from + j])) return caret
                ? <div key={li} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: justify }}><div style={{ display: 'flex', ...base }}>{lineText(l)}</div>{caret}</div>
                : <div key={li} style={{ display: 'flex', ...base, justifyContent: justify }}>{lineText(l)}</div>
              return (
                <div key={li} style={{ display: 'flex', flexDirection: 'row', justifyContent: justify, alignItems: 'center' }}>
                  {ws.map((w, j) => {
                    const acc = mask[from + j]
                    // вид акцента: цвет (как раньше), маркерная плашка под словом или подчеркивание
                    const kind = st.accentKind || 'color'
                    const ac = o.accentColor || o.color
                    const marked = acc && (o.markerBg || kind === 'marker')
                    return (
                      <span key={j} style={{
                        ...base,
                        marginRight: j < ws.length - 1 ? wordGap : 0,
                        color: acc && kind === 'color' && o.accentColor ? o.accentColor : o.color,
                        fontWeight: acc && o.accentWeight ? o.accentWeight : weight,
                        ...(marked ? { backgroundColor: kind === 'marker' ? `${ac}40` : o.markerBg, paddingLeft: 6, paddingRight: 6, marginLeft: -6, borderRadius: 6 } : {}),
                        ...(acc && kind === 'underline' ? { borderBottom: `${Math.max(4, Math.round(size * 0.07))}px solid ${ac}` } : {}),
                      }}>{w}</span>
                    )
                  })}
                  {caret}
                </div>
              )
            })}
          </div>
        )
        if (!mk) return body
        // номер в колонке слева, выровнен по первой строке пункта
        return (
          <div key={k} style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', width: mk.col, flexShrink: 0, fontFamily: mk.family, fontWeight: mk.weight || 400, fontSize: mk.big ? Math.round(size * lh * 1.9) : size, lineHeight: mk.big ? 0.95 : lh, color: o.accentColor || o.color }}>{mk.fmt(k)}</div>
            {body}
          </div>
        )
      })}
    </div>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')
// Подпись автора на обложке «Имя | психолог» вместо ника (в той же нижней зоне, без нового наложения).
// Длиннее 40 знаков: только имя. На прочих слайдах ник.
const sigOf = (c: SlideCtx) => {
  if (c.slide.n !== 1 || !c.signature || !c.name) return null
  const full = `${c.name} | психолог`
  return full.length <= 40 ? full : c.name
}
const footOf = (c: SlideCtx) => sigOf(c) || (c.handle ? `@${c.handle}` : '')
const onColor = (bg: string) => (contrast('#FFFFFF', bg) >= contrast('#111111', bg) ? '#FFFFFF' : '#111111')
const muted = (p: Palette) => mix(p.text, p.bg, 0.45)
// широкие шрифты капсом: самое длинное слово обязано влезть в строку (k: ширина буквы в долях кегля)
const fitLongest = (size: number, text: string, width: number, k = 1.12) =>
  Math.round(Math.min(size, width / (Math.max(1, ...glueTokens(text.split(/\s+/).filter(Boolean)).map(w => w.length)) * k)))
// крупная декоративная цифра: заметна на любом фоне (контраст к фону от 1.6), но не спорит с текстом
const decoInk = (bg: string, fg: string) => {
  for (let t = 0.12; t <= 0.4; t += 0.02) {
    const c = mix(bg, fg, t)
    if (contrast(c, bg) >= 1.6) return c
  }
  return mix(bg, fg, 0.4)
}

// Масштаб текста слайда и флаг «длинноват»
export function slideFit(style: TemplateStyle, s: SlideLayout): { big: number; small: number; overflow: boolean } {
  const lim = STYLES[style].limits
  const b = fitScale(s.big.length, s.n === 1 ? lim.coverBig : lim.big)
  // без крупной строки мелкий текст идет крупнее (x1.15), лимит по символам соответственно меньше
  const solo = !s.big.trim()
  const m = fitScale(s.small.length, solo ? Math.round(lim.small / 1.32) : lim.small)
  return { big: b.scale, small: m.scale * (solo ? 1.15 : 1), overflow: b.overflow || m.overflow }
}

function Arrow({ color, size = 90 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.4)} viewBox="0 0 90 36">
      <path d="M2 18 H84 M68 4 L86 18 L68 32" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'Я'
}

// ---------------- Т1. Редакция ----------------
function Redakciya(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const cover = s.n === 1
  const last = s.n === c.total
  const bg = s.n % 2 === 0 ? mix(pal.bg, pal.text, 0.05) : pal.bg
  const bigSize = Math.round((cover ? 116 : 96) * f.big)
  // бюджет акцента: полный цвет только у обложки, на теле номер, линия и стрелка приглушенные
  const deco = cover ? pal.accent : muted(pal)
  const line = <div style={{ display: 'flex', width: 180, height: 4, background: deco }} />
  const v = c.variant || 0
  // 0: номер слева сверху, текст по центру; 1: большой номер справа, текст прижат вниз; 2: все по центру
  const centered = v === 2 && !c.long
  const align = centered ? 'center' : 'left'
  return (
    <div style={{ width: W, height: H, display: 'flex', background: bg, position: 'relative' }}>
      {decorFor(c, bg)}
      {!cover && v === 0 && (
        <div style={{ position: 'absolute', top: 180, left: 80, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontFamily: 'Oswald', fontWeight: 700, fontSize: 64, lineHeight: 1, color: deco }}>{pad2(s.n)}</div>
          {line}
        </div>
      )}
      {!cover && v === 1 && <div style={{ position: 'absolute', top: 190, right: 70, display: 'flex', fontFamily: 'Oswald', fontWeight: 700, fontSize: 220, lineHeight: 1, color: decoInk(bg, pal.text) }}>{pad2(s.n)}</div>}
      {!cover && v === 2 && (
        <div style={{ position: 'absolute', top: 180, left: centered ? 0 : 80, right: centered ? 0 : undefined, display: 'flex', flexDirection: 'column', alignItems: centered ? 'center' : 'flex-start', gap: 18 }}>
          <div style={{ display: 'flex', fontFamily: 'Oswald', fontWeight: 700, fontSize: 64, lineHeight: 1, color: deco }}>{pad2(s.n)}</div>
          {line}
        </div>
      )}
      {/* текст по оптической середине колонки (чуть выше центра), без пустой половины слайда */}
      <div style={{ position: 'absolute', top: F.spec.box.y, height: F.spec.box.h, left: 80, right: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: Math.round(Math.max(0, F.spec.box.h - F.heightUsed) * 0.16), alignItems: centered ? 'center' : 'flex-start' }}>
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={s.accent} o={{ font: 'Oswald', size: bigSize, weight: 700, lh: 1, color: pal.text, upper: true, accentColor: pal.accent, gap: 20, align }} />}
        {cover && <div style={{ display: 'flex', marginTop: 44 }}>{line}</div>}
        {s.small && (
          <div style={{ display: 'flex', marginTop: s.big ? 44 : 0 }}>
            <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Onest', size: Math.round(52 * f.small), lh: 1.32, color: pal.text, accentColor: pal.accent, align }} />
          </div>
        )}
      </div>
      {footOf(c) && <div style={{ position: 'absolute', left: 80, bottom: 84, display: 'flex', fontFamily: 'Onest', fontSize: 30, color: muted(pal) }}>{footOf(c)}</div>}
      {!last && <div style={{ position: 'absolute', right: 70, bottom: 76, display: 'flex' }}><Arrow color={deco} /></div>}
    </div>
  )
}

// ---------------- Переписка ----------------
// Слайд как экран чата: крупная строка приходит сообщением, мелкая уходит ответом.
function Bubble({ text, accent, side, size, bg, color, accentColor, bold, block, st, wide }: {
  text: string; accent: string | null; side: 'left' | 'right'; size: number; bg: string; color: string; accentColor?: string; bold?: boolean; block?: Block; st?: TextStyle; wide?: boolean
}) {
  return (
    <div style={{
      // wide: пузырь обложки во всю ширину текста (820, это 76% слайда), не сжимается под короткий заголовок
      display: 'flex', alignSelf: side === 'left' ? 'flex-start' : 'flex-end', maxWidth: 820, ...(wide ? { width: 820 } : {}),
      background: bg, padding: '30px 40px', borderRadius: 44,
      ...(side === 'left' ? { borderBottomLeftRadius: 10 } : { borderBottomRightRadius: 10 }),
      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
    }}>
      <Rich block={block} st={st} text={text} accent={accent} o={{ font: 'Onest', size, weight: bold ? 700 : 400, lh: 1.3, color, accentColor, accentWeight: 700 }} />
    </div>
  )
}

function Perepiska(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const cover = s.n === 1
  // входящее сообщение: на светлом фоне почти белое, на темном чуть светлее фона, чтобы текст читался
  const inBg = isDark(pal.bg) ? mix(pal.bg, '#FFFFFF', 0.12) : mix(pal.bg, '#FFFFFF', 0.85)
  const outText = onColor(pal.accent)
  const who = c.name || (c.handle ? `@${c.handle}` : 'Психолог')
  return (
    <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: pal.bg, position: 'relative' }}>
      {decorFor(c)}
      {/* шапка чата */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '70px 60px 26px 60px', borderBottom: `2px solid ${mix(pal.bg, pal.text, 0.1)}` }}>
        {c.avatar
          ? <img src={c.avatar} width={84} height={84} style={{ width: 84, height: 84, borderRadius: 42, objectFit: 'cover' }} />
          : <div style={{ display: 'flex', width: 84, height: 84, borderRadius: 42, background: pal.accent, color: outText, alignItems: 'center', justifyContent: 'center', fontFamily: 'Onest', fontWeight: 700, fontSize: 32 }}>{initials(c.name)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', fontFamily: 'Onest', fontWeight: 700, fontSize: 32, color: pal.text }}>{who}</div>
          <div style={{ display: 'flex', fontFamily: 'Onest', fontSize: 26, color: muted(pal) }}>{(c.opts?.rubric || '').trim().slice(0, 32) || (cover ? 'печатает…' : 'в сети')}</div>
        </div>
        <div style={{ display: 'flex', marginLeft: 'auto', fontFamily: 'Onest', fontSize: 26, color: muted(pal) }}>{c.total > 1 ? `${s.n}/${c.total}` : ''}</div>
      </div>
      {/* сообщения */}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', gap: 34, padding: '40px 60px 40px 60px' }}>
        {cover ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34, width: '100%' }}>
 <Bubble wide block={s.big ? F.big : F.small} st={s.big ? F.spec.big : F.spec.small} text={s.big || s.small} accent={null} side="left" size={Math.round(72 * f.big)} bg={inBg} color={pal.text} bold />
            {/* подзаголовок обложки (кому и что внутри) вторым сообщением */}
            {s.big && s.small ? <Bubble wide block={F.small} st={F.spec.small} text={s.small} accent={null} side="left" size={Math.round(50 * f.small)} bg={inBg} color={pal.text} /> : null}
            <div style={{ display: 'flex', alignSelf: 'flex-end', gap: 14, background: pal.accent, padding: '30px 40px', borderRadius: 44, borderBottomRightRadius: 10 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ display: 'flex', width: 18, height: 18, borderRadius: 9, background: outText, opacity: 0.4 + i * 0.25 }} />)}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34, width: '100%' }}>
            {s.big ? <Bubble block={F.big} st={F.spec.big} text={s.big} accent={s.accent} side="left" size={Math.round(56 * f.big)} bg={inBg} color={pal.text} accentColor={pal.accent} bold={s.role !== 'pair'} /> : null}
            {s.small ? <Bubble block={F.small} st={F.spec.small} text={s.small} accent={s.accent} side="right" size={Math.round(50 * f.small)} bg={pal.accent} color={outText} accentColor={outText} /> : null}
          </div>
        )}
      </div>
      {/* строка ввода */}
      <div style={{ display: 'flex', margin: '0 60px 80px 60px', padding: '24px 34px', borderRadius: 40, background: inBg, fontFamily: 'Onest', fontSize: 26, color: muted(pal) }}>
        {c.handle ? `Написать @${c.handle}` : 'Сообщение'}
      </div>
    </div>
  )
}

// ---------------- Тетрадь ----------------
// Лист в линейку, текст от руки, главное слово подчеркнуто маркером. Строки текста лежат на линейке.
const ROW = 76
function Tetrad(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const cover = s.n === 1
  const rule = mix(pal.bg, '#7FA7C9', 0.35)
  const margin = mix(pal.bg, pal.accent, 0.3)
  const bigSize = Math.round((cover ? 112 : 92) * f.big)
  const smallSize = Math.round(60 * f.small)
  const v = c.variant || 0
  const cell = ROW / 2
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, position: 'relative' }}>
      {v === 1
        ? Array.from({ length: Math.ceil(H / cell) + Math.ceil(W / cell) }).map((_, i) => {
            const rows = Math.ceil(H / cell)
            return i < rows
              ? <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: (i + 1) * cell, height: 1, display: 'flex', background: rule }} />
              : <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: (i - rows + 1) * cell, width: 1, display: 'flex', background: rule }} />
          })
        : Array.from({ length: Math.floor(H / ROW) }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: (i + 1) * ROW, height: 2, display: 'flex', background: rule }} />
          ))}
      {v === 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: 130, width: 3, display: 'flex', background: margin }} />}
      {/* обложка и короткая фраза без текста («Хватит.») по оптическому центру, чуть выше середины; остальное сверху */}
      <div style={{ position: 'absolute', top: ROW * 3 - 12, left: 170, right: 80, bottom: ROW * 4, display: 'flex', flexDirection: 'column', justifyContent: cover || (s.big && !s.small) ? 'center' : 'flex-start', gap: ROW / 2, paddingBottom: !cover && s.big && !s.small ? ROW * 2 : 0 }}>
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={s.accent} o={{ font: 'Caveat', size: bigSize, weight: 700, lh: ROW / bigSize < 0.95 ? (ROW * 2) / bigSize / 1.5 : ROW / bigSize, color: pal.text, accentColor: pal.accent, gap: 0 }} />}
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Caveat', size: smallSize, lh: ROW / smallSize, color: pal.text, markerBg: mix(pal.bg, pal.accent, 0.35), gap: ROW / 2 }} />}
      </div>
      {footOf(c) && <div style={{ position: 'absolute', left: 170, bottom: ROW + 14, display: 'flex', fontFamily: 'Caveat', fontSize: 36, color: muted(pal) }}>{footOf(c)}</div>}
      <div style={{ position: 'absolute', right: 80, bottom: ROW + 14, display: 'flex', fontFamily: 'Caveat', fontSize: 40, color: muted(pal) }}>{c.total > 1 ? `${s.n}/${c.total}` : ''}</div>
    </div>
  )
}

// ---------------- Плакат ----------------
// Сочный фон и огромный текст; каждый второй слайд с перевернутыми цветами, большой номер фоном.
function Plakat(c: SlideCtx) {
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const cover = s.n === 1
  const flip = s.n % 2 === 0
  const bg = flip ? c.pal.text : c.pal.bg
  // на темном перевернутом слайде текст светлый, а не цветом фона-акцента: так читается мелкий текст
  const light = mix(c.pal.bg, '#FFFFFF', 0.8)
  const fg = flip ? (contrast(light, bg) >= 4.5 ? light : c.pal.bg) : c.pal.text
  const acc = flip ? (contrast(c.pal.accent, bg) >= 3 ? c.pal.accent : mix(fg, bg, 0.3)) : c.pal.accent
  const last = s.n === c.total
  const v = c.variant || 0
  const BOX_W = W - 140, BOX_H = H - 180 - 200
  // Unbounded широкий: самое длинное слово должно влезть в строку, иначе вылезет за край
  const longest = Math.max(1, ...glueTokens(s.big.split(/\s+/).filter(Boolean)).map(w => w.length))
  const bigSize = Math.round(Math.min((cover ? 118 : 80) * f.big, BOX_W / (longest * 1.12)))
  const smallSize = Math.round(52 * f.small)
  // сколько места займет текст (оценка по числу знаков), остаток отдаем цифре
  const estH = (t: string, size: number, lh: number, k: number) =>
    t.split(/\n+/).filter(Boolean).reduce((h, p) => h + Math.max(1, Math.ceil((p.length * k * size) / BOX_W)) * size * lh, 0)
  const textH = F.heightUsed
  // цифра уравновешивает текст: чем меньше текста, тем она крупнее; места нет, значит цифры нет
  const numSize = Math.min(380, Math.round((BOX_H - textH - 60) / 0.78))
  const showNum = !cover && numSize >= 200
  const num = showNum
    ? <div style={{ display: 'flex', alignSelf: v === 2 ? 'flex-start' : 'flex-end', fontFamily: 'Unbounded', fontWeight: 700, fontSize: numSize, lineHeight: 0.78, color: decoInk(bg, fg), marginRight: v === 2 ? 0 : -10 }}>{s.n}</div>
    : null
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 50 }}>
      {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={s.accent} o={{ font: 'Unbounded', size: bigSize, weight: 700, lh: 1.05, color: fg, upper: true, accentColor: acc, gap: 16 }} />}
      {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Onest', size: smallSize, lh: 1.3, color: fg, accentColor: acc, accentWeight: 700 }} />}
    </div>
  )
  // 0 и 2: текст сверху, цифра снизу (справа или слева); 1: цифра сверху, текст прижат вниз. Обложка: 1 внизу, остальные по центру.
  const numTop = v === 1
  return (
    <div style={{ width: W, height: H, display: 'flex', background: bg, position: 'relative' }}>
      {decorFor(c, bg, fg)}
      <div style={{ position: 'absolute', top: 180, bottom: 200, left: 70, right: 70, display: 'flex', flexDirection: 'column', justifyContent: cover ? (v === 1 ? 'flex-end' : 'center') : showNum ? 'space-between' : (numTop ? 'flex-end' : 'flex-start') }}>
        {numTop && num}
        {text}
        {!numTop && num}
      </div>
      {footOf(c) && <div style={{ position: 'absolute', left: 70, top: 90, display: 'flex', fontFamily: 'Onest', fontWeight: 700, fontSize: 30, color: fg }}>{footOf(c)}</div>}
      {!last && <div style={{ position: 'absolute', ...(v === 2 && showNum ? { right: 70 } : { left: 70 }), bottom: 86, display: 'flex' }}><Arrow color={fg} size={110} /></div>}
    </div>
  )
}

// ---------------- Моно ----------------
// Текст пишущей машинки, главная фраза капсами цветом акцента, пометка номера в скобках.
function Mono(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const cover = s.n === 1
  const line = mix(pal.bg, pal.text, 0.2)
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, position: 'relative' }}>
      {decorFor(c)}
      <div style={{ position: 'absolute', top: 110, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 22, borderBottom: `2px solid ${line}` }}>
        <div style={{ display: 'flex', fontFamily: 'PT Mono', fontSize: 28, color: muted(pal) }}>{c.total > 1 ? `[ ${pad2(s.n)} / ${pad2(c.total)} ]` : ''}</div>
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" stroke={cover ? pal.accent : muted(pal)} strokeWidth="3" fill="none" />
          <circle cx="28" cy="28" r="8" fill={cover ? pal.accent : muted(pal)} />
        </svg>
      </div>
      <div style={{ position: 'absolute', top: 230, bottom: 210, left: 80, right: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 46 }}>
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Montserrat', size: Math.round((cover ? 84 : 62) * f.big), weight: 700, lh: 1.1, color: cover ? pal.accent : pal.text, upper: true, gap: 12 }} />}
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'PT Mono', size: Math.round(44 * f.small), lh: 1.45, color: pal.text, markerBg: mix(pal.bg, pal.accent, 0.18) }} />}
      </div>
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 100, display: 'flex', justifyContent: 'space-between', paddingTop: 22, borderTop: `2px solid ${line}`, fontFamily: 'PT Mono', fontSize: 30, color: muted(pal) }}>
        <div style={{ display: 'flex' }}>{footOf(c)}</div>
        <div style={{ display: 'flex' }}>{c.total === 1 ? '' : s.n === c.total ? 'конец' : 'дальше >'}</div>
      </div>
    </div>
  )
}

// ---------------- Т2. Премиум ----------------
function splitFirstSentence(t: string): [string, string] {
  const m = t.match(/^([\s\S]*?[.!?…])(\s+[\s\S]*)?$/)
  if (!m || !m[2]) return [t, '']
  return [m[1], m[2].trim()]
}

function Premium(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const cover = s.n === 1
  const last = s.n === c.total
  const photo = c.photos.length ? c.photos[(s.n - 1) % c.photos.length] : null
  const dots = (
    <div style={{ position: 'absolute', top: 96, right: 80, display: 'flex', gap: 12 }}>
      {Array.from({ length: c.total > 1 ? c.total : 0 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: i + 1 === s.n ? pal.accent : muted(pal) }} />
      ))}
    </div>
  )
  const topArrow = c.total === 1 ? null : <div style={{ position: 'absolute', top: 88, left: 80, display: 'flex' }}><Arrow color={cover && photo ? '#FFFFFF' : pal.accent} size={70} /></div>
  const footer = (color: string) => (
    <div style={{ position: 'absolute', left: 80, right: 80, bottom: 90, display: 'flex', justifyContent: 'space-between', fontFamily: 'Manrope', fontSize: 30, color }}>
      <div style={{ display: 'flex' }}>{footOf(c)}</div>
      <div style={{ display: 'flex' }}>{last ? '' : 'Листай дальше'}</div>
    </div>
  )
  const [lead, rest] = splitFirstSentence(s.small)

  if (cover && photo) {
    return (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: pal.bg }}>
        <img src={photo} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 38%, rgba(0,0,0,0) 65%)' }} />
        <div style={{ position: 'absolute', left: 80, right: 80, bottom: 200, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Cormorant Garamond', size: Math.round(88 * f.big), weight: 600, lh: 1.05, color: '#FFFFFF', upper: true, gap: 12 }} />}
          {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={null} o={{ font: 'Manrope', size: Math.round(42 * f.small), lh: 1.4, color: '#FFFFFF' }} />}
        </div>
        {dots}
        {topArrow}
        {footer('rgba(255,255,255,0.85)')}
      </div>
    )
  }

  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: pal.bg }}>
      {decorFor(c)}
      {photo && s.photo && <img src={photo} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover', opacity: 0.12 }} />}
      <div style={{ position: 'absolute', top: 180, left: 90, right: 90, bottom: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44 }}>
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Cormorant Garamond', size: Math.round((cover ? 92 : 80) * f.big), weight: 600, lh: 1.05, color: cover ? pal.accent : pal.text, upper: true, gap: 14 }} />}
        {s.small && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* первое предложение жирнее: отдельным абзацем, движок посчитал его вместе с остальным */}
            <Rich block={F.small} st={{ ...F.spec.small, weight: 400 }} firstParaWeight={600} accent={s.accent} o={{ font: 'Manrope', size: Math.round(46 * f.small), lh: 1.4, color: pal.text, accentColor: pal.accent }} />
          </div>
        )}
      </div>
      {dots}
      {topArrow}
      {footer(muted(pal))}
    </div>
  )
}

// ---------------- Т3. Скрапбук ----------------
function Frame({ src, w, h, style }: { src: string; w: number; h: number; style: Record<string, any> }) {
  return (
    <div style={{ position: 'absolute', display: 'flex', padding: 8, background: '#FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', ...style }}>
      <img src={src} width={w} height={h} style={{ width: w, height: h, objectFit: 'cover' }} />
    </div>
  )
}

function Skrapbuk(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const photo = (k: number) => c.photos.length ? c.photos[k % c.photos.length] : null
  // без фото место под рамки не держим: текст идет на всю ширину, карточка обложки крупнее
  const has = c.photos.length > 0

  if (s.n === 1) {
    const p = photo(0)
    return (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: mix(pal.bg, pal.text, 0.08), alignItems: 'center', justifyContent: 'center' }}>
        {p && <img src={p} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />}
        <div style={{ display: 'flex', flexDirection: 'column', width: has ? 820 : 880, minHeight: has ? 300 : 520, background: pal.bg, padding: has ? '44px 48px' : '70px 64px', gap: 24, justifyContent: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.15)' }}>
          {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Unbounded', size: fitLongest((has ? 44 : 62) * f.big, s.big, has ? 664 : 752), weight: 700, lh: 1.15, color: pal.text, upper: true, gap: 8 }} />}
          {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={null} o={{ font: 'PT Mono', size: Math.round((has ? 32 : 40) * f.small), lh: 1.45, color: pal.text }} />}
        </div>
        {footOf(c) && <div style={{ position: 'absolute', left: 60, bottom: 70, display: 'flex', fontFamily: 'PT Mono', fontSize: 30, color: p ? '#FFFFFF' : muted(pal) }}>{footOf(c)}</div>}
      </div>
    )
  }

  const mirror = s.n % 2 === 1
  const k = (s.n - 1) * 2
  const p1 = photo(k), p2 = photo(k + 1)
  // без фото заголовок и текст одним блоком по центру: иначе между ними пустая дыра на полслайда
  if (!has) {
    return (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: pal.bg }}>
        <div style={{ position: 'absolute', top: 180, bottom: 200, left: 90, right: 90, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 48 }}>
          {s.big && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontFamily: 'Unbounded', fontWeight: 700, fontSize: Math.round(52 * f.big), color: muted(pal), lineHeight: 1.15 }}>{`${s.n}::`}</div>
              <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Unbounded', size: fitLongest(52 * f.big, s.big, has ? 630 : 900), weight: 700, lh: 1.15, color: pal.text, upper: true, gap: 8 }} />
            </div>
          )}
          {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'PT Mono', size: Math.round(42 * f.small), lh: 1.45, color: pal.text, accentColor: pal.accent }} />}
        </div>
        {footOf(c) && <div style={{ position: 'absolute', display: 'flex', bottom: 70, left: 90, fontFamily: 'PT Mono', fontSize: 30, color: muted(pal) }}>{footOf(c)}</div>}
      </div>
    )
  }
  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: pal.bg }}>
      {p1 && <Frame src={p1} w={240} h={300} style={mirror ? { top: 120, left: 60 } : { top: 120, right: 60 }} />}
      {p2 && <Frame src={p2} w={160} h={200} style={mirror ? { bottom: 130, right: 70 } : { bottom: 130, left: 70 }} />}
      <div style={{ position: 'absolute', top: 180, left: has && mirror ? 380 : 90, right: has && !mirror ? 380 : 90, display: 'flex' }}>
        {s.big && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'Unbounded', fontWeight: 700, fontSize: Math.round(52 * f.big), color: muted(pal), lineHeight: 1.15 }}>{`${s.n}::`}</div>
            <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Unbounded', size: fitLongest(52 * f.big, s.big, has ? 630 : 900), weight: 700, lh: 1.15, color: pal.text, upper: true, gap: 8 }} />
          </div>
        )}
      </div>
      {s.small && (
        <div style={{ position: 'absolute', top: s.big ? 500 : 180, left: has && !s.big && mirror ? 380 : 90, right: has && !s.big && !mirror ? 380 : 90, bottom: has ? 360 : 200, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'PT Mono', size: Math.round(42 * f.small), lh: 1.45, color: pal.text, accentColor: pal.accent }} />
        </div>
      )}
      {footOf(c) && <div style={{ position: 'absolute', display: 'flex', bottom: 70, ...(mirror ? { left: 70 } : { right: 70 }), fontFamily: 'PT Mono', fontSize: 30, color: muted(pal) }}>{footOf(c)}</div>}
    </div>
  )
}

// ---------------- Т4. Записка ----------------
function Zapiska(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const colored = pal.accent.toLowerCase() !== pal.text.toLowerCase()
  // короткий слайд по центру, в длинной карусели все по левому краю: заголовок и текст всегда в одну линию
  const zAlign = c.long ? 'left' : 'center'
  // мятая бумага только на родном сером фоне; свой цвет фона идет сплошным
  const paper = c.paper && pal.bg.toLowerCase() === STYLES.t_zapiska.palette.bg.toLowerCase()
  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: pal.bg }}>
      {paper && <img src={c.paper as string} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }} />}
      <div style={{ position: 'absolute', top: 180, left: 90, right: 90, bottom: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={s.accent} o={{ font: 'Montserrat', size: Math.round((s.n === 1 ? 88 : 62) * f.big), weight: 700, lh: 1.2, color: pal.text, align: zAlign, accentColor: colored ? pal.accent : undefined, gap: 12 }} />}
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Montserrat', size: Math.round(46 * f.small), lh: 1.4, color: pal.text, align: zAlign, accentWeight: 700, accentColor: colored ? pal.accent : pal.text }} />}
      </div>
      <div style={{ position: 'absolute', left: 90, bottom: 110, display: 'flex', alignItems: 'center', gap: 24 }}>
        {c.avatar
          ? <img src={c.avatar} width={96} height={96} style={{ width: 96, height: 96, borderRadius: 48, objectFit: 'cover' }} />
          : <div style={{ display: 'flex', width: 96, height: 96, borderRadius: 48, background: mix(pal.bg, pal.text, 0.15), alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat', fontWeight: 700, fontSize: 34, color: pal.text }}>{initials(c.name)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {c.name && <div style={{ display: 'flex', fontFamily: 'Montserrat', fontSize: 24, color: pal.text }}>{c.name}</div>}
          {c.handle && <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 700, fontSize: 24, color: pal.text }}>@{c.handle}</div>}
        </div>
      </div>
    </div>
  )
}

// ---------------- Заметки ----------------
// Как заметка в телефоне: шапка приложения, дата, заголовок жирным, текст как пишут себе.
function Zametki(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const F = fitOf(c)
  const th = zmTheme(c)
  const cover = s.n === 1
  const isList = s.role === 'list'
  const last = s.n === c.total
  const box = F.spec.box
  const o = (st: TextStyle, size: number) => ({ font: st.family, size, weight: st.weight, lh: st.lh, color: pal.text })
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, position: 'relative' }}>
      {ZametkiChrome({ c, date: cover })}
      <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, display: 'flex', flexDirection: 'column', gap: F.spec.gap, justifyContent: cover ? 'center' : 'flex-start', paddingBottom: cover ? Math.round(box.h * 0.08) : 0 }}>
        {s.big && <Lines block={F.big} st={F.spec.big} accent={null} o={{ ...o(F.spec.big, F.big.size), cursor: last && !s.small ? pal.accent : undefined }} />}
        {s.small && !isList && <Lines block={F.small} st={F.spec.small} accent={s.accent} o={{ ...o(F.spec.small, F.small.size), accentColor: pal.accent, markerBg: mix(pal.bg, pal.accent, 0.3), cursor: last ? pal.accent : undefined }} />}
        {s.small && isList && (
          // чек-лист как в Заметках: серые пустые кружки, первый пункт отмечен (желтый кружок с белой галочкой)
          <div style={{ display: 'flex', flexDirection: 'column', gap: Math.round(F.small.size * 0.55) }}>
            {F.small.paras.map((_, i) => {
              const d = Math.round(F.small.size * 0.82)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', width: ZM.check, flexShrink: 0, paddingTop: Math.round((F.small.size * F.spec.small.lh - d) / 2) }}>
                    {i === 0
                      ? <svg width={d} height={d} viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill={pal.accent} /><path d="M11 20.5 L17.5 27 L29 14" stroke="#FFFFFF" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      : <svg width={d} height={d} viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="none" stroke={th.circle} strokeWidth="2.6" /></svg>}
                  </div>
                  <Lines block={subBlock(F.small, i)} st={F.spec.small} accent={s.accent} o={{ ...o(F.spec.small, F.small.size), accentColor: pal.accent, markerBg: mix(pal.bg, pal.accent, 0.3) }} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Интерфейс Заметок iPhone поверх слайда: статус-бар, шапка «‹ Все iCloud» с «поделиться» и «…», дата (обложка и финал),
// внизу четыре иконки: чек-лист, камера, перо в кружке, новая заметка. Иконки нарисованы простым SVG, файлы Apple не берем.
const zmTheme = (c: SlideCtx) => ZAMETKI_THEMES[c.opts?.theme === 'dark' ? 'dark' : 'light']
export function zametkiDate(d = new Date()): string {
  const m = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][d.getMonth()]
  return `${d.getDate()} ${m} ${d.getFullYear()} г. в ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function ZametkiChrome({ c, date }: { c: SlideCtx; date: boolean }) {
  const th = zmTheme(c)
  const y = th.accent, ui = th.ui
  const icon = (key: string, d: ReactElement) => <svg key={key} width={52} height={52} viewBox="0 0 48 48" style={{ display: 'flex' }}>{d}</svg>
  const st = { stroke: y, strokeWidth: 3.2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const tools = [
    icon('l', <g {...st}><circle cx="10" cy="14" r="5" /><path d="M7.5 14 L9.5 16 L12.8 11.8" /><path d="M20 14 H42" /><circle cx="10" cy="32" r="5" /><path d="M20 32 H42" /></g>),
    icon('c', <g {...st}><path d="M6 16 H14 L17 11 H31 L34 16 H42 V38 H6 Z" /><circle cx="24" cy="26" r="7" /></g>),
    icon('p', <g {...st}><circle cx="24" cy="24" r="19" /><path d="M18 34 L24 14 L30 34 M20.5 27 H27.5" /></g>),
    icon('n', <g {...st}><path d="M38 26 V40 H8 V10 H22" /><path d="M20 28 L21.5 22 L36 7.5 L40.5 12 L26 26.5 Z" /></g>),
  ]
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex' }}>
      {/* статус-бар */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: 18, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontFamily: 'Onest', fontWeight: 700, fontSize: 32, color: ui, paddingLeft: 24 }}>09:41</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width={40} height={26} viewBox="0 0 40 26"><rect x="0" y="17" width="7" height="9" rx="1.5" fill={ui} /><rect x="10.5" y="12" width="7" height="14" rx="1.5" fill={ui} /><rect x="21" y="6" width="7" height="20" rx="1.5" fill={ui} /><rect x="31.5" y="0" width="7" height="26" rx="1.5" fill={ui} /></svg>
          <svg width={36} height={26} viewBox="0 0 36 26"><path d="M2 9 Q18 -4 34 9" stroke={ui} strokeWidth="3.6" fill="none" strokeLinecap="round" /><path d="M8 15 Q18 7 28 15" stroke={ui} strokeWidth="3.6" fill="none" strokeLinecap="round" /><circle cx="18" cy="21.5" r="3.2" fill={ui} /></svg>
          <svg width={56} height={26} viewBox="0 0 56 26"><rect x="1.5" y="1.5" width="46" height="23" rx="6" stroke={ui} strokeOpacity="0.4" strokeWidth="2.4" fill="none" /><rect x="5" y="5" width="39" height="16" rx="3.5" fill={ui} /><rect x="50" y="9" width="4" height="8" rx="2" fill={ui} fillOpacity="0.4" /></svg>
        </div>
      </div>
      {/* шапка */}
      <div style={{ position: 'absolute', left: 50, right: 60, top: 82, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={30} height={44} viewBox="0 0 30 44"><path d="M22 6 L6 22 L22 38" stroke={y} strokeWidth="4.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div style={{ display: 'flex', fontFamily: 'Onest', fontSize: 40, color: y }}>Все iCloud</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
          {icon('s', <g {...st}><path d="M15 20 H11 V42 H37 V20 H33" /><path d="M24 30 V5 M16 12 L24 4.5 L32 12" /></g>)}
          {icon('m', <g><circle cx="24" cy="24" r="19" stroke={y} strokeWidth="3.2" fill="none" /><circle cx="15.5" cy="24" r="2.8" fill={y} /><circle cx="24" cy="24" r="2.8" fill={y} /><circle cx="32.5" cy="24" r="2.8" fill={y} /></g>)}
        </div>
      </div>
      {date && <div style={{ position: 'absolute', left: 0, right: 0, top: ZM.textTop + 6, display: 'flex', justifyContent: 'center', fontFamily: 'Onest', fontSize: 30, color: th.date }}>{zametkiDate()}</div>}
      {/* нижняя панель: четыре иконки на равных расстояниях */}
      <div style={{ position: 'absolute', left: 70, right: 70, bottom: 34, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{tools}</div>
    </div>
  )
}

// ---------------- Стикеры ----------------
// Стикер с текстом от руки, приклеен скотчем, чуть повернут. Цвет стикера это акцент палитры.
function Stikery(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const v = c.variant || 0
  const tilt = [[-2.2, 1.6, -1.2, 2.4, -1.8], [1.8, -1.4, 2.2, -2.0, 1.2], [0, -1.2, 1.2, -0.6, 0.8]][v][(s.n - 1) % 5]
  // соседние стикеры чуть разного оттенка, как из одной пачки
  const soft = mix(pal.accent, pal.bg, 0.45)
  const sticker = s.n === 1 ? pal.accent : contrast(pal.text, soft) >= 4.5 ? soft : pal.accent
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {decorFor(c)}
      <div style={{ display: 'flex', flexDirection: 'column', width: 860, minHeight: 820, background: sticker, padding: '110px 80px 90px 80px', gap: 40, justifyContent: 'center', transform: `rotate(${tilt}deg)`, boxShadow: '0 18px 30px rgba(0,0,0,0.14)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -34, left: 300, width: 260, height: 68, display: 'flex', background: 'rgba(255,255,255,0.55)', transform: 'rotate(-3deg)' }} />
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Caveat', size: Math.round((s.n === 1 ? 108 : 88) * f.big), weight: 700, lh: 1.05, color: pal.text, gap: 6 }} />}
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Caveat', size: Math.round(60 * f.small), lh: 1.2, color: pal.text, accentWeight: 700 }} />}
      </div>
      {footOf(c) && <div style={{ position: 'absolute', left: 80, bottom: 90, display: 'flex', fontFamily: 'Caveat', fontSize: 40, color: muted(pal) }}>{footOf(c)}</div>}
      <div style={{ position: 'absolute', right: 80, bottom: 90, display: 'flex', fontFamily: 'Caveat', fontSize: 40, color: muted(pal) }}>{c.total > 1 ? `${s.n}/${c.total}` : ''}</div>
    </div>
  )
}

// ---------------- Цитата ----------------
// Огромные кавычки, крупная фраза антиквой, пояснение ниже. Кавычки меняют место по варианту.
function Citata(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const v = c.variant || 0
  const center = v === 1 && !c.long
  const quote = <div style={{ display: 'flex', fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 400, lineHeight: 1, color: pal.accent, height: 200, marginBottom: -40 }}>“</div>
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, position: 'relative' }}>
      {decorFor(c)}
      <div style={{ position: 'absolute', top: 170, bottom: 220, left: 90, right: 90, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: center ? 'center' : 'flex-start', gap: 40 }}>
        {v !== 2 && s.n === 1 && quote}
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Cormorant Garamond', size: Math.round((s.n === 1 ? 96 : 76) * f.big), weight: 600, lh: 1.1, color: pal.text, align: center ? 'center' : 'left', gap: 12 }} />}
        <div style={{ display: 'flex', width: 90, height: 3, background: s.n === 1 ? pal.accent : muted(pal) }} />
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Manrope', size: Math.round(46 * f.small), lh: 1.4, color: pal.text, accentColor: pal.accent, accentWeight: 600, align: center ? 'center' : 'left' }} />}
      </div>
      {v === 2 && <div style={{ position: 'absolute', right: 40, bottom: 10, display: 'flex', fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 560, lineHeight: 1, color: mix(pal.bg, pal.accent, 0.25) }}>”</div>}
      <div style={{ position: 'absolute', left: 90, right: 90, bottom: 100, display: 'flex', justifyContent: 'space-between', fontFamily: 'Manrope', fontSize: 30, color: muted(pal) }}>
        <div style={{ display: 'flex' }}>{footOf(c)}</div>
        <div style={{ display: 'flex' }}>{c.total > 1 ? `${s.n} / ${c.total}` : ''}</div>
      </div>
    </div>
  )
}

// ---------------- Словарь ----------------
// Как статья в словаре: слово крупно, под ним толкование с номером. Колонтитул и номер страницы.
function Slovar(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const v = c.variant || 0
  const rule = mix(pal.bg, pal.text, 0.25)
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, position: 'relative' }}>
      {decorFor(c)}
      <div style={{ position: 'absolute', top: 110, left: 90, right: 90, display: 'flex', justifyContent: 'space-between', paddingBottom: 18, borderBottom: `2px solid ${rule}`, fontFamily: 'Manrope', fontSize: 24, color: muted(pal) }}>
        <div style={{ display: 'flex' }}>{c.handle ? `@${c.handle}` : c.name}</div>
        <div style={{ display: 'flex' }}>{s.n === 1 ? '' : `${s.n}`}</div>
      </div>
      <div style={{ position: 'absolute', top: 220, bottom: 200, left: 90, right: 90, display: 'flex', flexDirection: 'row', gap: 40 }}>
        {v !== 2 && <div style={{ display: 'flex', width: 10, background: s.n === 1 ? pal.accent : muted(pal), borderRadius: 5 }} />}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: v === 1 ? 'flex-start' : 'center', gap: 36, flexGrow: 1, flexShrink: 1 }}>
          {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Cormorant Garamond', size: Math.round((s.n === 1 ? 104 : 84) * f.big), weight: 600, lh: 1.05, color: pal.text, gap: 8 }} />}
          {s.big && s.small && <div style={{ display: 'flex', width: 140, height: 2, background: rule }} />}
          {s.small && (
            <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Manrope', size: Math.round(46 * f.small), lh: 1.4, color: pal.text, accentColor: pal.accent, accentWeight: 600 }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------- Доска ----------------
// Мелом на школьной доске: деревянная рамка, текст от руки, главное подчеркнуто желтым мелом.
function Doska(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const v = c.variant || 0
  const texture = c.chalk && pal.bg.toLowerCase() === STYLES.t_doska.palette.bg.toLowerCase()
  const frame = v === 2 ? 0 : 30
  return (
    <div style={{ width: W, height: H, display: 'flex', background: v === 1 ? '#6B4A2E' : '#8B5E3C', position: 'relative' }}>
      <div style={{ position: 'absolute', top: frame, left: frame, right: frame, bottom: frame, display: 'flex', background: pal.bg }}>
        {texture && <img src={c.chalk as string} width={W} height={H} style={{ position: 'absolute', top: -frame, left: -frame, width: W, height: H }} />}
      </div>
      <div style={{ position: 'absolute', top: 190, bottom: 230, left: 110, right: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44 }}>
        {s.big && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Neucha', size: Math.round((s.n === 1 ? 104 : 84) * f.big), lh: 1.1, color: pal.text, gap: 8 }} />
            <svg width="420" height="24" viewBox="0 0 420 24"><path d="M4 16 C 80 4, 160 22, 240 10 S 380 6, 416 14" stroke={s.n === 1 ? pal.accent : mix(pal.text, pal.bg, 0.6)} strokeWidth="6" fill="none" strokeLinecap="round" /></svg>
          </div>
        )}
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Neucha', size: Math.round(54 * f.small), lh: 1.3, color: pal.text, accentColor: pal.accent }} />}
      </div>
      {footOf(c) && <div style={{ position: 'absolute', left: 110, bottom: 100, display: 'flex', fontFamily: 'Neucha', fontSize: 34, color: mix(pal.text, pal.bg, 0.4) }}>{footOf(c)}</div>}
      <div style={{ position: 'absolute', right: 110, bottom: 100, display: 'flex', fontFamily: 'Neucha', fontSize: 36, color: mix(pal.text, pal.bg, 0.4) }}>{c.total > 1 ? `${s.n}/${c.total}` : ''}</div>
    </div>
  )
}

// ---------------- Воздух ----------------
// Много пустого места: тонкая рамка, текст по центру небольшим кеглем, номер внизу.
function Vozduh(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const f = slideFit(c.style, s)
  const F = fitOf(c)
  const v = c.variant || 0
  const line = mix(pal.bg, pal.text, 0.3)
  const align = v === 1 || c.long ? 'left' : 'center'
  return (
    <div style={{ width: W, height: H, display: 'flex', background: pal.bg, position: 'relative' }}>
      {decorFor(c)}
      {v !== 2 && <div style={{ position: 'absolute', top: 60, left: 60, right: 60, bottom: 60, display: 'flex', border: `2px solid ${line}` }} />}
      <div style={{ position: 'absolute', top: 220, bottom: 240, left: 150, right: 150, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start', gap: 44 }}>
        {s.big && <Rich block={F.big} st={F.spec.big} text={s.big} accent={null} o={{ font: 'Cormorant Garamond', size: Math.round((s.n === 1 ? 84 : 66) * f.big), weight: 600, lh: 1.15, color: pal.text, align, gap: 10 }} />}
        <div style={{ display: 'flex', width: 60, height: 2, background: pal.accent }} />
        {s.small && <Rich block={F.small} st={F.spec.small} text={s.small} accent={s.accent} o={{ font: 'Manrope', size: Math.round(44 * f.small), lh: 1.5, color: pal.text, accentColor: pal.accent, align }} />}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 110, display: 'flex', justifyContent: 'center', fontFamily: 'Manrope', fontSize: 30, color: muted(pal) }}>
        {sigOf(c) || (c.total === 1 ? (c.handle ? `@${c.handle}` : '') : c.handle ? `${s.n}   ·   @${c.handle}` : `${s.n}`)}
      </div>
    </div>
  )
}

// ---------------- Оболочка стиля для стоп-слайда и финала ----------------
// Общая схема содержимого, но подложка родная: линовка тетради, мятая бумага записки, мел и рамка доски,
// рамка воздуха, шапка заметок, шапка и строка ввода переписки, стикер. Иначе на финале стиль пропадает.
type Inset = { x: number; y: number; w: number; h: number }
const DEFAULT_INSET: Inset = { x: 110, y: 150, w: W - 220, h: H - 300 }
function Shell({ c, mode, bg, children }: { c: SlideCtx; mode: 'stop' | 'final' | 'dialog'; bg: string; children: (inset: Inset) => ReactElement }) {
  const { pal } = c
  const st = c.style
  let inset = DEFAULT_INSET
  const layers: ReactElement[] = []
  if (st === 't_tetrad') {
    const rule = mix(bg, '#7FA7C9', 0.35)
    for (let k = 0; k < Math.floor(H / ROW); k++) layers.push(<div key={'r' + k} style={{ position: 'absolute', left: 0, right: 0, top: (k + 1) * ROW, height: 2, display: 'flex', background: rule }} />)
    layers.push(<div key="m" style={{ position: 'absolute', top: 0, bottom: 0, left: 130, width: 3, display: 'flex', background: mix(bg, pal.accent, 0.3) }} />)
    inset = { x: 170, y: 160, w: W - 250, h: H - 320 }
  } else if (st === 't_zapiska' && c.paper && pal.bg.toLowerCase() === STYLES.t_zapiska.palette.bg.toLowerCase() && bg === pal.bg) {
    layers.push(<img key="p" src={c.paper} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }} />)
  } else if (st === 't_doska') {
    const texture = c.chalk && pal.bg.toLowerCase() === STYLES.t_doska.palette.bg.toLowerCase()
    layers.push(<div key="w" style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', background: '#8B5E3C' }} />)
    layers.push(<div key="b" style={{ position: 'absolute', top: 30, left: 30, right: 30, bottom: 30, display: 'flex', background: pal.bg }}>{texture && <img src={c.chalk as string} width={W} height={H} style={{ position: 'absolute', top: -30, left: -30, width: W, height: H }} />}</div>)
    inset = { x: 130, y: 170, w: W - 260, h: H - 340 }
  } else if (st === 't_vozduh') {
    layers.push(<div key="f" style={{ position: 'absolute', top: 60, left: 60, right: 60, bottom: 60, display: 'flex', border: `2px solid ${mix(bg, pal.text, 0.3)}` }} />)
    inset = { x: 150, y: 170, w: W - 300, h: H - 340 }
  } else if (st === 't_zametki') {
    // стоп-слайд, финал и диалог в том же интерфейсе Заметок, дата только на финале
    layers.push(<div key="zm" style={{ display: 'flex' }}>{ZametkiChrome({ c, date: mode === 'final' })}</div>)
  } else if (st === 't_perepiska') {
    const inBg = isDark(pal.bg) ? mix(pal.bg, '#FFFFFF', 0.12) : mix(pal.bg, '#FFFFFF', 0.85)
    layers.push(
      <div key="h" style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 22, padding: '70px 60px 26px 60px', borderBottom: `2px solid ${mix(pal.bg, pal.text, 0.1)}` }}>
        <div style={{ display: 'flex', width: 84, height: 84, borderRadius: 42, background: mix(pal.bg, pal.accent, 0.25), alignItems: 'center', justifyContent: 'center', fontFamily: 'Onest', fontWeight: 700, fontSize: 32, color: pal.text }}>{initials(c.name)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', fontFamily: 'Onest', fontWeight: 700, fontSize: 32, color: pal.text }}>{c.name || (c.handle ? `@${c.handle}` : 'Психолог')}</div>
          <div style={{ display: 'flex', fontFamily: 'Onest', fontSize: 26, color: muted(pal) }}>в сети</div>
        </div>
      </div>)
    layers.push(<div key="i" style={{ position: 'absolute', left: 60, right: 60, bottom: 80, display: 'flex', padding: '24px 34px', borderRadius: 40, background: inBg, fontFamily: 'Onest', fontSize: 30, color: muted(pal) }}>{c.handle ? `Написать @${c.handle}` : 'Сообщение'}</div>)
    inset = { x: 110, y: 260, w: W - 220, h: H - 260 - 230 }
  } else if (st === 't_stikery' && mode === 'final') {
    const sticker = mix(pal.accent, pal.bg, 0.45)
    const surf = contrast(pal.text, sticker) >= 4.5 ? sticker : pal.accent
    layers.push(<div key="s" style={{ position: 'absolute', left: 90, top: 120, width: W - 180, height: H - 280, display: 'flex', background: surf, transform: 'rotate(-1.2deg)', boxShadow: '0 18px 30px rgba(0,0,0,0.14)' }} />)
    layers.push(<div key="t" style={{ position: 'absolute', top: 92, left: 410, width: 260, height: 68, display: 'flex', background: 'rgba(255,255,255,0.55)', transform: 'rotate(-3deg)' }} />)
    inset = { x: 160, y: 200, w: W - 320, h: H - 420 }
  } else if (st !== 't_zapiska') {
    const d = decorFor(c, bg)
    if (d) layers.push(<div key="d" style={{ display: 'flex' }}>{d}</div>)
  }
  // поля берутся из spec.ts (shellInset): по ним же финал подбирает масштаб и автоотчет проверяет
  inset = shellInset(st, mode)
  return (
    <div style={{ width: W, height: H, display: 'flex', background: bg, position: 'relative' }}>
      {layers}
      {children(inset)}
    </div>
  )
}

// ---------------- Стоп-слайд ----------------
// Короткая сильная фраза крупно на акцентном фоне (или в перевернутой палитре, если на акценте текст не читается).
// Не чаще одного раза на карусель (layout.ts withRhythm). Шрифт заголовка стиля, без номера и мелкого текста.
// крупный жирный текст читается от контраста 3; не вышло на акценте, значит инверсия палитры
function stopColors(p: Palette, style: TemplateStyle): { bg: string; fg: string; line: boolean } {
  // тетрадь, доска, воздух и переписка без заливки: свой фон; у первых трех линия акцента под фразой
  if (style === 't_tetrad' || style === 't_doska') return { bg: p.bg, fg: p.text, line: true }
  if (style === 't_vozduh') return { bg: mix(p.bg, p.accent, 0.12), fg: p.text, line: true }
  if (style === 't_perepiska' || style === 't_zametki') return { bg: p.bg, fg: p.text, line: false }
  for (const fg of [onColor(p.accent), p.bg, p.text]) if (contrast(fg, p.accent) >= 3) return { bg: p.accent, fg, line: false }
  return { bg: p.text, fg: p.bg, line: false }
}
function StopSlide(c: SlideCtx) {
  const F = fitOf(c)
  const { bg, fg, line } = stopColors(c.pal, c.style)
  const box = F.spec.box
  const chat = c.style === 't_perepiska'
  const text = <Rich block={F.big} st={F.spec.big} accent={null} o={{ font: F.spec.big.family, size: F.big.size, lh: F.spec.big.lh, color: chat ? onColor(c.pal.accent) : fg }} />
  return (
    Shell({ c, mode: 'stop', bg, children: () => (
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex' }}>
        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: Math.round(Math.max(0, box.h - F.heightUsed) * 0.16) }}>
          {/* в переписке стоп это одно большое исходящее сообщение цвета акцента */}
          {chat
            ? <div style={{ display: 'flex', alignSelf: 'flex-end', background: c.pal.accent, padding: '40px 48px', borderRadius: 52, borderBottomRightRadius: 12 }}>{text}</div>
            : text}
          {line && <div style={{ display: 'flex', width: 220, height: 8, borderRadius: 4, background: c.pal.accent, marginTop: 36 }} />}
        </div>
        {!chat && c.style !== 't_zametki' && c.handle && <div style={{ position: 'absolute', left: box.x, bottom: 150, display: 'flex', fontFamily: F.spec.small.family, fontSize: 30, color: mix(fg, bg, 0.3) }}>@{c.handle}</div>}
        {!chat && c.style !== 't_zametki' && c.total > 1 && <div style={{ position: 'absolute', right: 110, bottom: 150, display: 'flex', fontFamily: F.spec.small.family, fontSize: 30, color: mix(fg, bg, 0.3) }}>{`${c.slide.n}/${c.total}`}</div>}
      </div>
    ) })
  )
}

// ---------------- Диалог ----------------
// Двое внизу (клиент слева, психолог справа, смотрят друг на друга), над ними пузыри реплик.
// Геометрия и кегль из spec.ts fitDialogs, подложка стиля через Shell. Человечки в цвет текста, заливка в цвет фона.
function bubbleFill(p: Palette, to: string, t: number): string {
  for (let k = t; k >= 0; k -= 0.04) { const f = mix(p.bg, to, k); if (contrast(p.text, f) >= 4.5) return f }
  return p.bg
}
function DialogSlide(c: SlideCtx) {
  const sc = { variant: c.variant || 0, long: !!c.long, hasPhotos: c.photos.length > 0, hasAvatar: !!c.avatar, fontPair: c.fontPair || 0, opts: c.opts }
  const all = c.all && c.all.length === c.total ? c.all : [c.slide]
  const D = fitDialogs(c.style, all, sc)[c.all && c.all.length === c.total ? c.slide.n - 1 : 0]
  const rs = parseDialog(`${c.slide.big}\n${c.slide.small}`)
  if (!D || !rs) return renderStyle(c)
  const { pal } = c
  const poses = slidePoses(rs, c.slide.pose, c.slide.n)
  const fillA = bubbleFill(pal, pal.text, 0.08)
  const fillB = bubbleFill(pal, pal.accent, 0.22)
  // рукописные стили и записка: пузырь контуром, как нарисованный. Яркий фон (Плакат) тоже контуром:
  // тон фона в пузыре там плывет. Остальные заливкой, если заливка отделяется от фона
  const outline = HAND.has(D.st.family) || c.style === 't_zapiska' || c.style === 't_plakat' || contrast(fillA, pal.bg) < 1.08 || contrast(fillB, pal.bg) < 1.08
  const line = mix(pal.text, pal.bg, 0.25)
  // бледный акцент (желтый на светлом) контуром не читается: темним к цвету текста
  const lineB = contrast(pal.accent, pal.bg) >= 2 ? pal.accent : mix(pal.accent, pal.text, 0.45)
  const BORDER = 3
  // хвостик только у последней реплики подряд одного человека, смотрит вниз к его фигуре
  const tail = (i: number) => !D.bubbles[i + 1] || D.bubbles[i + 1].who !== D.bubbles[i].who
  return Shell({ c, mode: 'dialog', bg: pal.bg, children: () => (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex' }}>
      {dialogHasFigures(c.style) && (['a', 'b'] as const).map(who => {
        const f = D.figs[who]
        return <img key={who} src={peepUrl(who, poses[who], pal.text, pal.bg)} width={f.w} height={f.h} style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h }} />
      })}
      {D.bubbles.map((b, i) => {
        const mine = b.who === 'a'
        const fill = outline ? pal.bg : mine ? fillA : fillB
        const stroke = mine ? line : lineB
        const tw = 34, th = 26
        const tx = mine ? b.x + 44 : b.x + b.w - 44 - tw
        const d = mine ? `M0 0 L4 ${th} L${tw} 0` : `M0 0 L${tw - 4} ${th} L${tw} 0`
        return (
          <div key={i} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex' }}>
            <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, display: 'flex', borderRadius: 40,
              // контур входит в размер пузыря: отступ внутри меньше на толщину линии, иначе текст вылезает
              padding: outline ? `${D.padY - BORDER}px ${D.padX - BORDER}px` : `${D.padY}px ${D.padX}px`,
              background: fill, ...(outline ? { border: `${BORDER}px solid ${stroke}` } : {}) }}>
              <Lines block={b.block} st={D.st} accent={null} o={{ font: D.st.family, size: D.size, lh: D.st.lh, color: pal.text }} />
            </div>
            {tail(i) && (
              <svg width={tw} height={th + BORDER} viewBox={`0 ${-BORDER} ${tw} ${th + BORDER}`} style={{ position: 'absolute', left: tx, top: b.y + b.h - BORDER }}>
                <path d={d} fill={fill} stroke={outline ? stroke : 'none'} strokeWidth={BORDER} strokeLinejoin="round" />
                {/* закрываем линию контура пузыря в месте, где из него выходит хвостик */}
                {outline && <rect x={BORDER} y={-BORDER} width={tw - 2 * BORDER} height={BORDER + 1} fill={fill} />}
              </svg>
            )}
          </div>
        )
      })}
    </div>
  ) })
}

// ---------------- Финал «кто я» ----------------
// Карусель часто видят не подписчики (рекомендации, пересылка): в конце всегда кто это говорит.
// Одна колонка по оптической середине: фото или инициалы, имя, строка о себе, ник, линия, призыв (из текста слайда).
// Закрывающая фраза крупнее имени: главное на слайде она. Призыв: кодовое слово на пилюле, вопрос, подписка или тихий финал.
const HAND = new Set(['Caveat', 'Neucha', 'Bad Script', 'Marck Script'])
function readable(p: Palette, bg: string): string {
  for (const t of [0.25, 0.15, 0]) { const c = mix(p.text, bg, t); if (contrast(c, bg) >= 4.5) return c }
  return p.text
}
function FinalSlide(c: SlideCtx) {
  const { pal } = c
  const s = c.slide
  const bg = pal.bg
  const sc = { variant: c.variant || 0, long: !!c.long, hasPhotos: c.photos.length > 0, fontPair: c.fontPair || 0 }
  const about = (c.about || 'Психолог').slice(0, 90)
  // все кегли финала из одного масштаба (spec.ts finalSizes): чем свободнее слайд, тем крупнее
  // предел: заголовок обложки этой карусели (обложка самый крупный текст)
  const capBig = c.all && c.all.length === c.total && c.all[0]?.n === 1 ? fitCarousel(c.style, c.all, { ...sc, hasAvatar: !!c.avatar, opts: c.opts }).at(0)?.big.size ?? Infinity : Infinity
  const Z = finalSizes(c.style, s, c.total, sc, { about, name: c.name, handle: !!c.handle }, capBig)
  const head = Z.head
  const cta = ctaOf(`${s.big} ${s.small}`)
  const sub = readable(pal, bg)
  // строка о себе почти цветом текста: серая и бледная на телефоне не читалась (контраст от 4.5 гарантирован)
  const aboutColor = aboutInk(pal, bg)
  // в Заметках в конце последнего текста желтый курсор, как в набранной заметке
  const caretC = c.style === 't_zametki' ? pal.accent : undefined
  const photo = c.avatar || c.photos[0] || null
  const text = `${s.big} ${s.small}`.trim()
  return (
    Shell({ c, mode: 'final', bg, children: (inset) => {
      const w = inset.w
      const part = (t: string, size: number, st = head.small) => layoutBlock(t, st, size, w)
      const longCode = !!cta.code && cta.code.length > 12
      const lead = cta.kind === 'question' ? text : text.match(/^[\s\S]*?[.!?…](?=\s|$)/)?.[0] || text
      const rest = cta.kind === 'question' ? '' : text.slice(lead.length).trim()
      return (
        <div style={{ position: 'absolute', left: inset.x, top: inset.y, width: w, height: inset.h, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: Z.gap }}>
            {photo
              ? <img src={photo} width={Z.photo} height={Z.photo} style={{ width: Z.photo, height: Z.photo, borderRadius: Z.photo / 2, objectFit: 'cover' }} />
              : <div style={{ display: 'flex', width: Z.photo, height: Z.photo, borderRadius: Z.photo / 2, background: mix(bg, pal.accent, 0.25), alignItems: 'center', justifyContent: 'center', fontFamily: head.big.family, fontWeight: head.big.weight || 700, fontSize: Math.round(Z.photo * 0.4), color: pal.text }}>{initials(c.name)}</div>}
            {c.name && <div style={{ display: 'flex', fontFamily: head.big.family, fontWeight: head.big.weight || 700, fontSize: Z.name, lineHeight: 1.1, color: pal.text, marginTop: Math.round(Z.gap / 2) }}>{c.name}</div>}
            <Lines block={part(about, Z.about)} st={head.small} accent={null} o={{ font: head.small.family, size: Z.about, lh: head.small.lh, color: aboutColor }} />
            {c.handle && <div style={{ display: 'flex', fontFamily: head.small.family, fontSize: Z.handle, color: sub }}>@{c.handle}</div>}
          </div>
          <div style={{ display: 'flex', width: 160, height: 5, background: pal.accent, borderRadius: 3, marginTop: Z.line, marginBottom: Z.line }} />
          {cta.kind === 'code' && cta.code ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              {cta.before && <Lines block={part(cta.before, Z.before)} st={head.small} accent={null} o={{ font: head.small.family, size: Z.before, lh: head.small.lh, color: pal.text }} />}
              <div style={{ display: 'flex', alignSelf: 'flex-start', ...(longCode ? { background: mix(bg, pal.accent, 0.3), borderRadius: 10, padding: '6px 14px' } : { background: pal.accent, borderRadius: 999, padding: `${Math.round(Z.pill * 0.22)}px ${Math.round(Z.pill * 0.5)}px`, minWidth: PILL_MIN_W, justifyContent: 'center' }),
                fontFamily: head.big.family, fontWeight: head.big.weight || 700, fontSize: Z.pill, lineHeight: 1, color: longCode ? pal.text : onColor(pal.accent), textTransform: 'uppercase' }}>{cta.code}</div>
              {cta.after && <Lines block={part(cta.after, Z.after)} st={head.small} accent={null} o={{ font: head.small.family, size: Z.after, lh: head.small.lh, color: sub, cursor: caretC }} />}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <Lines block={part(lead, Z.lead, Z.leadSt as TextStyle)} st={Z.leadSt as TextStyle} accent={null} o={{ font: head.big.family, size: Z.lead, lh: Z.leadSt.lh, color: pal.text, cursor: rest ? undefined : caretC }} />
              {rest && <Lines block={part(rest, Z.rest)} st={head.small} accent={s.accent} o={{ font: head.small.family, size: Z.rest, lh: head.small.lh, color: pal.text, accentColor: pal.accent, cursor: caretC }} />}
              {cta.kind === 'question' && <div style={{ display: 'flex', fontFamily: head.small.family, fontSize: Z.rest, color: sub }}>Пиши в комментариях</div>}
              {cta.kind === 'subscribe' && c.handle && <div style={{ display: 'flex', alignSelf: 'flex-start', background: pal.accent, borderRadius: 999, padding: `${Math.round(Z.rest * 0.35)}px ${Math.round(Z.rest * 0.85)}px`, fontFamily: head.small.family, fontWeight: 700, fontSize: Z.rest, color: onColor(pal.accent) }}>@{c.handle}</div>}
            </div>
          )}
        </div>
      )
    } })
  )
}

// ---------------- Фото на весь слайд, текст на плашках-полосках ----------------
// Как в живых каруселях: каждая строка заголовка на своей полоске (светлая полоса, темный текст), мелкий текст одной плашкой.
function PhotoStrips(c: SlideCtx) {
  const F = fitOf(c)
  const s = c.slide
  const photo = c.photos[0]
  const box = F.spec.box
  const stripBg = '#FFFFFF', stripInk = '#111111'
  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: c.pal.bg }}>
      <img src={photo} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />
      <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w + 40, height: box.h, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10 }}>
        {F.big.paras.flat().map((l, i) => (
          <div key={i} style={{ display: 'flex', alignSelf: 'flex-start', background: stripBg, padding: '6px 20px', fontFamily: F.spec.big.family, fontWeight: F.spec.big.weight || 700, fontSize: F.big.size, lineHeight: 1.15, color: stripInk, textTransform: F.spec.big.upper ? 'uppercase' : 'none', whiteSpace: 'nowrap' }}>{lineText(l)}</div>
        ))}
        {s.small && (
          <div style={{ display: 'flex', alignSelf: 'flex-start', marginTop: 14, background: stripInk, padding: '14px 20px' }}>
            <Rich block={F.small} st={F.spec.small} accent={null} o={{ font: F.spec.small.family, size: F.small.size, lh: F.spec.small.lh, color: stripBg }} />
          </div>
        )}
      </div>
      {footOf(c) && <div style={{ position: 'absolute', left: 80, bottom: 110, display: 'flex', fontFamily: F.spec.small.family, fontSize: 30, color: '#FFFFFF' }}>{footOf(c)}</div>}
    </div>
  )
}

// Метка рубрики («Разбор фразы», «Вопрос из директа»): маленькая надпись сверху, психолог задает ее один раз
function withRubric(c: SlideCtx, el: ReactElement): ReactElement {
  const r = (c.opts?.rubric || '').trim().slice(0, 32)
  if (!r || c.slide.role === 'final' || c.style === 't_perepiska') return el
  const rect = rubricRect(c.style)
  const center = c.style === 't_premium' || c.style === 't_zametki'
  const right = c.style === 't_plakat'
  const onPhoto = !!(c.opts?.coverPhoto && c.photos.length && (c.slide.n === 1 || c.slide.role === 'stop'))
  const color = onPhoto ? '#FFFFFF' : muted(c.pal)
  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative' }}>
      {el}
      <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : right ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', border: `2px solid ${color}`, borderRadius: 999, padding: '4px 16px', background: onPhoto ? 'rgba(0,0,0,0.35)' : c.pal.bg, fontFamily: 'Onest', fontWeight: 700, fontSize: 22, letterSpacing: 1.5, textTransform: 'uppercase', color }}>{r}</div>
      </div>
    </div>
  )
}

export function renderSlide(c: SlideCtx): ReactElement {
  // Заметки: цвета iOS по теме, свои цвета не применяются (иначе стиль не узнается), рубрики нет (она на месте статус-бара)
  if (c.style === 't_zametki') {
    const t = ZAMETKI_THEMES[c.opts?.theme === 'dark' ? 'dark' : 'light']
    return renderBase({ ...c, pal: { bg: t.bg, text: t.text, accent: t.accent }, decor: 'none' })
  }
  return withRubric(c, renderBase(c))
}
function renderBase(c: SlideCtx): ReactElement {
  if (c.opts?.coverPhoto && c.photos.length && (c.slide.n === 1 || c.slide.role === 'stop')) return PhotoStrips(c)
  if (c.slide.role === 'stop') return StopSlide(c)
  if (c.slide.role === 'final' && c.slide.n === c.total && c.total > 1) return FinalSlide(c)
  if (c.slide.role === 'dialog') return DialogSlide(c)
  return renderStyle(c)
}
function renderStyle(c: SlideCtx): ReactElement {
  switch (c.style) {
    case 't_redakciya': return Redakciya(c)
    case 't_perepiska': return Perepiska(c)
    case 't_tetrad': return Tetrad(c)
    case 't_plakat': return Plakat(c)
    case 't_mono': return Mono(c)
    case 't_premium': return Premium(c)
    case 't_skrapbuk': return Skrapbuk(c)
    case 't_zapiska': return Zapiska(c)
    case 't_zametki': return Zametki(c)
    case 't_stikery': return Stikery(c)
    case 't_citata': return Citata(c)
    case 't_slovar': return Slovar(c)
    case 't_doska': return Doska(c)
    case 't_vozduh': return Vozduh(c)
  }
}
