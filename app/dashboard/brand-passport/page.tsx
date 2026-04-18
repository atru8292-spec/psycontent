'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Target,
  RefreshCw,
  Download,
  Heart,
  Layers,
  Volume2,
  Users,
  Star,
  Instagram,
  Send,
  LayoutGrid,
  MessageSquare,
  AlertTriangle,
  PenTool,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  FileText,
} from 'lucide-react'
import { generatePassportPDF } from '@/lib/generate-passport-pdf'

// Parse markdown into sections
function parsePassport(content: string) {
  const sections: { num: string; title: string; content: string }[] = []
  const lines = content.split('\n')
  let current: { num: string; title: string; lines: string[] } | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(\d+)\.\s+(.+)/)
    if (headingMatch) {
      if (current) {
        sections.push({ num: current.num, title: current.title, content: current.lines.join('\n').trim() })
      }
      current = { num: headingMatch[1], title: headingMatch[2], lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) {
    sections.push({ num: current.num, title: current.title, content: current.lines.join('\n').trim() })
  }
  return sections
}

function renderContent(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('- ')) {
      return (
        <li key={i} className="flex items-start gap-2 text-brand-text-secondary text-sm leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-accent mt-2 shrink-0" />
          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong class="text-brand-text font-semibold">$1</strong>') }} />
        </li>
      )
    }
    if (line.startsWith('### ') || line.startsWith('**')) {
      const clean = line.replace(/^###\s+/, '').replace(/\*\*/g, '')
      return <p key={i} className="font-semibold text-brand-text mt-3 mb-1 text-sm">{clean}</p>
    }
    if (line.trim() === '') return <div key={i} className="h-2" />
    return (
      <p key={i} className="text-brand-text-secondary text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-brand-text font-semibold">$1</strong>') }}
      />
    )
  })
}

