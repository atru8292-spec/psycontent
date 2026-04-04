'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowLeft, Loader2, Search,
  AlignLeft, Image, Film, FileText,
  TrendingUp, Zap, PenTool, RefreshCw,
  Globe, ChevronRight, Filter,
} from 'lucide-react'

type Topic = {
  id: number
  topic: string
  hook: string
  pillar: string
  why: string
  format: string
  trend: string
}

const FORMAT_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  post:     { icon: AlignLeft, label: 'Пост',     color: 'text-purple-600', bg: 'bg-purple-100' },
  carousel: { icon: Image,     label: 'Карусель',  color: 'text-blue-600',   bg: 'bg-blue-100'   },
  reels:    { icon: Film,      label: 'Рилс',      color: 'text-pink-600',   bg: 'bg-pink-100'   },
  stories:  { icon: FileText,  label: 'Stories',   color: 'text-orange-600', bg: 'bg-orange-100' },
}

const PILLAR_COLORS: Record<string, string> = {
  'Психообразование': 'bg-indigo-100 text-indigo-700',
  'Личное':           'bg-rose-100 text-rose-700',
  'Практика':         'bg-green-100 text-green-700',
  'Истории':          'bg-amber-100 text-amber-700',
  'Позиционирование': 'bg-violet-100 text-violet-700',
}

function TopicCard({ topic, index, onGenerate }: { topic: Topic; index: number; onGenerate: (t: Topic) => void }) {
  const fmt = FORMAT_META[topic.format] || FORMAT_META.post
  const Icon = fmt.icon
  const pillarColor = PILLAR_COLORS[topic.pillar] || 'bg-gray-100 text-gray-700'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-white rounded-2xl border border-brand-border p-5 hover:border-brand-accent/40 hover:shadow-md transition-all group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-6 h-6 rounded-full bg-brand-highlight text-brand-accent text-xs font-bold flex items-center justify-center shrink-0">
            {topic.id}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pillarColor}`}>
            {topic.pillar}
          </span>
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${fmt.bg}`}>
            <Icon className={`w-3 h-3 ${fmt.color}`} />
            <span className={`text-xs font-semibold ${fmt.color}`}>{fmt.label}</span>
          </div>
        </div>
      </div>

      {/* Topic */}
      <h3 className="font-bold text-brand-text text-sm leading-snug mb-3">
        {topic.topic}
      </h3>

      {/* Hook */}
      <div className="p-3 rounded-xl bg-brand-highlight border border-brand-accent/20 mb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Zap className="w-3.5 h-3.5 text-brand-accent" />
          <span className="text-xs font-bold text-brand-accent uppercase tracking-wide">Хук</span>
        </div>
        <p className="text-xs text-brand-text italic leading-relaxed">«{topic.hook}»</p>
      </div>

      {/* Why + Trend */}
      <div className="space-y-1.5 mb-4">
        <p className="text-xs text-brand-text-secondary leading-relaxed">
          <span className="font-semibold text-brand-text">Почему зайдёт: </span>
          {topic.why}
        </p>
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-brand-text-secondary shrink-0" />
          <p className="text-xs text-brand-text-secondary">{topic.trend}</p>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => onGenerate(topic)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-accent text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition cursor-pointer hover:bg-brand-accent-hover"
      >
        <PenTool className="w-3.5 h-3.5" />
        Написать пост
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

