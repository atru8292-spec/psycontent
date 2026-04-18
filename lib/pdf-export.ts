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
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  
  // ========== ТИТУЛЬНАЯ СТРАНИЦА ==========
  
  // Градиентный эффект (две полосы)
  pdf.setFillColor(139, 92, 246)
  pdf.rect(0, 0, pageWidth, 100, 'F')
  
  pdf.setFillColor(99, 102, 241)
  pdf.triangle(0, 100, pageWidth, 60, pageWidth, 100, 'F')
  
  // Заголовок
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(36)
  pdf.text('Контент-план', pageWidth / 2, 45, { align: 'center' })
  
  pdf.setFontSize(20)
  pdf.text('на 30 дней', pageWidth / 2, 60, { align: 'center' })
  
  pdf.setFontSize(12)
  pdf.text('Готовая стратегия публикаций для психолога', pageWidth / 2, 80, { align: 'center' })
  
  // Блок статистики
  const statsY = 120
  pdf.setFillColor(250, 250, 255)
  pdf.roundedRect(margin, statsY, contentWidth, 45, 5, 5, 'F')
  
  // Обводка
  pdf.setDrawColor(139, 92, 246)
  pdf.setLineWidth(0.5)
  pdf.roundedRect(margin, statsY, contentWidth, 45, 5, 5, 'S')
  
  const done = plan.filter(d => d.done).length
  const progress = Math.round((done / plan.length) * 100)
  
  // Три колонки статистики
  const colWidth = contentWidth / 3
  
  pdf.setFontSize(24)
  pdf.setTextColor(139, 92, 246)
  pdf.text(String(plan.length), margin + colWidth * 0.5, statsY + 20, { align: 'center' })
  pdf.text(String(done), margin + colWidth * 1.5, statsY + 20, { align: 'center' })
  pdf.text(progress + '%', margin + colWidth * 2.5, statsY + 20, { align: 'center' })
  
  pdf.setFontSize(10)
  pdf.setTextColor(100, 100, 100)
  pdf.text('публикаций', margin + colWidth * 0.5, statsY + 32, { align: 'center' })
  pdf.text('выполнено', margin + colWidth * 1.5, statsY + 32, { align: 'center' })
  pdf.text('прогресс', margin + colWidth * 2.5, statsY + 32, { align: 'center' })
  
  // Рубрики
  pdf.setFontSize(14)
  pdf.setTextColor(60, 60, 60)
  pdf.text('Рубрики контента:', margin, 190)
  
  let legendX = margin
  let legendY = 205
  
  Object.entries(PILLAR_COLORS).forEach(([name, color], index) => {
    pdf.setFillColor(color[0], color[1], color[2])
    pdf.roundedRect(legendX, legendY - 5, 55, 18, 3, 3, 'F')
    
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(9)
    pdf.text(name, legendX + 27.5, legendY + 3, { align: 'center' })
    
    legendX += 60
    if (index === 2) {
      legendX = margin + 30
      legendY += 25
    }
  })
  
  // Дата
  pdf.setFontSize(10)
  pdf.setTextColor(150, 150, 150)
  pdf.text('Создано: ' + new Date().toLocaleDateString('ru-RU'), pageWidth / 2, 270, { align: 'center' })
  
  // ========== СТРАНИЦЫ КОНТЕНТА ==========
  // Каждый день — полная информация
  
  plan.forEach((day, index) => {
    // Новая страница для каждого дня
    pdf.addPage()
    
    const pillarColor = PILLAR_COLORS[day.pillar] || [100, 100, 100]
    const formatLabel = FORMAT_LABELS[day.format] || day.format
    
    // ===== ШАПКА ДНЯ =====
    
    // Цветная полоса сверху
    pdf.setFillColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.rect(0, 0, pageWidth, 35, 'F')
    
    // Номер дня
    pdf.setFillColor(255, 255, 255)
    pdf.circle(25, 17, 12, 'F')
    pdf.setTextColor(pillarColor[0], pillarColor[1], pillarColor[2])
    pdf.setFontSize(16)
    pdf.text(String(day.day), 25, 21, { align: 'center' })
    
    // День X
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(20)
    pdf.text('День ' + day.day, 45, 15)
    
    // Рубрика и формат
    pdf.setFontSize(12)
    pdf.text(day.pillar + '  •  ' + formatLabel, 45, 27)
    
    // Статус
    if (day.done) {
      pdf.setFillColor(34, 197, 94)
      pdf.roundedRect(pageWidth - 45, 10, 35, 15, 3, 3, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(10)
      pdf.text('Готово', pageWidth - 27.5, 20, { align: 'center' })
    }
    
    let y = 50
    
    // ===== ТЕМА =====
    pdf.setFillColor(250, 250, 255)
    pdf.roundedRect(margin, y, contentWidth, 30, 4, 4, 'F')
    
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(10)
    pdf.text('ТЕМА ПУБЛИКАЦИИ', margin + 10, y + 12)
    
    pdf.setTextColor(30, 30, 30)
    pdf.setFontSize(14)
    const topicLines = pdf.splitTextToSize(day.topic, contentWidth - 20)
    pdf.text(topicLines, margin + 10, y + 24)
    
    y += 40
    
    // ===== ХУК =====
    pdf.setFillColor(255, 250, 245)
    pdf.setDrawColor(245, 158, 11)
    pdf.setLineWidth(0.5)
    
    // Рассчитываем высоту блока хука
    pdf.setFontSize(12)
    const hookLines = pdf.splitTextToSize(day.hook, contentWidth - 25)
    const hookBlockHeight = Math.max(50, 25 + hookLines.length * 6)
    
    pdf.roundedRect(margin, y, contentWidth, hookBlockHeight, 4, 4, 'FD')
    
    // Иконка кавычки
    pdf.setFillColor(245, 158, 11)
    pdf.circle(margin + 12, y + 15, 6, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(14)
    pdf.text('"', margin + 12, y + 19, { align: 'center' })
    
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(10)
    pdf.text('ХУК / НАЧАЛО ПОСТА', margin + 25, y + 12)
    
    pdf.setTextColor(50, 50, 50)
    pdf.setFontSize(12)
    pdf.text(hookLines, margin + 25, y + 25)
    
    y += hookBlockHeight + 10
    
    // ===== СОВЕТ =====
    if (day.tip) {
      pdf.setFillColor(240, 253, 244)
      pdf.setDrawColor(34, 197, 94)
      pdf.setLineWidth(0.5)
      
      pdf.setFontSize(11)
      const tipLines = pdf.splitTextToSize(day.tip, contentWidth - 25)
      const tipBlockHeight = Math.max(45, 25 + tipLines.length * 5.5)
      
      pdf.roundedRect(margin, y, contentWidth, tipBlockHeight, 4, 4, 'FD')
      
      // Иконка лампочки
      pdf.setFillColor(34, 197, 94)
      pdf.circle(margin + 12, y + 15, 6, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(12)
      pdf.text('💡', margin + 8, y + 18)
      
      pdf.setTextColor(100, 100, 100)
      pdf.setFontSize(10)
      pdf.text('СОВЕТ ПО СОЗДАНИЮ', margin + 25, y + 12)
      
      pdf.setTextColor(50, 50, 50)
      pdf.setFontSize(11)
      pdf.text(tipLines, margin + 25, y + 25)
      
      y += tipBlockHeight + 10
    }
    
    // ===== ЧЕКЛИСТ =====
    pdf.setFillColor(252, 252, 255)
    pdf.roundedRect(margin, y, contentWidth, 55, 4, 4, 'F')
    
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(10)
    pdf.text('ЧЕКЛИСТ ПЕРЕД ПУБЛИКАЦИЕЙ', margin + 10, y + 12)
    
    pdf.setTextColor(70, 70, 70)
    pdf.setFontSize(10)
    
    const checklist = [
      'Текст вычитан и отредактирован',
      'Визуал подготовлен (фото/видео/карусель)',
      'Хештеги добавлены',
      'Время публикации выбрано'
    ]
    
    checklist.forEach((item, i) => {
      // Пустой квадрат для галочки
      pdf.setDrawColor(180, 180, 180)
      pdf.setLineWidth(0.3)
      pdf.rect(margin + 10, y + 20 + i * 8, 4, 4, 'S')
      pdf.text(item, margin + 20, y + 23 + i * 8)
    })
    
    // ===== ФУТЕР СТРАНИЦЫ =====
    pdf.setTextColor(200, 200, 200)
    pdf.setFontSize(8)
    pdf.text('День ' + day.day + ' из ' + plan.length, pageWidth / 2, pageHeight - 10, { align: 'center' })
  })
  
  // ===== ФИНАЛЬНАЯ СТРАНИЦА =====
  pdf.addPage()
  
  pdf.setFillColor(139, 92, 246)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')
  
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(28)
  pdf.text('Удачи с контентом! 🚀', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' })
  
  pdf.setFontSize(14)
  pdf.text('Ты справишься!', pageWidth / 2, pageHeight / 2 + 5, { align: 'center' })
  
  pdf.setFontSize(12)
  pdf.text('Создано в PsyContent AI', pageWidth / 2, pageHeight / 2 + 30, { align: 'center' })

  pdf.save('content-plan-' + new Date().toISOString().split('T')[0] + '.pdf')
}
