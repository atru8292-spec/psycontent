import { jsPDF } from 'jspdf'

type PassportSection = {
  num: string
  title: string
  content: string
}

// Палитра (идентичная контент-плану)
const COLORS = {
  primary: [107, 122, 161] as [number, number, number],
  accent: [142, 156, 194] as [number, number, number],
  dark: [45, 55, 72] as [number, number, number],
  muted: [130, 140, 160] as [number, number, number],
  light: [245, 247, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  line: [220, 225, 235] as [number, number, number],
}

// Цвета для каждого раздела паспорта
const SECTION_COLORS: Record<string, [number, number, number]> = {
  '1':  [180, 100, 100],   // миссия — приглушённый красный
  '2':  [140, 122, 161],   // позиционирование — фиолетовый
  '3':  [107, 122, 161],   // архетип — сине-серый
  '4':  [100, 130, 170],   // тон голоса — голубой
  '5':  [122, 161, 140],   // аватар клиента — зелёный
  '6':  [161, 147, 107],   // УТП — песочный
  '7':  [161, 107, 140],   // визуал — розовый
  '8':  [107, 161, 155],   // воронка — бирюзовый
  '9':  [170, 130, 100],   // контентные столбы — терракот
  '10': [120, 150, 130],   // хештеги — болотный
  '11': [161, 130, 107],   // антислова — оранжевый
  '12': [107, 122, 161],   // примеры — сине-серый
}

function parsePassportContent(content: string): PassportSection[] {
  const sections: PassportSection[] = []
  const lines = content.split('\n')
  let current: { num: string; title: string; lines: string[] } | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(\d+)\.\s+(.+)/)
    if (headingMatch) {
      if (current) {
        sections.push({
          num: current.num,
          title: current.title,
          content: current.lines.join('\n').trim(),
        })
      }
      current = { num: headingMatch[1], title: headingMatch[2], lines: [] }
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

// Очистка markdown-разметки для PDF
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^###\s+/gm, '')
    .replace(/^##\s+/gm, '')
    .replace(/^#\s+/gm, '')
}

export async function generatePassportPDF(passportContent: string): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4')
  const sections = parsePassportContent(passportContent)

  // ===== ЗАГРУЗКА ШРИФТА =====
  try {
    const fontResponse = await fetch('/Roboto-Regular.ttf')
    const fontBuffer = await fontResponse.arrayBuffer()
    const fontBase64 = btoa(
      new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    pdf.addFileToVFS('Roboto-Regular.ttf', fontBase64)
    pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
    pdf.setFont('Roboto')
  } catch (e) {
    console.warn('Font loading failed, using default font')
  }

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2

  // ══════════════════════════════════════
  // ТИТУЛЬНАЯ СТРАНИЦА
  // ══════════════════════════════════════

  // Фон
  pdf.setFillColor(...COLORS.light)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  // Акцентная линия сверху
  pdf.setFillColor(...COLORS.primary)
  pdf.rect(0, 0, pageWidth, 3, 'F')

  // Большой декоративный текст
  pdf.setTextColor(235, 238, 245)
  pdf.setFontSize(160)
  pdf.text('BP', pageWidth - 25, 85, { align: 'right' })

  // Заголовок
  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(32)
  pdf.text('Паспорт бренда', margin, 60)

  pdf.setFontSize(32)
  pdf.setTextColor(...COLORS.primary)
  pdf.text('психолога', margin, 75)

  // Подзаголовок
  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(12)
  pdf.text('Персональный стратегический документ', margin, 90)

  // Линия
  pdf.setDrawColor(...COLORS.line)
  pdf.setLineWidth(0.5)
  pdf.line(margin, 100, pageWidth - margin, 100)

  // Статистика
  const statsY = 115
  const stats = [
    { value: String(sections.length), label: 'разделов' },
    { value: '12', label: 'стратегий' },
    { value: '100%', label: 'персонально' },
  ]

  stats.forEach((stat, i) => {
    const x = margin + (contentWidth / 3) * i

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
    const sectionColor = SECTION_COLORS[section.num] || COLORS.primary

    if (tocY > pageHeight - 40) return // защита от переполнения

    // Номер
    pdf.setTextColor(sectionColor[0], sectionColor[1], sectionColor[2])
    pdf.setFontSize(9)
    pdf.text(section.num.padStart(2, '0'), margin, tocY)

    // Название
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(9)
    pdf.text(section.title, margin + 12, tocY)

    // Точки до номера страницы
    pdf.setTextColor(...COLORS.line)
    const titleWidth = pdf.getTextWidth(section.title)
    const dotsStart = margin + 12 + titleWidth + 2
    const dotsEnd = pageWidth - margin - 10
    if (dotsEnd > dotsStart) {
      let dotX = dotsStart
      while (dotX < dotsEnd) {
        pdf.text('.', dotX, tocY)
        dotX += 2
      }
    }

    // Номер страницы
    pdf.setTextColor(...COLORS.muted)
    pdf.text(String(i + 2), pageWidth - margin, tocY, { align: 'right' })

    tocY += 8
  })

  // Дата
  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(9)
  pdf.text(
    new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    margin,
    pageHeight - 20
  )

  // Линия внизу
  pdf.setDrawColor(...COLORS.line)
  pdf.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30)

  // ══════════════════════════════════════
  // СТРАНИЦЫ РАЗДЕЛОВ
  // ══════════════════════════════════════

  sections.forEach((section, sectionIndex) => {
    pdf.addPage()

    const sectionColor = SECTION_COLORS[section.num] || COLORS.primary

    // Фон
    pdf.setFillColor(...COLORS.light)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Цветная линия сверху
    pdf.setFillColor(sectionColor[0], sectionColor[1], sectionColor[2])
    pdf.rect(0, 0, pageWidth, 2, 'F')

    // Большой номер раздела (декор)
    pdf.setTextColor(235, 238, 245)
    pdf.setFontSize(120)
    const sectionNum = section.num.padStart(2, '0')
    pdf.text(sectionNum, pageWidth - 20, 55, { align: 'right' })

    // Лейбл «Раздел X»
    pdf.setTextColor(sectionColor[0], sectionColor[1], sectionColor[2])
    pdf.setFontSize(9)
    pdf.text('РАЗДЕЛ ' + section.num, margin, 22)

    // Тег с номером
    const tagWidth = pdf.getTextWidth('РАЗДЕЛ ' + section.num) + 10
    pdf.setDrawColor(sectionColor[0], sectionColor[1], sectionColor[2])
    pdf.setLineWidth(0.6)
    pdf.roundedRect(margin - 3, 16, tagWidth + 3, 10, 2, 2, 'S')

    // Заголовок раздела
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(18)
    const titleLines = pdf.splitTextToSize(section.title, contentWidth - 40)
    pdf.text(titleLines, margin, 40)

    // Линия под заголовком
    const titleEndY = 40 + titleLines.length * 8 + 5
    pdf.setDrawColor(...COLORS.line)
    pdf.setLineWidth(0.3)
    pdf.line(margin, titleEndY, pageWidth - margin, titleEndY)

    // ===== КОНТЕНТ РАЗДЕЛА =====
    let y = titleEndY + 12
    const cleanedContent = cleanMarkdown(section.content)
    const contentLines = cleanedContent.split('\n')

    for (const line of contentLines) {
      // Проверка на новую страницу
      if (y > pageHeight - 35) {
        // Футер текущей страницы
        pdf.setTextColor(...COLORS.line)
        pdf.setFontSize(8)
        pdf.text(
          section.num + ' / ' + sections.length,
          pageWidth / 2,
          pageHeight - 15,
          { align: 'center' }
        )
        pdf.setDrawColor(...COLORS.line)
        pdf.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25)

        // Новая страница
        pdf.addPage()
        pdf.setFillColor(...COLORS.light)
        pdf.rect(0, 0, pageWidth, pageHeight, 'F')
        pdf.setFillColor(sectionColor[0], sectionColor[1], sectionColor[2])
        pdf.rect(0, 0, pageWidth, 2, 'F')

        // Мини-заголовок на продолжении
        pdf.setTextColor(sectionColor[0], sectionColor[1], sectionColor[2])
        pdf.setFontSize(8)
        pdf.text(
          'РАЗДЕЛ ' + section.num + ' — ' + section.title + ' (продолжение)',
          margin,
          15
        )
        pdf.setDrawColor(...COLORS.line)
        pdf.line(margin, 18, pageWidth - margin, 18)

        y = 28
      }

      const trimmed = line.trim()

      // Пустая строка
      if (trimmed === '') {
        y += 4
        continue
      }

      // Подзаголовок (### или строка целиком жирная)
      if (
        line.startsWith('### ') ||
        (trimmed.startsWith('**') && trimmed.endsWith('**'))
      ) {
        const clean = trimmed
          .replace(/^###\s+/, '')
          .replace(/^\*\*/, '')
          .replace(/\*\*$/, '')

        y += 4

        // Маленький цветной акцент слева
        pdf.setFillColor(sectionColor[0], sectionColor[1], sectionColor[2])
        pdf.rect(margin, y - 3.5, 1.5, 5, 'F')

        pdf.setTextColor(...COLORS.dark)
        pdf.setFontSize(11)
        const subLines = pdf.splitTextToSize(clean, contentWidth - 8)
        pdf.text(subLines, margin + 5, y)
        y += subLines.length * 5 + 5
        continue
      }

      // Буллет-поинт
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        const bulletText = trimmed.replace(/^[-•]\s+/, '')

        // Точка-маркер
        pdf.setFillColor(sectionColor[0], sectionColor[1], sectionColor[2])
        pdf.circle(margin + 2, y - 1, 1, 'F')

        pdf.setTextColor(...COLORS.dark)
        pdf.setFontSize(10)
        const bulletLines = pdf.splitTextToSize(bulletText, contentWidth - 10)
        pdf.text(bulletLines, margin + 7, y)
        y += bulletLines.length * 4.5 + 3
        continue
      }

      // Нумерованный список
      const numberedMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)/)
      if (numberedMatch) {
        const num = numberedMatch[1]
        const text = numberedMatch[2]

        pdf.setTextColor(sectionColor[0], sectionColor[1], sectionColor[2])
        pdf.setFontSize(10)
        pdf.text(num + '.', margin, y)

        pdf.setTextColor(...COLORS.dark)
        pdf.setFontSize(10)
        const numLines = pdf.splitTextToSize(text, contentWidth - 10)
        pdf.text(numLines, margin + 7, y)
        y += numLines.length * 4.5 + 3
        continue
      }

      // Обычный текст
      pdf.setTextColor(...COLORS.dark)
      pdf.setFontSize(10)
      const textLines = pdf.splitTextToSize(trimmed, contentWidth)
      pdf.text(textLines, margin, y)
      y += textLines.length * 4.5 + 2
    }

    // Футер
    pdf.setTextColor(...COLORS.line)
    pdf.setFontSize(8)
    pdf.text(
      section.num + ' / ' + sections.length,
      pageWidth / 2,
      pageHeight - 15,
      { align: 'center' }
    )
    pdf.setDrawColor(...COLORS.line)
    pdf.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25)
  })

  // ══════════════════════════════════════
  // ФИНАЛЬНАЯ СТРАНИЦА
  // ══════════════════════════════════════

  pdf.addPage()

  pdf.setFillColor(...COLORS.light)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setFillColor(...COLORS.primary)
  pdf.rect(0, 0, pageWidth, 2, 'F')

  // Декоративные кавычки
  pdf.setTextColor(235, 238, 245)
  pdf.setFontSize(120)
  pdf.text('«»', pageWidth / 2, pageHeight / 2 - 30, { align: 'center' })

  // Текст
  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(20)
  pdf.text('Ваш бренд — это обещание,', pageWidth / 2, pageHeight / 2, {
    align: 'center',
  })

  pdf.setTextColor(...COLORS.primary)
  pdf.setFontSize(20)
  pdf.text('которое вы держите каждый день', pageWidth / 2, pageHeight / 2 + 12, {
    align: 'center',
  })

  // Совет
  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(10)
  const tipLines = pdf.splitTextToSize(
    'Используйте этот паспорт как ориентир при создании контента, общении с клиентами и принятии решений о развитии вашей практики.',
    contentWidth - 40
  )
  pdf.text(tipLines, pageWidth / 2, pageHeight / 2 + 35, { align: 'center' })

  // Подпись
  pdf.setDrawColor(...COLORS.line)
  pdf.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40)

  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(9)
  pdf.text('Создано в PsyContent AI', pageWidth / 2, pageHeight - 30, {
    align: 'center',
  })

  pdf.text(
    new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    pageWidth / 2,
    pageHeight - 22,
    { align: 'center' }
  )

  pdf.save('brand-passport-' + new Date().toISOString().split('T')[0] + '.pdf')
}