const sectionMeta: Record<string, { icon: any; color: string; bg: string; accent: string }> = {
  '1': { icon: Heart, color: 'text-red-500', bg: 'bg-red-50', accent: 'border-red-200' },
  '2': { icon: Target, color: 'text-purple-500', bg: 'bg-purple-50', accent: 'border-purple-200' },
  '3': { icon: Layers, color: 'text-indigo-500', bg: 'bg-indigo-50', accent: 'border-indigo-200' },
  '4': { icon: Volume2, color: 'text-blue-500', bg: 'bg-blue-50', accent: 'border-blue-200' },
  '5': { icon: Users, color: 'text-green-500', bg: 'bg-green-50', accent: 'border-green-200' },
  '6': { icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50', accent: 'border-yellow-200' },
  '7': { icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-50', accent: 'border-pink-200' },
  '8': { icon: Send, color: 'text-cyan-500', bg: 'bg-cyan-50', accent: 'border-cyan-200' },
  '9': { icon: LayoutGrid, color: 'text-orange-500', bg: 'bg-orange-50', accent: 'border-orange-200' },
  '10': { icon: MessageSquare, color: 'text-teal-500', bg: 'bg-teal-50', accent: 'border-teal-200' },
  '11': { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', accent: 'border-amber-200' },
  '12': { icon: PenTool, color: 'text-brand-accent', bg: 'bg-brand-highlight', accent: 'border-brand-accent/30' },
}

function SectionCard({ section, index }: { section: { num: string; title: string; content: string }; index: number }) {
  const [open, setOpen] = useState(index < 3)
  const meta = sectionMeta[section.num] || sectionMeta['1']
  const Icon = meta.icon
  const lines = section.content.split('\n')
  const hasList = lines.some(l => l.startsWith('- '))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-2xl border bg-white overflow-hidden ${meta.accent}`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50/50 transition cursor-pointer"
      >
        <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-bold ${meta.color} uppercase tracking-wider`}>
            Раздел {section.num}
          </span>
          <h3 className="font-bold text-brand-text text-base leading-tight">{section.title}</h3>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-brand-text-secondary shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-brand-text-secondary shrink-0" />
        )}
      </button>

      {open && (
        <div className={`px-5 pb-5 border-t ${meta.accent}`}>
          <div className="pt-4">
            {hasList ? (
              <ul className="space-y-2">{renderContent(section.content)}</ul>
            ) : (
              <div className="space-y-1">{renderContent(section.content)}</div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function BrandPassport() {
  const [user, setUser] = useState<any>(null)
  const [passport, setPassport] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)

      const { data } = await supabase
        .from('brand_passports')
        .select('content')
        .eq('user_id', user.id)
        .single()

      if (data?.content) {
        setPassport(data.content)
      }
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка генерации')
      }

      setPassport(data.passport)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = () => {
    if (passport) {
      navigator.clipboard.writeText(passport)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownloadTxt = () => {
    if (!passport) return
    const blob = new Blob([passport], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'brand-passport.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPDF = async () => {
    if (!passport) return
    setGeneratingPDF(true)
    try {
      await generatePassportPDF(passport)
    } catch (err) {
      console.error('PDF generation error:', err)
    } finally {
      setGeneratingPDF(false)
    }
  }

  const sections = passport ? parsePassport(passport) : []

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
                       onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-accent" />
            <span className="font-bold text-brand-text">PsyContent</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Target className="w-4 h-4" />
            Паспорт бренда
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-3">
            Ваш персональный паспорт бренда
          </h1>
          <p className="text-brand-text-secondary max-w-xl mx-auto">
            AI проанализировал вашу распаковку и создал стратегический документ
            с позиционированием, архетипом, аватаром клиента и контент-стратегией
          </p>
        </motion.div>

        {/* Generate button */}
        {!passport && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-3 bg-brand-accent text-white px-10 py-5 rounded-2xl text-lg font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer"
            >
              <Sparkles className="w-6 h-6" />
              Сгенерировать паспорт бренда
            </button>
            <p className="text-sm text-brand-text-secondary mt-4">
              Генерация занимает 30–60 секунд
            </p>
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
          </motion.div>
        )}

        {/* Loading */}
        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Loader2 className="w-12 h-12 text-brand-accent animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-brand-text mb-2">
              AI создаёт ваш паспорт бренда...
            </h2>
            <p className="text-brand-text-secondary mb-8">
              Анализируем распаковку, подбираем архетип, формулируем позиционирование
            </p>
            <div className="max-w-md mx-auto space-y-3 text-left">
              {[
                'Определяем миссию и позиционирование...',
                'Подбираем архетип бренда...',
                'Формулируем тон голоса и контентные столбы...',
                'Пишем примеры постов в вашем тоне...',
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-brand-text-secondary">
                  <div
                    className="animate-pulse w-2 h-2 bg-brand-accent rounded-full"
                    style={{ animationDelay: `${i * 0.5}s` }}
                  />
                  {step}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Result */}
        {passport && !generating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Stats bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 bg-white rounded-2xl border border-brand-border">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-brand-accent">{sections.length}</p>
                  <p className="text-xs text-brand-text-secondary">разделов</p>
                </div>
                <div className="h-8 w-px bg-brand-border" />
                <p className="text-sm text-brand-text-secondary">
                  Персональный документ на основе вашей распаковки
                </p>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {/* Копировать текст */}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-2 rounded-lg hover:bg-brand-highlight"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>

                {/* Скачать TXT */}
                <button
                  onClick={handleDownloadTxt}
                  className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-2 rounded-lg hover:bg-brand-highlight"
                >
                  <Download className="w-4 h-4" />
                  TXT
                </button>

                {/* Скачать PDF */}
                <button
                  onClick={handleDownloadPDF}
                  disabled={generatingPDF}
                  className="flex items-center gap-2 text-sm text-white bg-brand-accent hover:bg-brand-accent-hover transition cursor-pointer px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingPDF ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Создаю PDF...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Скачать PDF
                    </>
                  )}
                </button>

                {/* Заново */}
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-2 rounded-lg hover:bg-brand-highlight"
                >
                  <RefreshCw className="w-4 h-4" />
                  Заново
                </button>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-4">
              {sections.map((section, i) => (
                <SectionCard key={section.num} section={section} index={i} />
              ))}
            </div>

            {/* Next step */}
            <div className="mt-8 p-6 bg-brand-accent rounded-2xl text-white text-center">
              <h3 className="text-lg font-bold mb-2">Паспорт готов! Что дальше? 🚀</h3>
              <p className="text-white/80 mb-4">
                Используйте контентные столбы для генерации постов
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="bg-white text-brand-accent px-6 py-2 rounded-full font-semibold hover:bg-white/90 transition cursor-pointer"
                >
                  Вернуться в кабинет
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={generatingPDF}
                  className="bg-white/20 text-white border border-white/30 px-6 py-2 rounded-full font-semibold hover:bg-white/30 transition cursor-pointer disabled:opacity-50"
                >
                  {generatingPDF ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Создаю...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Скачать PDF
                    </span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
