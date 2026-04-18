'use client'

import { useState } from 'react'
import { Download, Copy, FileSpreadsheet, FileText, Check, Loader2 } from 'lucide-react'

type DayItem = {
  day: number
  pillar: string
  topic: string
  format: string
  hook: string
  tip?: string
}

interface ContentPlanExportProps {
  plan: DayItem[]
  contentRef: React.RefObject<HTMLDivElement | null>
}

export function ContentPlanExport({ plan, contentRef }: ContentPlanExportProps) {
  const [copied, setCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [exporting, setExporting] = useState(false)

  const copyAsText = () => {
    const text = plan.map(day => 
`День ${day.day}
Рубрика: ${day.pillar}
Формат: ${day.format}
Тема: ${day.topic}
${day.hook ? `Хук: ${day.hook}` : ''}
---`
    ).join('\n\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setShowMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }

  const exportToCSV = () => {
    const headers = ['День', 'Рубрика', 'Формат', 'Тема', 'Хук']
    const rows = plan.map(day => [
      day.day,
      `"${day.pillar}"`,
      `"${day.format}"`,
      `"${day.topic.replace(/"/g, '""')}"`,
      `"${(day.hook || '').replace(/"/g, '""')}"`
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `content-plan-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setShowMenu(false)
  }

  const exportToPDF = async () => {
    if (!contentRef.current) return
    
    setExporting(true)
    setShowMenu(false)

    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pdfWidth - 20
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      let heightLeft = imgHeight
      let position = 10

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight)
        heightLeft -= pdfHeight
      }

      pdf.save(`content-plan-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (error) {
      console.error('PDF export error:', error)
      alert('Ошибка при создании PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-text-secondary hover:text-brand-text bg-white border border-brand-border rounded-xl hover:border-brand-accent/50 transition cursor-pointer disabled:opacity-50"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {exporting ? 'Создаю PDF...' : 'Экспорт'}
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)} 
          />
          
          <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-brand-border rounded-xl shadow-lg z-50 overflow-hidden">
            <button
              onClick={copyAsText}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-brand-text-secondary" />
              )}
              {copied ? 'Скопировано!' : 'Копировать текст'}
            </button>
            
            <button
              onClick={exportToCSV}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left border-t border-brand-border"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <div>
                <p>Google Sheets</p>
                <p className="text-xs text-brand-text-secondary">Скачать CSV</p>
              </div>
            </button>
            
            <button
              onClick={exportToPDF}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left border-t border-brand-border"
            >
              <FileText className="w-4 h-4 text-red-500" />
              <div>
                <p>Скачать PDF</p>
                <p className="text-xs text-brand-text-secondary">Для печати</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
