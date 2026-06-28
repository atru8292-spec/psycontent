import { jsPDF } from 'jspdf'

// ════════════════════════════════════════════════════════════════
// Общий брендовый ВЕКТОРНЫЙ конструктор PDF (jsPDF, без растровых
// скриншотов). Лёгкий файл, чёткий выделяемый текст, настоящий
// перенос строк и разрывы страниц. Шрифт Onest вшит (кириллица).
// ════════════════════════════════════════════════════════════════

export const C = {
  paper: '#F7F3EC',
  indigo: '#2E2A45',
  amethyst: '#5B4FA0',
  sage: '#8F9D68',
  lavender: '#E7E2F2',
  muted: '#6E6A7A',
  hair: '#D8D0E4',
}

const PT_TO_MM = 0.352777
export const ptmm = (pt: number) => pt * PT_TO_MM

// Аспект вордмарка PsyCont (viewBox 945×320). НЕ растягивать.
export const WORDMARK_ASPECT = 945 / 320

export interface Run { text: string; bold?: boolean; color?: string }

// Инлайн-markdown → последовательность ранов (bold/обычный). На выходе
// НЕ остаётся голых * или ` — курсив/код снимаются в обычный текст.
export function inlineRuns(s: string, color = C.indigo): Run[] {
  let t = s.replace(/`(.+?)`/g, '$1')              // код → текст
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1') // *курсив* → текст
  const runs: Run[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    if (m.index > last) runs.push({ text: t.slice(last, m.index), color })
    runs.push({ text: m[1], bold: true, color })
    last = re.lastIndex
  }
  if (last < t.length) runs.push({ text: t.slice(last), color })
  for (const r of runs) r.text = r.text.replace(/[*`]/g, '') // подчистка непарных
  return runs.filter(r => r.text.length)
}

export class BrandPdf {
  pdf: jsPDF
  pageW: number
  pageH: number
  margin = 18
  marginTop = 20
  footerY: number
  contentBottom: number
  cw: number
  y: number
  logo?: { dataUrl: string; aspect: number }
  contLabel = ''

  constructor(pdf: jsPDF) {
    this.pdf = pdf
    this.pageW = pdf.internal.pageSize.getWidth()
    this.pageH = pdf.internal.pageSize.getHeight()
    this.cw = this.pageW - this.margin * 2
    this.footerY = this.pageH - 14
    this.contentBottom = this.pageH - 22
    this.y = this.marginTop
  }

  // ── фон-бумага на текущей странице ──
  paintBg() {
    this.pdf.setFillColor(C.paper)
    this.pdf.rect(0, 0, this.pageW, this.pageH, 'F')
  }

  footer() {
    const p = this.pdf
    p.setDrawColor(C.hair)
    p.setLineWidth(0.2)
    p.line(this.margin, this.footerY - 4, this.pageW - this.margin, this.footerY - 4)
    p.setFont('Onest', 'normal')
    p.setFontSize(8)
    p.setTextColor(C.muted)
    p.text('Сделано в PsyCont · psycont.ru', this.margin, this.footerY, { baseline: 'middle' })
  }

  newPage(withBg = true, isFirst = false) {
    if (!isFirst) this.pdf.addPage()
    if (withBg) this.paintBg()
    this.y = this.marginTop
  }

  // перенос на новую страницу, если блок высотой h не влезает
  ensureSpace(h: number) {
    if (this.y + h <= this.contentBottom) return
    this.footer()
    this.pdf.addPage()
    this.paintBg()
    this.y = this.marginTop
    if (this.contLabel) {
      this.pdf.setFont('Onest', 'bold')
      this.pdf.setFontSize(8.5)
      this.pdf.setTextColor(C.amethyst)
      this.pdf.text(this.contLabel + ' · продолжение', this.margin, this.y, { baseline: 'top' })
      this.y += ptmm(8.5) + 5
    }
  }

  widthOf(t: string, bold: boolean, size: number): number {
    this.pdf.setFont('Onest', bold ? 'bold' : 'normal')
    this.pdf.setFontSize(size)
    return this.pdf.getTextWidth(t)
  }

  // Текст с переносом из ранов (bold/обычный, цвет). Перенос по словам,
  // разрыв страницы по строкам. Левый отступ indent (для буллетов).
  drawRich(runs: Run[], opts: { size?: number; factor?: number; indent?: number } = {}) {
    const size = opts.size ?? 10.5
    const lh = ptmm(size) * (opts.factor ?? 1.55)
    const indent = opts.indent ?? 0
    const left = this.margin + indent
    const width = this.cw - indent

    type Tok = { t: string; bold: boolean; color: string; sp: boolean }
    const toks: Tok[] = []
    for (const r of runs) {
      for (const part of r.text.split(/(\s+)/)) {
        if (!part.length) continue
        toks.push({ t: part, bold: !!r.bold, color: r.color ?? C.indigo, sp: /^\s+$/.test(part) })
      }
    }

    let line: Tok[] = []
    let lineW = 0
    const flush = () => {
      // убрать хвостовой пробел
      while (line.length && line[line.length - 1].sp) { lineW -= this.widthOf(line[line.length - 1].t, line[line.length - 1].bold, size); line.pop() }
      if (!line.length) return
      this.ensureSpace(lh)
      let x = left
      for (const tk of line) {
        this.pdf.setFont('Onest', tk.bold ? 'bold' : 'normal')
        this.pdf.setFontSize(size)
        this.pdf.setTextColor(tk.color)
        this.pdf.text(tk.t, x, this.y, { baseline: 'top' })
        x += this.pdf.getTextWidth(tk.t)
      }
      this.y += lh
      line = []
      lineW = 0
    }

    for (const tk of toks) {
      if (!line.length && tk.sp) continue
      const w = this.widthOf(tk.t, tk.bold, size)
      if (lineW + w > width && line.length) flush()
      if (!line.length && tk.sp) continue
      line.push(tk)
      lineW += w
    }
    flush()
  }

  heading(text: string, opts: { size?: number; color?: string; gap?: number } = {}) {
    const size = opts.size ?? 12
    if (opts.gap) this.y += opts.gap
    this.drawRich([{ text, bold: true, color: opts.color ?? C.amethyst }], { size, factor: 1.3 })
  }

  bullet(text: string, opts: { size?: number } = {}) {
    const size = opts.size ?? 10.5
    const lh = ptmm(size) * 1.6
    this.ensureSpace(lh)
    const dotY = this.y + ptmm(size) * 0.5
    this.pdf.setFillColor(C.sage)
    this.pdf.circle(this.margin + 1.4, dotY, 0.85, 'F')
    this.drawRich(inlineRuns(text), { size, factor: 1.6, indent: 6 })
  }

  // Лавандовая плашка под обычный текст (определение/ключевая мысль).
  plate(text: string, opts: { size?: number } = {}) {
    const size = opts.size ?? 10.5
    const padX = 5
    const padY = 4.5
    const lh = ptmm(size) * 1.55
    this.pdf.setFont('Onest', 'normal')
    this.pdf.setFontSize(size)
    const lines = this.pdf.splitTextToSize(text, this.cw - padX * 2) as string[]
    const h = padY * 2 + lines.length * lh
    this.ensureSpace(h)
    this.pdf.setFillColor(C.lavender)
    this.pdf.roundedRect(this.margin, this.y, this.cw, h, 3.5, 3.5, 'F')
    this.pdf.setTextColor(C.indigo)
    let ty = this.y + padY
    for (const ln of lines) {
      this.pdf.text(ln, this.margin + padX, ty, { baseline: 'top' })
      ty += lh
    }
    this.y += h
  }

  pill(text: string) {
    const size = 8.5
    this.pdf.setFont('Onest', 'bold')
    this.pdf.setFontSize(size)
    const tw = this.pdf.getTextWidth(text)
    const padX = 4
    const h = 6.5
    this.ensureSpace(h + 2)
    this.pdf.setFillColor(C.lavender)
    this.pdf.roundedRect(this.margin, this.y, tw + padX * 2, h, 3.2, 3.2, 'F')
    this.pdf.setTextColor(C.amethyst)
    this.pdf.text(text, this.margin + padX, this.y + h / 2, { baseline: 'middle' })
    this.y += h + 3
  }

  // Зелёное рукописное подчёркивание (вектор), волна с округлыми концами.
  squiggle(x: number, y: number, width: number) {
    const p = this.pdf
    p.setDrawColor(C.sage)
    p.setLineWidth(1.1)
    p.setLineCap('round')
    p.setLineJoin('round')
    const N = 44
    const amp = 1.0
    let px = x
    let py = y
    for (let i = 1; i <= N; i++) {
      const t = i / N
      const cx = x + width * t
      const cy = y - Math.sin(t * Math.PI * 3) * amp * (0.7 + 0.3 * Math.sin(t * 8 + 1))
      p.line(px, py, cx, cy)
      px = cx
      py = cy
    }
  }

  // Большой полупрозрачный (лавандовый) номер раздела в правом верхнем углу.
  watermark(num: string) {
    this.pdf.setFont('Onest', 'bold')
    this.pdf.setFontSize(54)
    this.pdf.setTextColor(C.lavender)
    this.pdf.text(num, this.pageW - this.margin, this.marginTop - 4, { baseline: 'top', align: 'right' })
  }

  addLogo(x: number, y: number, heightMm: number) {
    if (!this.logo) return
    const w = heightMm * this.logo.aspect
    this.pdf.addImage(this.logo.dataUrl, 'PNG', x, y, w, heightMm)
  }
}

// ── Браузерные помощники: загрузка шрифта Onest и лого ──

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

export async function setupBrandFonts(pdf: jsPDF) {
  const fonts: [string, string][] = [
    ['/Onest-Regular.ttf', 'normal'],
    ['/Onest-Bold.ttf', 'bold'],
  ]
  for (const [url, style] of fonts) {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const name = url.slice(1)
    pdf.addFileToVFS(name, bufToB64(buf))
    pdf.addFont(name, 'Onest', style)
  }
  pdf.setFont('Onest', 'normal')
}

// ЧИСТЫЙ вордмарк берём из out_wordmark.svg (viewBox 560 130 945 320, полный
// PsyCont с буквой P). out_wordmark.PNG — грязный автотрейс («syCont» + подпись),
// его НЕ использовать. Рендерим SVG в НЕБОЛЬШОЙ непрозрачный canvas (бумажный
// фон, без альфы) — чисто и легко (без гигантского битмапа).
export async function loadWordmark(): Promise<{ dataUrl: string; aspect: number }> {
  const img = new Image()
  img.src = '/logo/out_wordmark.svg'
  await img.decode()
  const aspect = (img.naturalWidth || 945) / (img.naturalHeight || 320)
  const h = 220 // px — достаточно для чёткости лого ~11мм при печати, файл лёгкий
  const w = Math.round(h * aspect)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return { dataUrl: canvas.toDataURL('image/png'), aspect }
}
