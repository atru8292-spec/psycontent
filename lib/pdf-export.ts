import { jsPDF } from 'jspdf'

type DayItem = {
  day: number
  pillar: string
  topic: string
  format: string
  hook: string
  tip?: string
  done?: boolean
}

const PILLAR_COLORS: Record<string, [number, number, number]> = {
  'Психообразование': [99, 102, 241],
  'Личное':           [244, 63, 94],
  'Практика':         [34, 197, 94],
  'Истории':          [245, 158, 11],
  'Позиционирование': [139, 92, 246],
}

const FORMAT_LABELS: Record<string, string> = {
  post: 'Пост',
  carousel: 'Карусель',
  reels: 'Рилс',
  stories: 'Stories',
}

export async function generatePDF(plan: DayItem[]): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4')
  
  // ===== ЗАГРУЗКА РУССКОГО ШРИФТА =====
  try {
    const fontResponse = await fetch('/fonts/Roboto-Regular.ttf')
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
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  
  // ========== TITLE PAGE ==========
  pdf.setFillColor(139, 92, 246)
  pdf.rect(0, 0, pageWidth, 80, 'F')
  
  pdf.setFillColor(99, 102, 241)
  pdf.rect(0, 70, pageWidth, 20, 'F')
  
  // Title
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(32)
  pdf.text('Контент-план', pageWidth / 2, 35, { align: 'center' })
  
  pdf.setFontSize(18)
  pdf.text('на 30 дней', pageWidth / 2, 48, { align: 'center' })
  
  // Stats box
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(margin, 95, contentWidth, 35, 5, 5, 'F')
  
  const done = plan.filter(d => d.done).length
  const progress = Math.round((done / plan.length) * 100)
  
  pdf.setTextColor(60, 60, 60)
  pdf.setFontSize(12)
  pdf.text('Статистика', margin + 10, 108)
  
  pdf.setFontSize(10)
  pdf.setTextColor(100, 100, 100)
  pdf.text('Всего дней: ' + plan.length, margin + 10, 118)
  pdf.text('Выполнено: ' + done, margin + 70, 118)
  pdf.text('Прогресс: ' + progress + '%', margin + 130, 118)
  
  // Date
  pdf.setFontSize(10)
  pdf.setTextColor(150, 150, 150)
  pdf.text('Создано: ' + new Date().toLocaleDateString('ru-RU'), pageWidth / 2, 145, { align: 'center' })
  
  // Legend
  pdf.setFontSize(11)
  pdf.setTextColor(80, 80, 80)
  pdf.text('Рубрики:', margin, 165)
  
  let legendX = margin
  let legendY = 175
  Object.entries(PILLAR_COLORS).forEach(([name, color], i) => {
    pdf.setFillColor(color[0], color[1], color[2])
    pdf.circle(legendX + 3, legendY - 1, 3, 'F')
    pdf.setTextColor(80, 80, 80)
    pdf.setFontSize(9)
    pdf.text(name, legendX + 9, legendY)
    legendX += 38
    if (i === 2) {
      legendX = margin
      legendY += 10
    }
  })

  // ========== CONTENT PAGES ==========
  pdf.addPage()
  let y = margin
  
  const cardHeight = 42
  const cardsPerPage = Math.floor((pageHeight - margin * 2) / (cardHeight + 5))
  
  plan.forEach((day, index) => {
    if (index > 0 && index % cardsPerPage === 0) {
      pdf.addPage()
      y = margin
    }
    
    const pillarColor = PILLAR_COLORS[day.pillar] || [100, 100, 100]
    
    // Card background
    if (day.done) {
      pdf.setFillColor(240, 253, 244)
    } else {
      pdf.setFillColor(250, 250, 252)
    }
    pdf.roundedRect(margin, y, contentWidth, cardHeight, 3, 3, 'F')
    
    // Left color bar
    pdf.setFillColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.rect(margin, y, 4, cardHeight, 'F')
    
    // Day number circle
    if (day.done) {
      pdf.setFillColor(34, 197, 94)
    } else {
      pdf.setFillColor(pillarColor[0], pillarColor[1], pillarColor[2])
    }
    pdf.circle(margin + 15, y + 10, 6, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(9)
    pdf.text(String(day.day), margin + 15, y + 12, { align: 'center' })
    
    // Pillar badge
    pdf.setFillColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(7)
    const pillarWidth = pdf.getTextWidth(day.pillar) + 8
    pdf.roundedRect(margin + 25, y + 5, pillarWidth, 10, 2, 2, 'F')
    pdf.text(day.pillar, margin + 29, y + 12)
    
    // Format badge
    const formatLabel = FORMAT_LABELS[day.format] || day.format
    pdf.setFillColor(230, 230, 235)
    pdf.setTextColor(80, 80, 80)
    pdf.setFontSize(7)
    const formatWidth = pdf.getTextWidth(formatLabel) + 8
    pdf.roundedRect(margin + 30 + pillarWidth, y + 5, formatWidth, 10, 2, 2, 'F')
    pdf.text(formatLabel, margin + 34 + pillarWidth, y + 12)
    
    // Status
    if (day.done) {
      pdf.setTextColor(34, 197, 94)
      pdf.setFontSize(8)
      pdf.text('Готово', margin + contentWidth - 20, y + 12)
    }
    
    // Topic
    pdf.setTextColor(40, 40, 40)
    pdf.setFontSize(10)
    const topicLines = pdf.splitTextToSize(day.topic, contentWidth - 30)
    pdf.text(topicLines.slice(0, 2), margin + 12, y + 24)
    
    // Hook preview
    if (day.hook && !day.done) {
      pdf.setTextColor(120, 120, 120)
      pdf.setFontSize(8)
      const hookPreview = day.hook.substring(0, 60) + (day.hook.length > 60 ? '...' : '')
      pdf.text('"' + hookPreview + '"', margin + 12, y + 38)
    }
    
    y += cardHeight + 5
  })
  
  // ========== FOOTER ==========
  pdf.setTextColor(180, 180, 180)
  pdf.setFontSize(8)
  pdf.text('Создано в PsyContent AI', pageWidth / 2, pageHeight - 10, { align: 'center' })

  pdf.save('content-plan-' + new Date().toISOString().split('T')[0] + '.pdf')
}
