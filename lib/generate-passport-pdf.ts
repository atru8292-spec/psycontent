import { jsPDF } from 'jspdf'
import { BrandPdf, C, ptmm, inlineRuns, setupBrandFonts, loadWordmark, type Run } from './brand-pdf'

// ════════════════════════════════════════════════════════════════
// Фирменный ВЕКТОРНЫЙ PDF паспорта бренда PsyCont.
// jsPDF рисует текст и фигуры (без растровых скриншотов). Лёгкий файл,
// чёткий выделяемый текст, Onest вшит (кириллица), настоящий перенос
// строк и разрывы страниц — ничего не торчит за край.
// ════════════════════════════════════════════════════════════════

type Section = { num: string; title: string; content: string }

function parseSections(content: string): Section[] {
  const sections: Section[] = []
  const lines = content.split('\n')
  let cur: { num: string; title: string; lines: string[] } | null = null
  let lastNum = 0
  for (const line of lines) {
    const t = line.trim()
    let m = t.match(/^##\s+(1[0-2]|[1-9])\.\s+(.+)/)
    if (!m) m = t.match(/^\*\*(1[0-2]|[1-9])\.\s+(.+?)\*\*\s*$/)
    if (m) {
      const n = parseInt(m[1])
      if (n > lastNum) {
        if (cur) sections.push({ num: cur.num, title: cur.title, content: cur.lines.join('\n').trim() })
        cur = { num: m[1], title: m[2].trim(), lines: [] }
        lastNum = n
      } else if (cur) cur.lines.push(line)
    } else if (cur) cur.lines.push(line)
  }
  if (cur) sections.push({ num: cur.num, title: cur.title, content: cur.lines.join('\n').trim() })
  return sections
}

type Block =
  | { kind: 'subhead'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'label'; label: string; rest: string }
  | { kind: 'bullets'; items: string[] }

const LABEL_RE = /^([A-ZА-ЯЁ][^:*]{0,26}):\s+(\S[\s\S]*)$/
const isLabel = (h: string) => h.split(/\s+/).length <= 4

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  let buf: string[] = []
  const flush = () => { if (buf.length) { blocks.push({ kind: 'bullets', items: buf }); buf = [] } }
  for (const raw of content.split('\n')) {
    const t = raw.trim()
    if (t === '') { flush(); continue }
    const sub = t.match(/^\*\*(.+?)\*\*$/)
    if (sub) { flush(); blocks.push({ kind: 'subhead', text: sub[1].trim().replace(/:\s*$/, '') }); continue }
    // Строка-введение «Примеры фраз:» (короткая, оканчивается двоеточием) → подзаголовок.
    if (t.endsWith(':') && t.length <= 40 && t.split(/\s+/).length <= 5 && !t.includes('*')) {
      flush(); blocks.push({ kind: 'subhead', text: t.replace(/:\s*$/, '') }); continue
    }
    if (/^[-•]\s+/.test(t)) { buf.push(t.replace(/^[-•]\s+/, '')); continue }
    flush()
    const lab = t.match(LABEL_RE)
    if (lab && isLabel(lab[1])) { blocks.push({ kind: 'label', label: lab[1].trim(), rest: lab[2].trim() }); continue }
    blocks.push({ kind: 'para', text: t })
  }
  flush()
  return blocks
}

function cover(bp: BrandPdf, sections: Section[]) {
  bp.newPage(true, true)
  const p = bp.pdf
  const m = bp.margin

  bp.addLogo(m, 22, 11)

  p.setFont('Onest', 'bold')
  p.setFontSize(30)
  p.setTextColor(C.amethyst)
  p.text('Паспорт бренда', m, 58, { baseline: 'top' })
  p.setTextColor(C.indigo)
  p.text('психолога', m, 58 + ptmm(30) * 1.05, { baseline: 'top' })

  const sqY = 58 + ptmm(30) * 1.05 + ptmm(30) + 4
  bp.squiggle(m, sqY, 48)

  p.setFont('Onest', 'normal')
  p.setFontSize(11)
  p.setTextColor(C.muted)
  p.text('Персональный стратегический документ. Голос, ниша и опоры вашего бренда',
    m, sqY + 6, { baseline: 'top', maxWidth: bp.cw })

  // Содержание — лавандовая плашка
  const tocTop = sqY + 22
  const rowH = 7
  const tocH = 14 + sections.length * rowH
  p.setFillColor(C.lavender)
  p.roundedRect(m, tocTop, bp.cw, tocH, 4, 4, 'F')
  p.setFont('Onest', 'bold')
  p.setFontSize(9)
  p.setTextColor(C.amethyst)
  p.text('СОДЕРЖАНИЕ', m + 6, tocTop + 7, { baseline: 'middle' })
  let ry = tocTop + 14 + rowH / 2
  for (const s of sections) {
    p.setFont('Onest', 'bold')
    p.setFontSize(9.5)
    p.setTextColor(C.amethyst)
    p.text(s.num.padStart(2, '0'), m + 6, ry, { baseline: 'middle' })
    p.setFont('Onest', 'normal')
    p.setTextColor(C.indigo)
    p.text(s.title, m + 18, ry, { baseline: 'middle', maxWidth: bp.cw - 24 })
    ry += rowH
  }

  p.setFont('Onest', 'normal')
  p.setFontSize(9)
  p.setTextColor(C.muted)
  p.text(new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    m, bp.pageH - 24, { baseline: 'top' })

  bp.footer()
}

