'use client'

import { useState, useEffect } from 'react'
import NextImage from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Loader2, Search,
  AlignLeft, Image, Film, FileText,
  TrendingUp, Zap, PenTool, RefreshCw,
  Globe, ChevronRight, BookOpen, Quote
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'
import EmptyState from '@/components/EmptyState'
import { LimitNotice } from '@/components/LimitNotice'

type Topic = {
  id: number
  block: string
  topic: string
  hook: string
  pillar: string
  why: string
  format: string
  source: string
  cta: string
}

const FORMAT_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  post:     { icon: AlignLeft, label: 'Пост',     color: 'text-brand-accent', bg: 'bg-brand-soft' },
  carousel: { icon: Image,     label: 'Карусель',  color: 'text-brand-accent', bg: 'bg-brand-soft' },
  reels:    { icon: Film,      label: 'Рилс',      color: 'text-brand-sage',  bg: 'bg-brand-soft' },
  stories:  { icon: FileText,  label: 'Stories',   color: 'text-brand-muted', bg: 'bg-brand-soft' },
}

const PILLAR_COLORS: Record<string, string> = {
  'Психообразование': 'bg-brand-soft text-brand-accent',
  'Личное':           'bg-brand-soft text-brand-text',
  'Практика':         'bg-brand-soft text-brand-sage',
  'Истории':          'bg-brand-soft text-brand-muted',
  'Позиционирование': 'bg-brand-soft text-brand-accent',
}

const BLOCK_META: Record<string, { label: string, icon: any, color: string }> = {
  'trend': { label: 'Тренды 2025', icon: TrendingUp, color: 'text-brand-sage' },
  'science': { label: 'Исследования', icon: BookOpen, color: 'text-brand-accent' },
  'quote': { label: 'Цитаты', icon: Quote, color: 'text-brand-text' }
}

