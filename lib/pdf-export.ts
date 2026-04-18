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

// Приглушённая палитра в стиле рефа
const COLORS = {
  primary: [107, 122, 161] as [number, number, number],      // #6B7AA1 — основной сине-серый
  accent: [142, 156, 194] as [number, number, number],       // #8E9CC2 — светлый акцент
  dark: [45, 55, 72] as [number, number, number],            // #2D3748 — тёмный текст
  muted: [130, 140, 160] as [number, number, number],        // #828AA0 — приглушённый текст
  light: [245, 247, 250] as [number, number, number],        // #F5F7FA — светлый фон
  white: [255, 255, 255] as [number, number, number],
  line: [220, 225, 235] as [number, number, number],         // #DCE1EB — линии
}

// Минималистичные цвета рубрик (приглушённые)
const PILLAR_COLORS: Record<string, [number, number, number]> = {
  'Психообразование': [107, 122, 161],   // сине-серый
  'Личное':           [161, 122, 142],   // приглушённый розовый
  'Практика':         [122, 161, 140],   // приглушённый зелёный
  'Истории':          [161, 147, 107],   // приглушённый песочный
  'Позиционирование': [140, 122, 161],   // приглушённый фиолетовый
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
  
  // ========== ТИТУЛЬНАЯ СТРАНИЦА ==========
  
  // Чистый светлый фон
  pdf.setFillColor(...COLORS.light)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')
  
  // Тонкая акцентная линия сверху
  pdf.setFillColor(...COLORS.primary)
  pdf.rect(0, 0, pageWidth, 3, 'F')
  
  // Большой номер как декор (как на рефе 01, 02...)
  pdf.setTextColor(235, 238, 245)
  pdf.setFontSize(180)
  pdf.text('30', pageWidth - 25, 85, { align: 'right' })
  
  // Заголовок
  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(32)
  pdf.text('Контент-план', margin, 60)
  
  pdf.setFontSize(32)
  pdf.setTextColor(...COLORS.primary)
  pdf.text('для психолога', margin, 75)
  
  // Подзаголовок
  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(12)
  pdf.text('Готовая стратегия публикаций на 30 дней', margin, 90)
  
  // Тонкая линия
  pdf.setDrawColor(...COLORS.line)
  pdf.setLineWidth(0.5)
  pdf.line(margin, 100, pageWidth - margin, 100)
  
  // Статистика — минималистичные блоки
  const statsY = 115
  const done = plan.filter(d => d.done).length
  const progress = Math.round((done / plan.length) * 100)
  
  // Три колонки
  const stats = [
    { value: String(plan.length), label: 'публикаций' },
    { value: String(done), label: 'выполнено' },
    { value: progress + '%', label: 'прогресс' },
  ]
  
  stats.forEach((stat, i) => {
    const x = margin + (contentWidth / 3) * i
    
    pdf.setTextColor(...COLORS.primary)
    pdf.setFontSize(36)
    pdf.text(stat.value, x + 25, statsY + 15, { align: 'center' })
    
    pdf.setTextColor(...COLORS.muted)
    pdf.setFontSize(10)
    pdf.text(stat.label, x + 25, statsY + 25, { align: 'center' })
    
    // Вертикальный разделитель
    if (i < 2) {
      pdf.setDrawColor(...COLORS.line)
      pdf.line(x + 55, statsY, x + 55, statsY + 30)
    }
  })
  
  // Рубрики — минималистичные теги
  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(11)
  pdf.text('Рубрики:', margin, 165)
  
  let tagX = margin
  const tagY = 175
  
  Object.entries(PILLAR_COLORS).forEach(([name, color]) => {
    const textWidth = pdf.getTextWidth(name) + 12
    
    // Просто обводка, без заливки (минимализм)
    pdf.setDrawColor(color[0], color[1], color[2])
    pdf.setLineWidth(0.8)
    pdf.roundedRect(tagX, tagY - 5, textWidth, 14, 2, 2, 'S')
    
    pdf.setTextColor(color[0], color[1], color[2])
    pdf.setFontSize(9)
    pdf.text(name, tagX + 6, tagY + 4)
    
    tagX += textWidth + 6
  })
  
  // Дата внизу
  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(9)
  pdf.text(new Date().toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  }), margin, pageHeight - 20)
  
  // Декоративная линия внизу
  pdf.setDrawColor(...COLORS.line)
  pdf.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30)
  
  // ========== СТРАНИЦЫ КОНТЕНТА ==========
  
  plan.forEach((day) => {
    pdf.addPage()
    
    const pillarColor = PILLAR_COLORS[day.pillar] || COLORS.primary
    const formatLabel = FORMAT_LABELS[day.format] || day.format
    
    // Светлый фон
    pdf.setFillColor(...COLORS.light)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')
    
    // Тонкая цветная линия сверху (акцент рубрики)
    pdf.setFillColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.rect(0, 0, pageWidth, 2, 'F')
    
    // ===== ШАПКА =====
    
    // Большой номер дня (как на рефе)
    pdf.setTextColor(235, 238, 245)
    pdf.setFontSize(120)
    const dayNum = day.day < 10 ? '0' + day.day : String(day.day)
    pdf.text(dayNum, pageWidth - 20, 55, { align: 'right' })
    
    // День X
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(14)
    pdf.text('День ' + day.day, margin, 25)
    
    // Рубрика и формат — теги
    pdf.setDrawColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.setLineWidth(0.6)
    const pillarWidth = pdf.getTextWidth(day.pillar) + 10
    pdf.roundedRect(margin, 30, pillarWidth, 12, 2, 2, 'S')
    pdf.setTextColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.setFontSize(9)
    pdf.text(day.pillar, margin + 5, 38)
    
    // Формат
    pdf.setDrawColor(...COLORS.muted)
    const formatWidth = pdf.getTextWidth(formatLabel) + 10
    pdf.roundedRect(margin + pillarWidth + 5, 30, formatWidth, 12, 2, 2, 'S')
    pdf.setTextColor(...COLORS.muted)
    pdf.text(formatLabel, margin + pillarWidth + 10, 38)
    
    // Статус (если выполнено)
    if (day.done) {
      pdf.setTextColor(122, 161, 140)
      pdf.setFontSize(9)
      pdf.text('● Выполнено', pageWidth - margin - 30, 38)
    }
    
    // Тонкая линия под шапкой
    pdf.setDrawColor(...COLORS.line)
    pdf.setLineWidth(0.3)
    pdf.line(margin, 50, pageWidth - margin, 50)
    
    let y = 65
    
    // ===== ТЕМА =====
    pdf.setTextColor(...COLORS.muted)
    pdf.setFontSize(9)
    pdf.text('ТЕМА', margin, y)
    
    y += 8
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(16)
    const topicLines = pdf.splitTextToSize(day.topic, contentWidth)
    pdf.text(topicLines, margin, y)
    
    y += topicLines.length * 8 + 15
    
    // Линия-разделитель
    pdf.setDrawColor(...COLORS.line)
    pdf.line(margin, y, margin + 40, y)
    
    y += 15
    
    // ===== ХУК =====
    pdf.setTextColor(...COLORS.muted)
    pdf.setFontSize(9)
    pdf.text('ХУК / НАЧАЛО ПОСТА', margin, y)
    
    y += 10
    
    // Кавычка как декор
    pdf.setTextColor(220, 225, 235)
    pdf.setFontSize(48)
    pdf.text('«', margin - 2, y + 8)
    
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(12)
    const hookLines = pdf.splitTextToSize(day.hook, contentWidth - 15)
    pdf.text(hookLines, margin + 12, y)
    
    y += hookLines.length * 6 + 20
    
    // ===== СОВЕТ =====
    if (day.tip) {
      // Тонкая линия
      pdf.setDrawColor(...COLORS.line)
      pdf.line(margin, y, margin + 40, y)
      
      y += 15
      
      pdf.setTextColor(...COLORS.muted)
      pdf.setFontSize(9)
      pdf.text('РЕКОМЕНДАЦИЯ', margin, y)
      
      y += 10
      pdf.setTextColor(...COLORS.dark)
      pdf.setFontSize(11)
      const tipLines = pdf.splitTextToSize(day.tip, contentWidth)
      pdf.text(tipLines, margin, y)
      
      y += tipLines.length * 5.5 + 15
    }
    
    // ===== ЧЕКЛИСТ =====
    // Тонкая линия
    pdf.setDrawColor(...COLORS.line)
    pdf.line(margin, y, margin + 40, y)
    
    y += 15
    
    pdf.setTextColor(...COLORS.muted)
    pdf.setFontSize(9)
    pdf.text('ЧЕКЛИСТ', margin, y)
    
    y += 10
    
    const checklist = [
      'Текст вычитан',
      'Визуал готов',
      'Хештеги добавлены',
      'Время выбрано'
    ]
    
    pdf.setTextColor(...COLORS.dark)
    pdf.setFontSize(10)
    
    checklist.forEach((item, i) => {
      // Минималистичный квадрат
      pdf.setDrawColor(...COLORS.muted)
      pdf.setLineWidth(0.4)
      pdf.rect(margin, y + i * 10 - 3, 4, 4, 'S')
      pdf.text(item, margin + 8, y + i * 10)
    })
    
    // ===== ФУТЕР =====
    pdf.setTextColor(...COLORS.line)
    pdf.setFontSize(8)
    pdf.text(day.day + ' / ' + plan.length, pageWidth / 2, pageHeight - 15, { align: 'center' })
    
    // Линия внизу
    pdf.setDrawColor(...COLORS.line)
    pdf.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25)
  })
  
  // ===== ФИНАЛЬНАЯ СТРАНИЦА =====
  pdf.addPage()
  
  pdf.setFillColor(...COLORS.light)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')
  
  // Акцентная линия
  pdf.setFillColor(...COLORS.primary)
  pdf.rect(0, 0, pageWidth, 2, 'F')
  
  // Текст по центру
  pdf.setTextColor(...COLORS.dark)
  pdf.setFontSize(24)
  pdf.text('Успешного продвижения', pageWidth / 2, pageHeight / 2 - 10, { align: 'center' })
  
  pdf.setTextColor(...COLORS.primary)
  pdf.setFontSize(24)
  pdf.text('и вдохновения!', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' })
  
  // Подпись
  pdf.setTextColor(...COLORS.muted)
  pdf.setFontSize(10)
  pdf.text('Создано в PsyContent AI', pageWidth / 2, pageHeight - 30, { align: 'center' })
  
  // Линия внизу
  pdf.setDrawColor(...COLORS.line)
  pdf.line(margin, pageHeight - 40, pageWidth - margin, pageHeight - 40)

  pdf.save('content-plan-' + new Date().toISOString().split('T')[0] + '.pdf')
}
