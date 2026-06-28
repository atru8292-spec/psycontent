import { jsPDF } from 'jspdf'
import { BrandPdf, C, ptmm, inlineRuns, setupBrandFonts, loadWordmark } from './brand-pdf'

// ════════════════════════════════════════════════════════════════
// Фирменный ВЕКТОРНЫЙ PDF контент-плана PsyCont (jsPDF, без растра).
// Единый стиль с паспортом: бумага, Onest, аметист, зелёное
// подчёркивание, лавандовые плашки хуков, карточки дней.
// ════════════════════════════════════════════════════════════════

type DayItem = {
  day: number
  pillar: string
  topic: string
  format: string
  hook: string
  tip?: string
  done?: boolean
}

const FMT: Record<string, string> = { post: 'Пост', carousel: 'Карусель', reels: 'Рилс', stories: 'Stories' }

function pluralDays(n: number): string {
  const a = n % 10, b = n % 100
  if (a === 1 && b !== 11) return 'день'
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дня'
  return 'дней'
}

function cover(bp: BrandPdf, n: number) {
  bp.newPage(true, true)
  const p = bp.pdf
  const m = bp.margin

  bp.addLogo(m, 22, 11)

  p.setFont('Onest', 'bold')
  p.setFontSize(30)
  p.setTextColor(C.amethyst)
  p.text('Контент-план', m, 58, { baseline: 'top' })
  p.setTextColor(C.indigo)
  p.text(`на ${n} ${pluralDays(n)}`, m, 58 + ptmm(30) * 1.05, { baseline: 'top' })

  const sqY = 58 + ptmm(30) * 1.05 + ptmm(30) + 4
  bp.squiggle(m, sqY, 48)

  p.setFont('Onest', 'normal')
  p.setFontSize(11)
  p.setTextColor(C.muted)
  p.text('Каждый день уже с темой, форматом и хуком. Осталось опубликовать.',
    m, sqY + 6, { baseline: 'top', maxWidth: bp.cw })

  // Плашка «Как пользоваться»
  const plateTop = sqY + 22
  const padX = 6, padY = 6
  p.setFont('Onest', 'normal')
  p.setFontSize(11)
  const body = 'Ведите план по порядку. Хук это первая строка поста, она решает половину дела. Отмечайте опубликованное и не гонитесь за идеальностью: важнее регулярность.'
  const lines = p.splitTextToSize(body, bp.cw - padX * 2) as string[]
  const lh = ptmm(11) * 1.55
  const h = padY * 2 + 8 + lines.length * lh
  p.setFillColor(C.lavender)
  p.roundedRect(m, plateTop, bp.cw, h, 4, 4, 'F')
  p.setFont('Onest', 'bold')
  p.setFontSize(9)
  p.setTextColor(C.amethyst)
  p.text('КАК ПОЛЬЗОВАТЬСЯ', m + padX, plateTop + padY, { baseline: 'top' })
  p.setFont('Onest', 'normal')
  p.setFontSize(11)
  p.setTextColor(C.indigo)
  let ty = plateTop + padY + 8
  for (const ln of lines) { p.text(ln, m + padX, ty, { baseline: 'top' }); ty += lh }

  p.setFont('Onest', 'normal')
  p.setFontSize(9)
  p.setTextColor(C.muted)
  p.text(new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    m, bp.pageH - 24, { baseline: 'top' })

  bp.footer()
}

function renderDay(bp: BrandPdf, item: DayItem) {
  const p = bp.pdf
  const m = bp.margin
  // не начинать день в самом низу
  bp.ensureSpace(26)

  // Шапка: бейдж дня + рубрика + формат
  const badge = 'День ' + item.day
  p.setFont('Onest', 'bold')
  p.setFontSize(9)
  const bw = p.getTextWidth(badge) + 8
  p.setFillColor(C.amethyst)
  p.roundedRect(m, bp.y, bw, 6.6, 3.3, 3.3, 'F')
  p.setTextColor('#FFFFFF')
  p.text(badge, m + 4, bp.y + 3.3, { baseline: 'middle' })
  p.setFont('Onest', 'bold')
  p.setFontSize(9)
  p.setTextColor(C.amethyst)
  p.text(item.pillar, m + bw + 5, bp.y + 3.3, { baseline: 'middle' })
  p.setFont('Onest', 'normal')
  p.setTextColor(C.sage)
  p.text(FMT[item.format] || item.format, bp.pageW - m, bp.y + 3.3, { align: 'right', baseline: 'middle' })
  bp.y += 6.6 + 4

  // Тема
  bp.drawRich([{ text: item.topic, bold: true, color: C.indigo }], { size: 12, factor: 1.32 })

  // Хук — лавандовая плашка
  if (item.hook) {
    bp.y += 2
    const padX = 5, padY = 4
    p.setFont('Onest', 'normal')
    p.setFontSize(10)
    const hookLines = p.splitTextToSize('«' + item.hook + '»', bp.cw - padX * 2) as string[]
    const lblH = ptmm(8) + 2
    const lh = ptmm(10) * 1.5
    const h = padY * 2 + lblH + hookLines.length * lh
    bp.ensureSpace(h)
    p.setFillColor(C.lavender)
    p.roundedRect(m, bp.y, bp.cw, h, 3.2, 3.2, 'F')
    p.setFont('Onest', 'bold')
    p.setFontSize(8)
    p.setTextColor(C.amethyst)
    p.text('ХУК', m + padX, bp.y + padY, { baseline: 'top' })
    p.setFont('Onest', 'normal')
    p.setFontSize(10)
    p.setTextColor(C.indigo)
    let ty = bp.y + padY + lblH
    for (const ln of hookLines) { p.text(ln, m + padX, ty, { baseline: 'top' }); ty += lh }
    bp.y += h
  }

  // Подсказка
  if (item.tip) {
    bp.y += 2
    bp.drawRich(inlineRuns(item.tip, C.muted), { size: 9.5, factor: 1.45 })
  }

  // Разделитель
  bp.y += 5
  p.setDrawColor(C.hair)
  p.setLineWidth(0.2)
  if (bp.y < bp.contentBottom) p.line(m, bp.y, bp.pageW - m, bp.y)
  bp.y += 6
}

function finalPage(bp: BrandPdf) {
  bp.newPage()
  const p = bp.pdf
  const cx = bp.pageW / 2
  let y = 115
  p.setFont('Onest', 'bold')
  p.setFontSize(18)
  p.setTextColor(C.indigo)
  p.text('Регулярность важнее идеальности', cx, y, { align: 'center', baseline: 'top', maxWidth: bp.cw })
  y += ptmm(18) * 1.3
  p.setTextColor(C.amethyst)
  p.text('публикуйте по плану, и блог оживёт', cx, y, { align: 'center', baseline: 'top', maxWidth: bp.cw })
  y += ptmm(18) * 1.3 + 3
  bp.squiggle(cx - 24, y, 48)
  bp.footer()
}

export function buildContentPlan(bp: BrandPdf, plan: DayItem[]) {
  cover(bp, plan.length)
  bp.newPage()
  bp.contLabel = 'Контент-план'
  for (const item of plan) renderDay(bp, item)
  bp.contLabel = ''
  bp.footer()
  finalPage(bp)
}

export async function generatePDF(plan: DayItem[]): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4')
  await setupBrandFonts(pdf)
  const bp = new BrandPdf(pdf)
  bp.logo = await loadWordmark()
  buildContentPlan(bp, plan)
  pdf.save('content-plan-psycont-' + new Date().toISOString().split('T')[0] + '.pdf')
}