function TopicCard({ topic, index, onGenerate }: { topic: Topic; index: number; onGenerate: (t: Topic) => void }) {
  const fmt = FORMAT_META[topic.format] || FORMAT_META.post
  const Icon = fmt.icon
  const pillarColor = PILLAR_COLORS[topic.pillar] || 'bg-gray-100 text-brand-text'
  const blk = BLOCK_META[topic.block] || { label: topic.block, icon: Zap, color: 'text-gray-600' }
  const BlockIcon = blk.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-white rounded-2xl border border-brand-border p-5 hover:border-brand-accent/40 hover:shadow-md transition-all group flex flex-col h-full"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border">
             <BlockIcon className={`w-3 h-3 ${blk.color}`} />
             <span className={`text-xs font-bold uppercase tracking-wider ${blk.color}`}>{blk.label}</span>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${pillarColor}`}>
            {topic.pillar}
          </span>
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${fmt.bg}`}>
            <Icon className={`w-3 h-3 ${fmt.color}`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${fmt.color}`}>{fmt.label}</span>
          </div>
        </div>
      </div>

      {/* Topic */}
      <h3 className="font-bold text-brand-text text-sm leading-snug mb-3">
        {topic.topic}
      </h3>

      {/* Hook */}
      <div className="p-3 rounded-xl bg-brand-highlight border border-brand-accent/20 mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap className="w-3.5 h-3.5 text-brand-accent" />
          <span className="text-xs font-bold text-brand-accent uppercase tracking-wide">Хук</span>
        </div>
        <p className="text-xs text-brand-text italic leading-relaxed">«{topic.hook}»</p>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4 grow">
        <p className="text-xs text-brand-text-secondary leading-relaxed">
          <span className="font-semibold text-brand-text">Почему зайдёт: </span>
          {topic.why}
        </p>
        <div className="flex items-start gap-1.5 bg-brand-bg p-2 rounded-lg">
          <Globe className="w-3.5 h-3.5 text-brand-text-secondary shrink-0 mt-0.5" />
          <p className="text-xs text-brand-text-secondary leading-snug">
             <span className="font-semibold text-brand-text">Источник: </span>
             {topic.source}
          </p>
        </div>
        {topic.cta && (
           <p className="text-xs uppercase tracking-wider font-bold text-brand-text-secondary mt-2">
              CTA: <span className="text-brand-accent">{topic.cta}</span>
           </p>
        )}
      </div>

      {/* CTA Button */}
      <button
        onClick={() => onGenerate(topic)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-accent text-white text-xs font-semibold opacity-100 transition cursor-pointer hover:bg-brand-accent-hover mt-auto"
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
  const [needOnboarding, setNeedOnboarding] = useState(false)
  const [filterBlock, setFilterBlock] = useState('all')
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)
      
      // Load existing
      try {
        const res = await fetch('/api/research-topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, action: 'fetch' }),
        })
        const data = await res.json()
        if (data.topics && data.topics.length > 0) {
           setTopics(data.topics)
        }
      } catch (err) {
        console.error('Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  const handleSearch = async () => {
    if (!user) return
    setSearching(true)
    setError(null)
    setNeedOnboarding(false)
    try {
      const res = await fetch('/api/research-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action: 'generate' }),
      })
      const data = await res.json()
      if (data?.error === 'need_onboarding') { setNeedOnboarding(true); return }
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

  const blocks = [
     { id: 'all', label: 'Все темы' },
     { id: 'trend', label: 'Тренды' },
     { id: 'science', label: 'Исследования' },
     { id: 'quote', label: 'Цитаты' }
  ]
  const filtered = filterBlock === 'all' ? topics : topics.filter(t => t.block === filterBlock)

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
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
              <NextImage src="/logo/out_wordmark.svg" alt="PsyCont" width={110} height={28} className="h-6 w-auto" />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5 sm:mb-8">
          <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <TrendingUp className="w-4 h-4" />
            Исследовательский модуль
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-2">
            Идеи на базе данных и трендов
          </h1>
          <Squiggle variant={0} width="55%" />
          <p className="text-brand-text-secondary max-w-xl mt-3">
            Три блока контента: тренды Instagram/Telegram, актуальные научные исследования (2023-2026) и редкие цитаты. 
            Всё адаптировано под вашу нишу.
          </p>
        </motion.div>

        {/* Empty state */}
        {!topics.length && !searching && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
            <EmptyState
              variant={1}
              title="Темы из трендов и науки"
              subtitle="Нажмите кнопку, и AI проанализирует тренды Telegram и Яндекса, свежие исследования за 2024-2026 год и цитаты классиков. Всё адаптируется под вашу нишу. Займёт около минуты."
              actionLabel="Провести исследование"
              onAction={handleSearch}
            />
            {needOnboarding && (
              <div className="mt-4">
                <LimitNotice title="Сначала заполните профиль" message="Темы подбираются под вашу нишу из профиля. Пройдите короткую распаковку, и мы подберём идеи для вас." actionLabel="Заполнить профиль" actionHref="/onboarding" />
              </div>
            )}
            {error && !needOnboarding && (
              <div className="mt-4 p-4 bg-brand-soft border border-brand-border-soft rounded-xl text-brand-text text-sm">{error}</div>
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
            <h2 className="text-xl font-bold text-brand-text mb-2">Глубокий ресёрч запущен...</h2>
            <p className="text-brand-text-secondary mb-6">Ищем свежие тренды, исследования и цитаты в вашей нише</p>
            <div className="flex flex-col items-center gap-2 text-sm text-brand-text-secondary">
              {[
                'Анализ трендов Telegram и Яндекс Wordstat...',
                'Поиск научных статей за 2023-2026 год...',
                'Подбор цитат классиков и современников...',
                'Генерация сильных хуков...',
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
            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap mb-6">
              {blocks.map(b => {
                 const count = b.id === 'all' ? topics.length : topics.filter(t => t.block === b.id).length
                 return (
                  <button
                    key={b.id}
                    onClick={() => setFilterBlock(b.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
                      filterBlock === b.id
                        ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/20'
                        : 'bg-white border border-brand-border text-brand-text-secondary hover:border-brand-accent/50 hover:bg-brand-highlight/30'
                    }`}
                  >
                    {b.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                       filterBlock === b.id ? 'bg-white/20 text-white' : 'bg-brand-highlight text-brand-text-secondary'
                    }`}>
                       {count}
                    </span>
                  </button>
                 )
              })}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