export default function ResearchTopics() {
  const [user, setUser] = useState<any>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)
      setLoading(false)
    }
    init()
  }, [router])

  const handleSearch = async () => {
    if (!user) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch('/api/research-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка поиска')
      setTopics(data.topics)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  const handleGenerate = (topic: Topic) => {
    const params = new URLSearchParams({
      topic: topic.topic,
      format: topic.format,
      pillar: topic.pillar,
    })
    router.push(`/dashboard/post-generator?${params}`)
  }

  const pillars = ['all', 'Психообразование', 'Личное', 'Практика', 'Истории', 'Позиционирование']
  const filtered = filter === 'all' ? topics : topics.filter(t => t.pillar === filter)

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад в кабинет
          </button>
          <div className="flex items-center gap-3">
            {topics.length > 0 && (
              <button
                onClick={handleSearch}
                disabled={searching}
                className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-brand-highlight"
              >
                <RefreshCw className={`w-4 h-4 ${searching ? 'animate-spin' : ''}`} />
                Обновить
              </button>
            )}
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-accent" />
              <span className="font-bold text-brand-text">PsyContent</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <TrendingUp className="w-4 h-4" />
            Исследование тем
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">
            Что сейчас цепляет в Instagram
          </h1>
          <p className="text-brand-text-secondary max-w-xl">
            Perplexity ищет актуальные темы в интернете прямо сейчас — под ваш голос, нишу и аудиторию.
            Не шаблоны, а живые тренды.
          </p>
        </motion.div>

        {/* Empty state */}
        {!topics.length && !searching && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto text-center py-16"
          >
            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: Globe, label: 'Реальный поиск', desc: 'Perplexity ищет в интернете прямо сейчас' },
                { icon: TrendingUp, label: '30 тем', desc: 'Актуальные, не заезженные' },
                { icon: Zap, label: 'Готовые хуки', desc: 'Для каждой темы — первые 2 строки' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-white rounded-2xl border border-brand-border p-4 text-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="font-semibold text-brand-text text-sm">{label}</p>
                  <p className="text-xs text-brand-text-secondary mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleSearch}
              disabled={searching}
              className="inline-flex items-center gap-3 bg-brand-accent text-white px-10 py-4 rounded-2xl text-lg font-semibold hover:bg-brand-accent-hover transition shadow-lg shadow-brand-accent/25 cursor-pointer"
            >
              <Search className="w-5 h-5" />
              Найти актуальные темы
            </button>
            <p className="text-sm text-brand-text-secondary mt-3">
              Perplexity ищет в интернете ~20-30 секунд
            </p>
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
            )}
          </motion.div>
        )}

        {/* Loading */}
        {searching && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <Loader2 className="w-16 h-16 text-brand-accent animate-spin" />
              <Globe className="w-6 h-6 text-brand-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">Perplexity ищет в интернете...</h2>
            <p className="text-brand-text-secondary mb-6">Анализирует Instagram, Telegram, тренды 2024-2025</p>
            <div className="flex flex-col items-center gap-2 text-sm text-brand-text-secondary">
              {[
                'Сканируем русскоязычный Instagram...',
                'Анализируем Telegram-каналы психологов...',
                'Изучаем поисковые запросы...',
                'Фильтруем под вашу нишу...',
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
                  {s}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Results */}
        {topics.length > 0 && !searching && (
          <div>
            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between bg-white rounded-2xl border border-brand-border p-4 mb-5"
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-2xl font-bold text-brand-accent">{topics.length}</p>
                  <p className="text-xs text-brand-text-secondary">тем найдено</p>
                </div>
                <div className="h-8 w-px bg-brand-border" />
                <p className="text-sm text-brand-text-secondary">
                  Нажми на тему — появится кнопка «Написать пост»
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-brand-text-secondary bg-brand-highlight px-3 py-1.5 rounded-full">
                <Globe className="w-3.5 h-3.5" />
                Источник: веб-поиск Perplexity
              </div>
            </motion.div>

            {/* Filter */}
            <div className="flex gap-2 flex-wrap mb-5">
              {pillars.map(p => (
                <button
                  key={p}
                  onClick={() => setFilter(p)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${
                    filter === p
                      ? 'bg-brand-accent text-white'
                      : 'bg-white border border-brand-border text-brand-text-secondary hover:border-brand-accent/50'
                  }`}
                >
                  {p === 'all' ? `Все ${topics.length}` : `${p} (${topics.filter(t => t.pillar === p).length})`}
                </button>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {filtered.map((topic, i) => (
                  <TopicCard key={topic.id} topic={topic} index={i} onGenerate={handleGenerate} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