function renderSection(bp: BrandPdf, s: Section) {
  bp.newPage()
  bp.contLabel = 'Раздел ' + s.num
  bp.watermark(s.num.padStart(2, '0'))
  bp.pill('Раздел ' + s.num)

  // Заголовок раздела
  const p = bp.pdf
  p.setFont('Onest', 'bold')
  p.setFontSize(17)
  p.setTextColor(C.amethyst)
  const titleLines = p.splitTextToSize(s.title, bp.cw) as string[]
  for (const ln of titleLines) {
    p.text(ln, bp.margin, bp.y, { baseline: 'top' })
    bp.y += ptmm(17) * 1.18
  }
  const lastW = Math.min(bp.cw * 0.62, p.getTextWidth(titleLines[titleLines.length - 1]))
  bp.squiggle(bp.margin, bp.y + 0.5, lastW)
  bp.y += 6

  const blocks = parseBlocks(s.content)
  blocks.forEach((b, i) => {
    if (i > 0) bp.y += b.kind === 'subhead' ? 4 : 3
    if (b.kind === 'subhead') {
      bp.heading(b.text, { color: C.amethyst, size: 12 })
    } else if (b.kind === 'bullets') {
      b.items.forEach((it, j) => { if (j > 0) bp.y += 1.5; bp.bullet(it) })
    } else if (b.kind === 'label') {
      const runs: Run[] = [{ text: b.label + ': ', bold: true, color: C.indigo }, ...inlineRuns(b.rest)]
      bp.drawRich(runs, { size: 10.5, factor: 1.62 })
    } else {
      bp.drawRich(inlineRuns(b.text), { size: 10.5, factor: 1.62 })
    }
  })

  bp.contLabel = ''
  bp.footer()
}

function finalPage(bp: BrandPdf) {
  bp.newPage()
  const p = bp.pdf
  const cx = bp.pageW / 2
  let y = 110
  p.setFont('Onest', 'bold')
  p.setFontSize(18)
  p.setTextColor(C.indigo)
  p.text('Сильный бренд держится', cx, y, { align: 'center', baseline: 'top' })
  y += ptmm(18) * 1.3
  p.setTextColor(C.amethyst)
  p.text('на обещании, которое вы повторяете каждый день', cx, y, { align: 'center', baseline: 'top', maxWidth: bp.cw })
  y += ptmm(18) * 1.3 + 3
  bp.squiggle(cx - 24, y, 48)
  y += 12
  p.setFont('Onest', 'normal')
  p.setFontSize(10.5)
  p.setTextColor(C.muted)
  const tip = 'Используйте паспорт как ориентир: когда пишете контент, общаетесь с клиентами и решаете, куда вести практику.'
  const tipLines = p.splitTextToSize(tip, bp.cw - 40) as string[]
  for (const ln of tipLines) { p.text(ln, cx, y, { align: 'center', baseline: 'top' }); y += ptmm(10.5) * 1.5 }
  bp.footer()
}

export function buildPassport(bp: BrandPdf, content: string) {
  const sections = parseSections(content)
  cover(bp, sections)
  for (const s of sections) renderSection(bp, s)
  finalPage(bp)
}

export async function generatePassportPDF(passportContent: string): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4')
  await setupBrandFonts(pdf)
  const bp = new BrandPdf(pdf)
  bp.logo = await loadWordmark()
  buildPassport(bp, passportContent)
  pdf.save('passport-brenda-psycont-' + new Date().toISOString().split('T')[0] + '.pdf')
}
