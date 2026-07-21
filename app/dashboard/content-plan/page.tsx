'use client'

import { useState, useEffect } from 'react'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { generatePDF } from '@/lib/pdf-export'
import {
  ArrowLeft, Loader2, CalendarDays,
  AlignLeft, Image, Film, FileText,
  CheckCircle2, Circle, PenTool, X,
  RefreshCw, Lightbulb, ChevronRight,
  Download, Copy, FileSpreadsheet, Check,
  Layers,
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import EmptyState from '@/components/EmptyState'
import { LimitNotice } from '@/components/LimitNotice'
import { ServerErrorNotice } from '@/components/ServerErrorNotice'

type DayItem = {
  day: number
  pillar: string
  topic: string
  format: string
  hook: string
  tip: string
  done?: boolean
}

const FORMAT_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  post:     { icon: AlignLeft, label: 'Пост',     color: 'text-brand-accent', bg: 'bg-brand-soft' },
  carousel: { icon: Layers,    label: 'Карусель', color: 'text-brand-accent', bg: 'bg-brand-soft' },
  reels:    { icon: Film,      label: 'Рилс',     color: 'text-brand-sage', bg: 'bg-brand-soft' },
  stories:  { icon: FileText,  label: 'Stories',  color: 'text-brand-muted', bg: 'bg-brand-soft' },
}

const PILLAR_META: Record<string, { color: string; dot: string }> = {
  'Психообразование': { color: 'text-brand-accent bg-brand-soft border-brand-border-soft', dot: 'bg-brand-accent' },
  'Личное':           { color: 'text-brand-text bg-brand-soft border-brand-border-soft', dot: 'bg-brand-muted' },
  'Практика':         { color: 'text-brand-sage bg-brand-soft border-brand-border-soft', dot: 'bg-brand-sage' },
  'Истории':          { color: 'text-brand-muted bg-brand-soft border-brand-border-soft', dot: 'bg-brand-muted' },
  'Позиционирование': { color: 'text-brand-accent bg-brand-soft border-brand-border-soft', dot: 'bg-brand-accent' },
}

function getPillarMeta(pillar: string) {
  return PILLAR_META[pillar] || { color: 'text-gray-600 bg-gray-50 border-gray-200', dot: 'bg-gray-400' }
}

// ============ ТРЕКЕР РИТМА (North Star: 4+ материала в месяц) ============
// Считаем созданные материалы (посты/карусели/рилс) за текущий календарный месяц.
// Спокойный трекер, не геймификация: сегменты к цели 4 + живой рост числа.
const RHYTHM_GOAL = 4

function pluralMaterial(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'материал'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'материала'
  return 'материалов'
}

function rhythmCaption(n: number): string {
  if (n === 0) return 'Месяц только начался, тут пока пусто. Дальше появится твой ритм.'
  if (n < RHYTHM_GOAL) return 'Ты в процессе. Держи ритм, и блог понемногу набирает вес.'
  return 'Четыре в месяц, ты в том ритме, с которого блог начинает приводить людей.'
}

function RhythmTracker({ count }: { count: number }) {
  const reached = count >= RHYTHM_GOAL
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-brand-soft border border-brand-border-soft rounded-2xl px-4 py-3.5 md:px-5 md:py-4 mb-6 md:mb-8"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted mb-2">Твой ритм · этот месяц</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        {/* Число за месяц */}
        <div className="shrink-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`text-[28px] md:text-[32px] leading-none font-bold ${count === 0 ? 'text-brand-muted' : 'text-brand-accent'}`}>{count}</span>
          <span className="text-sm text-brand-text-secondary">{pluralMaterial(count)} собрано</span>
          {reached && (
            <span className="inline-flex items-center gap-1 text-brand-sage text-xs font-semibold ml-1">
              <Check className="w-3.5 h-3.5" /> в ритме
            </span>
          )}
        </div>
        {/* Движение к цели + подпись */}
        <div className="sm:flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: RHYTHM_GOAL }).map((_, i) => (
                <span key={i} className={`h-1.5 w-8 rounded-full ${i < Math.min(count, RHYTHM_GOAL) ? 'bg-brand-accent' : 'bg-brand-border-soft'}`} />
              ))}
            </div>
            <span className="text-[11px] text-brand-muted shrink-0">цель: 4+</span>
          </div>
          <p className="text-[13px] md:text-sm text-brand-text-secondary leading-snug">{rhythmCaption(count)}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ============ EXPORT COMPONENT ============
