import { jsPDF } from 'jspdf'

type PassportSection = {
  num: string
  title: string
  content: string
}

const COLORS = {
  primary: [107, 122, 161] as [number, number, number],
  dark:    [45,  55,  72]  as [number, number, number],
  muted:   [130, 140, 160] as [number, number, number],
  light:   [245, 247, 250] as [number, number, number],
  white:   [255, 255, 255] as [number, number, number],
  line:    [220, 225, 235] as [number, number, number],
}

const SECTION_COLORS: Record<string, [number, number, number]> = {
  '1':  [180, 100, 100],
  '2':  [140, 122, 161],
  '3':  [107, 122, 161],
  '4':  [100, 130, 170],
  '5':  [122, 161, 140],
  '6':  [161, 147, 107],
  '7':  [161, 107, 140],
  '8':  [107, 161, 155],
  '9':  [170, 130, 100],
  '10': [120, 150, 130],
  '11': [161, 130, 107],
  '12': [107, 122, 161],
}

// ✅ Парсер с lastNum — исключает ложные заголовки внутри контента
function parsePassportContent(content: string): PassportSection[] {
  const sections: PassportSection[] = []
  const lines = content.split('\n')
  let current: { num: string; title: string; lines: string[] } | null = null
  let lastNum = 0

  for (const line of lines) {
    const t = line.trim()

    let m = t.match(/^##\s+(1[0-2]|[1-9])\.\s+(.+)/)
    if (!m) m = t.match(/^\*\*(1[0-2]|[1-9])\.\s+(.+?)\*\*\s*$/)

    if (m) {
      const n = parseInt(m[1])
      if (n > lastNum) {
        if (current) {
          sections.push({
            num: current.num,
            title: current.title,
            content: current.lines.join('\n').trim(),
          })
        }
        current = { num: m[1], title: m[2].trim(), lines: [] }
        lastNum = n
      } else {
        // ложный заголовок — добавляем как контент
        if (current) current.lines.push(line)
      }
    } else if (current) {
      current.lines.push(line)
    }
  }

  if (current) {
    sections.push({
      num: current.num,
      title: current.title,
      content: current.lines.join('\n').trim(),
    })
  }

  return sections
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^###\s+/gm, '')
    .replace(/^##\s+/gm, '')
    .replace(/^#\s+/gm, '')
}

async function loadFont(pdf: jsPDF): Promise<void> {
  try {
    const res    = await fetch('/Roboto-Regular.ttf')
    const buf    = await res.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), '')
    )
    pdf.addFileToVFS('Roboto-Regular.ttf', base64)
    pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
    pdf.setFont('Roboto')
  } catch {
    console.warn('Font loading failed')
  }
}

export async function generatePassportPDF(passportContent: string): Promise<void> {
  const pdf      = new jsPDF('p', 'mm', 'a4')
  await loadFont(pdf)

  const sections = parsePassportContent(passportContent)
  const pageW    = pdf.internal.pageSize.getWidth()
  const pageH    = pdf.internal.pageSize.getHeight()
  const margin   = 20
  const cw       = pageW - margin * 2

  // ══════════════════════════════════════
  // ТИТУЛЬНАЯ СТРАНИЦА
  // ══════════════════════════════════════

  pdf.setFillColor(...COLORS.light)
  pdf.rect(0, 0, pageW, pageH, 'F')

  pdf.setFillColor(...COLORS.primary)
  pdf.rect(0, 0, pageW, 3, 'F')

  pdf.setTextColor(235, 238, 245)
  pdf.setFontSize(160)
  pdf.text('BP', pageW - 25, 85, { align: 'right' })

  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(32)
  pdf.text('Паспорт бренда', margin, 60)

  pdf.setTextColor(...COLORS.primary)
  pdf.setFontSize(32)
  pdf.text('психолога', margin, 75)

  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(12)
  pdf.text('Персональный стратегический документ', margin, 90)

  pdf.setDrawColor(...COLORS.line)
  pdf.setLineWidth(0.5)
  pdf.line(margin, 100, pageW - margin, 100)

  // Статистика
  const statsY = 115
  const stats  = [
    { value: String(sections.length), label: 'разделов'    },
    { value: '12',                    label: 'стратегий'   },
    { value: '100%',                  label: 'персонально' },
  ]

  stats.forEach((stat, i) => {
    const x = margin + (cw / 3) * i
    pdf.setTextColor(...COLORS.primary)
    pdf.setFontSize(36)
    pdf.text(stat.value, x + 25, statsY + 15, { align: 'center' })
    pdf.setTextColor(...COLORS.muted)
    pdf.setFontSize(10)
    pdf.text(stat.label, x + 25, statsY + 25, { align: 'center' })
    if (i < 2) {
      pdf.setDrawColor(...COLORS.line)
      pdf.line(x + 55, statsY, x + 55, statsY + 30)
    }
  })

  // Оглавление
  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(11)
  pdf.text('Содержание:', margin, 165)

  let tocY = 177
  sections.forEach((section, i) => {
    if (tocY > pageH - 40) return
    const sc = SECTION_COLORS[section.num] || COLORS.primary

    pdf.setTextColor(sc[0], sc[1], sc[2])
    pdf.setFontSize(9)
    pdf.text(section.num.padStart(2, '0'), margin, tocY)

    pdf.setTextColor(...COLORS.dark)
    pdf.text(section.title, margin + 12, tocY)

    const titleW    = pdf.getTextWidth(section.title)
    const dotsStart = margin + 12 + titleW + 2
    const dotsEnd   = pageW - margin - 10

    pdf.setTextColor(...COLORS.line)
    let dotX = dotsStart
    while (dotX < dotsEnd) { pdf.text('.', dotX, tocY); dotX += 2 }

    pdf.setTextColor(...COLORS.muted)
    pdf.text(String(i + 2), pageW - margin, tocY, { align: 'right' })

    tocY += 8
  })

  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(9)
  pdf.text(
    new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    margin, pageH - 20
  )
  pdf.setDrawColor(...COLORS.line)
  pdf.line(margin, pageH - 30, pageW - margin, pageH - 30)

  // ══════════════════════════════════════
  // СТРАНИЦЫ РАЗДЕЛОВ
  // ══════════════════════════════════════

  sections.forEach(section => {
    pdf.addPage()

    const sc = SECTION_COLORS[section.num] || COLORS.primary

    pdf.setFillColor(...COLORS.light)
    pdf.rect(0, 0, pageW, pageH, 'F')

    pdf.setFillColor(sc[0], sc[1], sc[2])
    pdf.rect(0, 0, pageW, 2, 'F')

    // Декоративный номер
    pdf.setTextColor(235, 238, 245)
    pdf.setFontSize(120)
    pdf.text(section.num.padStart(2, '0'), pageW - 20, 55, { align: 'right' })

    // Тег раздела
    pdf.setTextColor(sc[0], sc[1], sc[2])
    pdf.setFontSize(9)
    pdf.text('РАЗДЕЛ ' + section.num, margin, 22)
    const tagW = pdf.getTextWidth('РАЗДЕЛ ' + section.num) + 10
    pdf.setDrawColor(sc[0], sc[1], sc[2])
    pdf.setLineWidth(0.6)
    pdf.roundedRect(margin - 3, 16, tagW + 3, 10, 2, 2, 'S')

    // Заголовок раздела
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(18)
    const titleLines = pdf.splitTextToSize(section.title, cw - 40)
    pdf.text(titleLines, margin, 40)

    const titleEndY = 40 + titleLines.length * 8 + 5
    pdf.setDrawColor(...COLORS.line)
    pdf.setLineWidth(0.3)
    pdf.line(margin, titleEndY, pageW - margin, titleEndY)

    // ── КОНТЕНТ ──
    let y = titleEndY + 12
    const contentLines = cleanMarkdown(section.content).split('\n')

    const addFooter = () => {
      pdf.setTextColor(...COLORS.line)
      pdf.setFontSize(8)
      pdf.text(section.num + ' / ' + sections.length, pageW / 2, pageH - 15, { align: 'center' })
      pdf.setDrawColor(...COLORS.line)
      pdf.line(margin, pageH - 25, pageW - margin, pageH - 25)
    }

    const checkPage = () => {
      if (y > pageH - 35) {
        addFooter()
        pdf.addPage()
        pdf.setFillColor(...COLORS.light)
        pdf.rect(0, 0, pageW, pageH, 'F')
        pdf.setFillColor(sc[0], sc[1], sc[2])
        pdf.rect(0, 0, pageW, 2, 'F')
        pdf.setTextColor(sc[0], sc[1], sc[2])
        pdf.setFontSize(8)
        pdf.text('РАЗДЕЛ ' + section.num + ' — ' + section.title + ' (продолжение)', margin, 15)
        pdf.setDrawColor(...COLORS.line)
        pdf.line(margin, 18, pageW - margin, 18)
        y = 28
      }
    }

    for (const line of contentLines) {
      checkPage()
      const t = line.trim()

      if (t === '') { y += 4; continue }

      // Подзаголовок
      if (line.startsWith('### ') || (t.startsWith('**') && t.endsWith('**') && t.length > 4)) {
        const clean = t.replace(/^###\s+/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim()
        y += 4
        pdf.setFillColor(sc[0], sc[1], sc[2])
        pdf.rect(margin, y - 3.5, 1.5, 5, 'F')
        pdf.setTextColor(...COLORS.dark)
        pdf.setFontSize(11)
        const subLines = pdf.splitTextToSize(clean, cw - 8)
        pdf.text(subLines, margin + 5, y)
        y += subLines.length * 5 + 5
        continue
      }

      // Буллет
      if (t.startsWith('- ') || t.startsWith('• ')) {
        const bt = t.replace(/^[-•]\s+/, '')
        pdf.setFillColor(sc[0], sc[1], sc[2])
        pdf.circle(margin + 2, y - 1, 1, 'F')
        pdf.setTextColor(...COLORS.dark)
        pdf.setFontSize(10)
        const bLines = pdf.splitTextToSize(bt, cw - 10)
        pdf.text(bLines, margin + 7, y)
        y += bLines.length * 4.5 + 3
        continue
      }

      // Нумерованный список
      const nm = t.match(/^(\d+)[\.\)]\s+(.+)/)
      if (nm) {
        pdf.setTextColor(sc[0], sc[1], sc[2])
        pdf.setFontSize(10)
        pdf.text(nm[1] + '.', margin, y)
        pdf.setTextColor(...COLORS.dark)
        const nLines = pdf.splitTextToSize(nm[2], cw - 10)
        pdf.text(nLines, margin + 7, y)
        y += nLines.length * 4.5 + 3
        continue
      }

      // Обычный текст
      pdf.setTextColor(...COLORS.dark)
      pdf.setFontSize(10)
      const tLines = pdf.splitTextToSize(t, cw)
      pdf.text(tLines, margin, y)
      y += tLines.length * 4.5 + 2
    }

    addFooter()
  })

  // ══════════════════════════════════════
  // ФИНАЛЬНАЯ СТРАНИЦА
  // ══════════════════════════════════════

  pdf.addPage()

  pdf.setFillColor(...COLORS.light)
  pdf.rect(0, 0, pageW, pageH, 'F')

  pdf.setFillColor(...COLORS.primary)
  pdf.rect(0, 0, pageW, 2, 'F')

  pdf.setTextColor(235, 238, 245)
  pdf.setFontSize(120)
  pdf.text('«»', pageW / 2, pageH / 2 - 30, { align: 'center' })

  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(20)
  pdf.text('Ваш бренд — это обещание,', pageW / 2, pageH / 2, { align: 'center' })

  pdf.setTextColor(...COLORS.primary)
  pdf.setFontSize(20)
  pdf.text('которое вы держите каждый день', pageW / 2, pageH / 2 + 12, { align: 'center' })

  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(10)
  const tipLines = pdf.splitTextToSize(
    'Используйте этот паспорт как ориентир при создании контента, общении с клиентами и принятии решений о развитии вашей практики.',
    cw - 40
  )
  pdf.text(tipLines, pageW / 2, pageH / 2 + 35, { align: 'center' })

  pdf.setDrawColor(...COLORS.line)
  pdf.line(margin, pageH - 40, pageW - margin, pageH - 40)

  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(9)
  pdf.text('Создано в PsyContent AI', pageW / 2, pageH - 30, { align: 'center' })
  pdf.text(
    new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    pageW / 2, pageH - 22, { align: 'center' }
  )

  pdf.save('brand-passport-' + new Date().toISOString().split('T')[0] + '.pdf')
}