function ExportMenu({ plan }: { plan: DayItem[] }) {
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
    const headers = ['День', 'Рубрика', 'Формат', 'Тема', 'Хук', 'Статус']
    const rows = plan.map(day => [
      day.day,
      `"${day.pillar}"`,
      `"${day.format}"`,
      `"${day.topic.replace(/"/g, '""')}"`,
      `"${(day.hook || '').replace(/"/g, '""')}"`,
      day.done ? 'Готово' : 'Не готово'
    ])

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
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
    setExporting(true)
    setShowMenu(false)
    try {
      await generatePDF(plan)
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
        className="flex items-center justify-center w-11 h-11 md:w-auto md:h-auto md:gap-2 md:px-4 md:py-2 text-sm font-medium text-brand-text-secondary hover:text-brand-text bg-white border border-brand-border rounded-xl hover:border-brand-accent/50 transition cursor-pointer disabled:opacity-50"
      >
        {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
        <span className="hidden md:inline">{exporting ? 'Создаю PDF...' : 'Экспорт'}</span>
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-brand-border rounded-xl shadow-lg z-50 overflow-hidden">
            <button onClick={copyAsText} className="w-full flex items-center gap-3 px-5 py-4 text-base md:text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left">
              {copied ? <Check className="w-5 h-5 text-brand-sage" /> : <Copy className="w-5 h-5 text-brand-text-secondary" />}
              {copied ? 'Скопировано!' : 'Копировать текст'}
            </button>
            <button onClick={exportToCSV} className="w-full flex items-center gap-3 px-5 py-4 text-base md:text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left border-t border-brand-border">
              <FileSpreadsheet className="w-5 h-5 text-brand-sage shrink-0" />
              <div>
                <p>Google Sheets / Excel</p>
                <p className="text-sm text-brand-text-secondary">Скачать CSV</p>
              </div>
            </button>
            <button onClick={exportToPDF} className="w-full flex items-center gap-3 px-5 py-4 text-base md:text-sm text-brand-text hover:bg-brand-bg transition cursor-pointer text-left border-t border-brand-border">
              <FileText className="w-5 h-5 text-brand-sage shrink-0" />
              <div>
                <p>Скачать PDF</p>
                <p className="text-sm text-brand-text-secondary">Красивый дизайн</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ============ DAY CARD ============
function DayCard({ item, onToggle, onGenerate }: { item: DayItem; onToggle: () => void; onGenerate: () => void }) {
  const [hover, setHover] = useState(false)
  const fmt = FORMAT_META[item.format] || FORMAT_META.post
  const pillar = getPillarMeta(item.pillar)
  const Icon = fmt.icon

  const buttonText = item.format === 'carousel' ? 'Создать карусель' : 'Написать пост'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        item.done ? 'border-brand-border-soft bg-brand-soft/30 opacity-70' : 'border-brand-border bg-white hover:border-brand-accent/40 hover:shadow-md'
      }`}
    >
      {/* Шапка */}
      <div className="flex items-center justify-between p-5 pb-3 md:p-4 md:pb-2">
        <div className="flex items-center gap-3">
          <span className={`text-[15px] md:text-xs font-bold w-10 h-10 md:w-7 md:h-7 rounded-full flex items-center justify-center shrink-0 ${item.done ? 'bg-brand-soft text-brand-muted' : 'bg-brand-highlight text-brand-accent'}`}>
            {item.day}
          </span>
          <span className={`text-[15px] md:text-xs font-semibold px-3 py-1.5 md:px-2 md:py-0.5 rounded-full border ${pillar.color}`}>
            {item.pillar}
          </span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="cursor-pointer transition p-2 -mr-2 md:p-0 md:mr-0">
          {item.done
            ? <CheckCircle2 className="w-7 h-7 md:w-5 md:h-5 text-brand-sage" />
            : <Circle className={`w-7 h-7 md:w-5 md:h-5 ${hover ? 'text-brand-accent' : 'text-gray-300'} transition`} />
          }
        </button>
      </div>

      {/* Формат */}
      <div className="px-5 pb-2 md:px-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 md:gap-1.5 md:px-2 md:py-0.5 rounded-lg ${fmt.bg}`}>
          <Icon className={`w-[18px] h-[18px] md:w-3.5 md:h-3.5 ${fmt.color}`} />
          <span className={`text-[15px] md:text-xs font-semibold ${fmt.color}`}>{fmt.label}</span>
        </div>
      </div>

      {/* Тема */}
      <div className="px-5 pb-3 md:px-4 md:pb-2">
        <p className={`text-[18px] md:text-base font-bold leading-snug ${item.done ? 'text-gray-400 line-through' : 'text-brand-text'}`}>
          {item.topic}
        </p>
      </div>

      {/* Идея */}
      {(item as any).tip && !item.done && (
        <div className="px-5 pb-3 md:px-4 md:pb-2">
          <p className="text-[16px] md:text-sm text-brand-text-secondary leading-relaxed">
            {(item as any).tip}
          </p>
        </div>
      )}

      {/* Хук */}
      {item.hook && !item.done && (
        <div className="mx-5 mb-4 p-4 md:mx-4 md:mb-3 md:p-3 rounded-xl bg-brand-highlight/50 border border-brand-accent/20">
          <p className="text-[13px] md:text-xs text-brand-text-muted uppercase tracking-wide font-semibold mb-1.5">Хук</p>
          <p className="text-[16px] md:text-sm text-brand-text italic leading-relaxed">«{item.hook}»</p>
        </div>
      )}

      {/* Кнопка */}
      {!item.done && (
        <div className={`px-5 pb-5 md:px-4 md:pb-4 md:transition-all md:duration-200 ${hover ? 'md:block' : 'md:hidden'} block`}>
          <button
            onClick={(e) => { e.stopPropagation(); onGenerate(); }}
            className={`w-full flex items-center justify-center gap-2.5 py-4 md:py-2.5 rounded-xl text-white text-[16px] md:text-xs font-semibold transition cursor-pointer active:scale-[0.98] ${
              item.format === 'carousel'
                ? 'bg-brand-accent hover:bg-brand-accent-hover active:bg-brand-accent-hover'
                : 'bg-brand-accent hover:bg-brand-accent-hover'
            }`}
          >
            {item.format === 'carousel' ? <Layers className="w-5 h-5 md:w-3.5 md:h-3.5" /> : <PenTool className="w-5 h-5 md:w-3.5 md:h-3.5" />}
            {buttonText}
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ============ DETAIL PANEL ============
function DetailPanel({ item, onClose, onGenerate }: { item: DayItem; onClose: () => void; onGenerate: () => void }) {
  const fmt = FORMAT_META[item.format] || FORMAT_META.post
  const pillar = getPillarMeta(item.pillar)
  const Icon = fmt.icon

  const isCarousel = item.format === 'carousel'
  const buttonText = isCarousel ? 'Создать карусель' : 'Сгенерировать пост'
  const buttonClass = isCarousel
    ? 'bg-brand-accent hover:bg-brand-accent-hover shadow-brand-accent/20'
    : 'bg-brand-accent hover:bg-brand-accent-hover shadow-brand-accent/20'

  return (
    <div className="bg-white rounded-t-3xl md:rounded-2xl border border-brand-border p-6 md:sticky md:top-24">
      {/* Ручка для мобильного */}
      <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6 md:hidden" />

      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 md:w-8 md:h-8 rounded-full bg-brand-highlight text-brand-accent text-xl md:text-sm font-bold flex items-center justify-center">{item.day}</span>
          <span className={`text-[16px] md:text-xs font-semibold px-3 py-1.5 md:px-2 md:py-0.5 rounded-full border ${pillar.color}`}>{item.pillar}</span>
        </div>
        <button onClick={onClose} className="cursor-pointer text-brand-text-secondary hover:text-brand-text transition p-2 -mr-2 md:p-1 md:mr-0">
          <X className="w-7 h-7 md:w-5 md:h-5" />
        </button>
      </div>

      <h3 className="text-[22px] md:text-lg font-bold text-brand-text mb-5 leading-snug">{item.topic}</h3>

      <div className={`inline-flex items-center gap-2 px-4 py-2 md:gap-1.5 md:px-3 md:py-1.5 rounded-lg ${fmt.bg} mb-5`}>
        <Icon className={`w-5 h-5 md:w-4 md:h-4 ${fmt.color}`} />
        <span className={`text-[16px] md:text-sm font-semibold ${fmt.color}`}>{fmt.label}</span>
      </div>

      {isCarousel && (
        <div className="mb-5 p-4 md:p-3 bg-brand-soft rounded-xl border border-brand-border-soft">
          <p className="text-[16px] md:text-sm text-brand-text leading-relaxed">
            <strong>Карусель</strong>, это 8-10 слайдов с текстом. AI создаст хук, развитие мысли и призыв к действию.
          </p>
        </div>
      )}

      {item.hook && (
        <div className="mb-5">
          <p className="text-[13px] md:text-xs font-bold text-brand-text-secondary uppercase tracking-wider mb-2.5">Хук (первая строка)</p>
          <div className="p-4 md:p-3 bg-brand-highlight rounded-xl border border-brand-accent/20">
            <p className="text-[17px] md:text-sm text-brand-text italic leading-relaxed">«{item.hook}»</p>
          </div>
        </div>
      )}

      {item.tip && (
        <div className="mb-7 md:mb-6">
          <p className="text-[13px] md:text-xs font-bold text-brand-text-secondary uppercase tracking-wider mb-2.5">Подсказка</p>
          <div className="flex items-start gap-3 p-4 md:p-3 bg-brand-soft rounded-xl border border-brand-border-soft">
            <Lightbulb className="w-6 h-6 md:w-4 md:h-4 text-brand-sage mt-0.5 shrink-0" />
            <p className="text-[16px] md:text-sm text-brand-text leading-relaxed">{item.tip}</p>
          </div>
        </div>
      )}

      <button
        onClick={onGenerate}
        className={`w-full flex items-center justify-center gap-2.5 py-4.5 md:py-3 rounded-xl text-white text-[18px] md:text-sm font-semibold transition shadow-lg cursor-pointer active:scale-[0.98] ${buttonClass}`}
      >
        {isCarousel ? <Layers className="w-6 h-6 md:w-4 md:h-4" /> : <PenTool className="w-6 h-6 md:w-4 md:h-4" />}
        {buttonText}
        <ChevronRight className="w-6 h-6 md:w-4 md:h-4" />
      </button>
    </div>
  )
}

// ============ BATCH CONFIG ============
const BATCH_SIZE = 5
const TOTAL_DAYS = 30
const TOTAL_BATCHES = Math.ceil(TOTAL_DAYS / BATCH_SIZE)

// ============ MAIN PAGE ============
export default function ContentPlan() {
  const [user, setUser] = useState<any>(null)
  const [plan, setPlan] = useState<DayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [needOnboarding, setNeedOnboarding] = useState(false)
  const [serverError, setServerError] = useState(false)
  const [selected, setSelected] = useState<DayItem | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [postsThisMonth, setPostsThisMonth] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)

      // Начало текущего календарного месяца (локально), для счетчика ритма.
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [planRes, countRes] = await Promise.all([
        supabase.from('content_plans').select('plan').eq('user_id', user.id).single(),
        // Считаем материалы контента (посты/сторис/карусели/рилс). Исключаем служебное:
        // хуки (format:'hooks') и рерайты (format:'rewrite_*'), это не самостоятельный материал.
        supabase.from('generated_posts').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', monthStart)
          .not('format', 'eq', 'hooks')
          .not('format', 'like', 'rewrite%'),
      ])

      if (planRes.data?.plan) setPlan(planRes.data.plan)
      setPostsThisMonth(countRes.count || 0)
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)
    setError(null)
    setNeedOnboarding(false)
    setServerError(false)
    setPlan([])
    setCurrentBatch(0)

    try {
      for (let batch = 1; batch <= TOTAL_BATCHES; batch++) {
        setCurrentBatch(batch)

        const res = await fetch('/api/generate-content-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, batch }),
        })

        const data = await res.json()
        if (data?.error === 'need_onboarding') { setNeedOnboarding(true); return }
        if (data?.error === 'server_error') { setServerError(true); return }
        if (!res.ok) throw new Error(data.error || 'Ошибка генерации')

        setPlan(data.plan)

        if (data.complete) break
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
      setCurrentBatch(0)
    }
  }

  const toggleDone = (day: number) => {
    const updated = plan.map(item => item.day === day ? { ...item, done: !item.done } : item)
    setPlan(updated)
    supabase.from('content_plans').upsert({
      user_id: user?.id,
      plan: updated,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  const handleGoGenerate = (item: DayItem) => {
    const params = new URLSearchParams({
      topic: item.topic,
      pillar: item.pillar
    })

    if (item.format === 'carousel') {
      router.push(`/dashboard/carousel-generator?${params}`)
    } else {
      params.append('format', item.format)
      router.push(`/dashboard/post-generator?${params}`)
    }
  }

  const pillars = ['all', 'Психообразование', 'Личное', 'Практика', 'Истории', 'Позиционирование']
  const filtered = filter === 'all' ? plan : plan.filter(d => d.pillar === filter)
  const done = plan.filter(d => d.done).length
  const progressPercent = plan.length > 0 ? Math.round((done / plan.length) * 100) : 0

  const genProgress = currentBatch > 0 ? Math.round((currentBatch / TOTAL_BATCHES) * 100) : 0
  const currentDayStart = (currentBatch - 1) * BATCH_SIZE + 1
  const currentDayEnd = Math.min(currentBatch * BATCH_SIZE, TOTAL_DAYS)

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* ===== NAV ===== */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-14 md:h-16 flex items-center justify-between gap-2">
            <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-brand-text-secondary hover:text-brand-text transition cursor-pointer shrink-0 p-2 -ml-2">
              <ArrowLeft className="w-6 h-6 md:w-5 md:h-5" />
            </button>
            <div className="flex items-center gap-2 md:gap-3">
              {plan.length > 0 && !generating && (
                <>
                  <ExportMenu plan={plan} />
                  <button onClick={handleGenerate} disabled={generating} className="flex items-center justify-center gap-1.5 w-11 h-11 md:w-auto md:h-auto md:px-3 md:py-1.5 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer rounded-xl hover:bg-brand-highlight whitespace-nowrap border border-brand-border md:border-0">
                    <RefreshCw className={`w-5 h-5 md:w-4 md:h-4 shrink-0 ${generating ? 'animate-spin' : ''}`} />
                    <span className="hidden md:inline">Обновить план</span>
                  </button>
                </>
              )}
              <div className="flex items-center gap-1.5">
                <NextImage src="/logo/out_wordmark.svg" alt="PsyCont" width={110} height={28} className="h-6 w-auto" />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ===== CONTENT ===== */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Заголовок */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 md:mb-8">
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-4 py-2 rounded-full text-[15px] md:text-sm font-medium mb-4">
            <CalendarDays className="w-5 h-5 md:w-4 md:h-4" />
            Контент-план
          </div>
          <h1 className="text-[26px] md:text-4xl font-bold text-brand-text mb-2 leading-tight">
            30 дней контента для&nbsp;вашего блога
          </h1>
          <Squiggle variant={1} width="55%" />
          <p className="text-[16px] md:text-base text-brand-text-secondary leading-relaxed mt-3">
            Персональный план на основе вашего паспорта бренда. Нажмите на карточку, получите готовый пост.
          </p>
        </motion.div>

        {/* ===== ТРЕКЕР РИТМА (виден всегда, кроме генерации) ===== */}
        {!generating && <RhythmTracker count={postsThisMonth} />}

        {/* ===== ПУСТОЕ СОСТОЯНИЕ ===== */}
        {!plan.length && !generating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
            <EmptyState
              variant={2}
              title="Ваш план на 30 дней"
              subtitle="AI составит персональный контент-план с темами, форматами и хуками для каждого дня. Займет около 30-40 секунд."
              actionLabel="Составить план"
              onAction={handleGenerate}
            />
            {needOnboarding && <div className="mt-4"><LimitNotice title="Сначала заполните профиль" message="Чтобы собрать контент-план в вашем голосе, нужно пройти короткую распаковку профиля." actionLabel="Заполнить профиль" actionHref="/onboarding" /></div>}
            {serverError && <div className="mt-4"><ServerErrorNotice onRetry={handleGenerate} /></div>}
            {error && !needOnboarding && !serverError && <div className="mt-4 p-4 bg-brand-soft border border-brand-border-soft rounded-xl text-brand-text text-[15px] md:text-sm">{error}</div>}
          </motion.div>
        )}

        {/* ===== ГЕНЕРАЦИЯ ===== */}
        {generating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 md:py-24">
            <div className="relative w-20 h-20 md:w-16 md:h-16 mx-auto mb-6">
              <Loader2 className="w-20 h-20 md:w-16 md:h-16 text-brand-accent animate-spin" />
              <CalendarDays className="w-8 h-8 md:w-6 md:h-6 text-brand-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h2 className="text-[22px] md:text-xl font-bold text-brand-text mb-3">
              Генерирую дни {currentDayStart}-{currentDayEnd}...
            </h2>
            <p className="text-[17px] md:text-base text-brand-text-secondary mb-6">AI подбирает темы под ваш голос и нишу</p>

                       <div className="max-w-md mx-auto px-4">
              <div className="flex justify-between text-[13px] md:text-xs text-brand-text-secondary mb-2">
                {[1, 2, 3, 4, 5, 6].map(b => (
                  <span key={b} className={currentBatch >= b ? 'text-brand-accent font-medium' : ''}>
                    {(b-1)*5+1}-{b*5}
                  </span>
                ))}
              </div>
              <div className="h-3 md:h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-accent"
                  initial={{ width: '0%' }}
                  animate={{ width: `${genProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {plan.length > 0 && (
              <p className="text-[16px] md:text-sm text-brand-sage mt-4">
                ✓ Готово: {plan.length} дней
              </p>
            )}
          </motion.div>
        )}

        {/* ===== ПЛАН ===== */}
        {plan.length > 0 && !generating && (
          <div className={`flex flex-col lg:flex-row gap-6 lg:gap-8 ${selected ? 'items-start' : ''}`}>
            <div className="flex-1 min-w-0">
              {/* Прогресс */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-brand-border p-5 mb-5 md:mb-6">
                <div className="flex items-center justify-between mb-4 md:mb-3">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[28px] md:text-2xl font-bold text-brand-accent">{done}</p>
                      <p className="text-[14px] md:text-xs text-brand-text-secondary">опубликовано</p>
                    </div>
                    <div>
                      <p className="text-[28px] md:text-2xl font-bold text-brand-text">{plan.length - done}</p>
                      <p className="text-[14px] md:text-xs text-brand-text-secondary">осталось</p>
                    </div>
                    <div>
                      <p className="text-[28px] md:text-2xl font-bold text-brand-text">{progressPercent}%</p>
                      <p className="text-[14px] md:text-xs text-brand-text-secondary">выполнено</p>
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 md:h-2">
                  <motion.div className="bg-brand-accent h-3 md:h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.6 }} />
                </div>
              </motion.div>

              {/* Фильтры */}
              <div className="flex gap-2.5 md:gap-2 overflow-x-auto pb-3 mb-5 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
                {pillars.map(p => (
                  <button
                    key={p}
                    onClick={() => setFilter(p)}
                    className={`shrink-0 px-4 py-2.5 md:px-4 md:py-1.5 rounded-full text-[15px] md:text-sm font-medium transition cursor-pointer whitespace-nowrap active:scale-[0.97] ${
                      filter === p
                        ? 'bg-brand-accent text-white'
                        : 'bg-white border border-brand-border text-brand-text-secondary hover:border-brand-accent/50'
                    }`}
                  >
                    {p === 'all' ? `Все ${plan.length}` : p}
                  </button>
                ))}
              </div>

              {/* Сетка карточек */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-3">
                <AnimatePresence>
                  {filtered.map((item, i) => (
                    <motion.div
                      key={item.day}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelected(selected?.day === item.day ? null : item)}
                      className={`cursor-pointer ${selected?.day === item.day ? 'ring-2 ring-brand-accent ring-offset-2 rounded-2xl' : ''}`}
                    >
                      <DayCard item={item} onToggle={() => toggleDone(item.day)} onGenerate={() => handleGoGenerate(item)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Детальная панель */}
            <AnimatePresence>
              {selected && (
                <>
                  {/* Мобильный оверлей */}
                  <motion.div
                    key="overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/40 z-50 lg:hidden"
                    onClick={() => setSelected(null)}
                  />

                  {/* Мобильная шторка снизу */}
                  <motion.div
                    key="detail-mobile"
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="fixed inset-x-0 bottom-0 z-50 lg:hidden max-h-[90vh] overflow-y-auto"
                  >
                    <DetailPanel item={selected} onClose={() => setSelected(null)} onGenerate={() => handleGoGenerate(selected)} />
                  </motion.div>

                  {/* Десктоп сайдбар */}
                  <motion.div
                    key="detail-desktop"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 320 }}
                    exit={{ opacity: 0, width: 0 }}
                    className="shrink-0 hidden lg:block"
                    style={{ width: 320 }}
                  >
                    <DetailPanel item={selected} onClose={() => setSelected(null)} onGenerate={() => handleGoGenerate(selected)} />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Ошибка */}
        {error && !needOnboarding && !serverError && !generating && (
          <div className="max-w-lg mx-auto mt-6 p-5 md:p-4 bg-brand-soft border border-brand-border-soft rounded-xl text-brand-text text-[16px] md:text-sm text-center">
            {error}
            <button
              onClick={handleGenerate}
              className="block mx-auto mt-3 text-brand-accent hover:underline cursor-pointer text-[16px] md:text-sm"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
