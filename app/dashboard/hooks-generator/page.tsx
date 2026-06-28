'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Zap,
  MessageCircle,
  Video,
  Layers,
  BookOpen,
  Shuffle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  X,
} from 'lucide-react'
import Squiggle from '@/components/Squiggle'

/* ─── типы ─── */
type Hook = {
  type: string
  hook: string
  use: string
  why: string
}

/* ─── константы ─── */
const FORMAT_ICONS: Record<string, any> = {
  reels: Video,
  пост: BookOpen,
  карусель: Layers,
  stories: MessageCircle,
  универсальный: Zap,
}

const FORMAT_COLORS: Record<string, string> = {
  reels: 'bg-brand-soft text-brand-sage',
  пост: 'bg-brand-soft text-brand-accent',
  карусель: 'bg-brand-soft text-brand-accent',
  stories: 'bg-brand-soft text-brand-muted',
  универсальный: 'bg-brand-highlight text-brand-text-secondary',
}

const TYPE_EMOJIS: Record<string, string> = {
  парадокс: '🔄',
  'боль / узнавание': '💔',
  боль: '💔',
  узнавание: '💔',
  вопрос: '❓',
  'история / интрига': '📖',
  история: '📖',
  интрига: '📖',
  'провокация / ударная правда': '💥',
  провокация: '💥',
  самоидентичность: '🪞',
  'цифра / факт': '📊',
  цифра: '📊',
  факт: '📊',
  метафора: '🎭',
  'пост-переворот': '⚡',
  'ломающий шаблон': '🚫',
  признание: '🤍',
  'пост-диагностика': '🔍',
}

const QUICK_TOPICS = [
  'Тревога и как с ней жить',
  'Границы в отношениях',
  'Самооценка и самокритика',
  'Эмоциональная зависимость',
  'Прокрастинация',
  'Отношения с родителями',
  'Выгорание',
  'Страх перемен',
  'Чувство вины',
  'Одиночество',
]

/* ─── обучающий контент ─── */
const HOOK_EDUCATION = {
  title: 'Что такое хук и зачем он нужен?',
  intro:
    'Хук, это первая фраза поста, Reels или карусели, которая ОСТАНАВЛИВАЕТ скролл. У вас есть 1.5 секунды, чтобы зацепить внимание. Без хука даже гениальный текст пролистают.',
  science:
    'Психолог Даниэль Канеман описал две системы мышления: Система 1, быстрая, эмоциональная (реагирует на хуки). Система 2, медленная, логическая. Хук бьет в Систему 1 через три триггера:',
  triggers: [
    {
      name: 'Любопытство',
      desc: 'Мозг стремится закрыть информационный пробел, ему НУЖНО узнать, что дальше',
      icon: '🧲',
    },
    {
      name: 'Эмоция',
      desc: 'Радость, боль, удивление, страх упустить (FOMO), эмоции запоминаются лучше логики',
      icon: '❤️‍🔥',
    },
    {
      name: 'Узнавание',
      desc: '«Это же про меня!», самый сильный триггер для психологического контента',
      icon: '🪞',
    },
  ],
  types: [
    { name: 'Парадокс', example: 'Чем больше стараешься, тем хуже становится', emoji: '🔄' },
    { name: 'Боль / Узнавание', example: 'Ты снова извинилась за то, что чувствуешь', emoji: '💔' },
    { name: 'Вопрос', example: 'А что если твоя тревога, не враг?', emoji: '❓' },
    {
      name: 'История / Интрига',
      example: 'Клиентка сказала фразу, от которой я замолчала на 10 секунд',
      emoji: '📖',
    },
    { name: 'Провокация', example: 'Позитивное мышление разрушает жизни', emoji: '💥' },
    {
      name: 'Самоидентичность',
      example: 'Если ты из тех, кто все переосмысливает, прочитай это',
      emoji: '🪞',
    },
    {
      name: 'Цифра / Факт',
      example: '73% женщин не могут назвать свои потребности в отношениях',
      emoji: '📊',
    },
    {
      name: 'Метафора',
      example: 'Тревога, пожарная сигнализация в пустой комнате',
      emoji: '🎭',
    },
    { name: 'Пост-переворот', example: 'Тебе не нужен план. Тебе нужно разрешение', emoji: '⚡' },
    { name: 'Ломающий шаблон', example: 'Не сохраняй это, ты еще не готова', emoji: '🚫' },
    { name: 'Признание', example: 'Мне надоело быть сильной', emoji: '🤍' },
    {
      name: 'Пост-диагностика',
      example: 'Если часто злишься на успешных, ты боишься своей силы',
      emoji: '🔍',
    },
  ],
  whereToUse: [
    { format: 'Reels', desc: 'Первые 3 секунды, произнести вслух или текст на экране' },
    { format: 'Пост', desc: 'Первая строка, то, что видно до "еще..."' },
    { format: 'Карусель', desc: 'Первый слайд, крупно, 5-7 слов' },
    { format: 'Stories', desc: 'Текст на плашке + стикер-реакция' },
  ],
}

export default function HooksGeneratorPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [hooks, setHooks] = useState<Hook[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [filterFormat, setFilterFormat] = useState<string | null>(null)
  const [showEducation, setShowEducation] = useState(false)
  const [expandedHook, setExpandedHook] = useState<number | null>(null)

  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUser(user)
      setLoading(false)
    }
    init()
  }, [router])

  const handleGenerate = async () => {
    if (!user || !topic.trim()) return
    setGenerating(true)
    setHooks([])
    setError(null)
    setFilterFormat(null)
    setExpandedHook(null)

    try {
      const response = await fetch('/api/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id, topic: topic.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка генерации')
      setHooks(data.hooks)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const copyHook = (index: number) => {
    navigator.clipboard.writeText(hooks[index].hook)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const copyAll = () => {
    const allText = hooks
      .map((h, i) => `${i + 1}. [${h.type.toUpperCase()}] ${h.hook}`)
      .join('\n')
    navigator.clipboard.writeText(allText)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const pickRandomTopic = () => {
    const available = QUICK_TOPICS.filter((t) => t !== topic)
    const random = available[Math.floor(Math.random() * available.length)]
    setTopic(random)
  }

  const filteredHooks = filterFormat
    ? hooks.filter((h) => h.use?.toLowerCase().includes(filterFormat))
    : hooks

  const getTypeEmoji = (type: string) => {
    const lower = type.toLowerCase()
    for (const [key, emoji] of Object.entries(TYPE_EMOJIS)) {
      if (lower.includes(key)) return emoji
    }
    return '✨'
  }

  const getFormatKey = (use: string) => {
    const lower = (use || '').toLowerCase()
    for (const key of Object.keys(FORMAT_ICONS)) {
      if (lower.includes(key)) return key
    }
    return 'универсальный'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* ─── Навбар ─── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Назад в кабинет</span>
          </button>
          <div className="flex items-center gap-2">
            <Image src="/logo/out_wordmark.svg" alt="PsyCont" width={110} height={28} className="h-6 w-auto" />
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* ─── Заголовок ─── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2 bg-brand-soft text-brand-accent px-4 py-2 rounded-full text-sm font-medium">
              <Zap className="w-4 h-4" />
              Генератор хуков
            </div>
            <button
              onClick={() => setShowEducation(!showEducation)}
              className="inline-flex items-center gap-1.5 text-sm text-brand-accent hover:text-brand-accent/80 transition cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              Что такое хук?
            </button>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-2">
            12 цепляющих хуков за один клик
          </h1>
          <Squiggle variant={2} width="55%" />
          <p className="text-brand-text-secondary mt-3">
            Для Reels, постов, каруселей и Stories, чтобы остановить скролл за 1.5 секунды
          </p>
        </motion.div>

        {/* ─── Обучающий блок ─── */}
        <AnimatePresence>
          {showEducation && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-white rounded-2xl border border-brand-border p-6 md:p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center">
                      <Lightbulb className="w-5 h-5 text-brand-sage" />
                    </div>
                    <h2 className="text-xl font-bold text-brand-text">{HOOK_EDUCATION.title}</h2>
                  </div>
                  <button
                    onClick={() => setShowEducation(false)}
                    className="p-1.5 text-brand-text-secondary hover:text-brand-text transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-brand-text leading-relaxed mb-6">{HOOK_EDUCATION.intro}</p>

                <div className="bg-brand-bg rounded-xl p-5 mb-6">
                  <p className="text-sm text-brand-text mb-4">{HOOK_EDUCATION.science}</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {HOOK_EDUCATION.triggers.map((t) => (
                      <div key={t.name} className="bg-white rounded-lg p-4 border border-brand-border">
                        <div className="text-2xl mb-2">{t.icon}</div>
                        <div className="font-semibold text-brand-text text-sm mb-1">{t.name}</div>
                        <div className="text-sm text-brand-text-secondary">{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <h3 className="font-bold text-brand-text mb-4">12 типов хуков</h3>
                <div className="grid sm:grid-cols-2 gap-2 mb-6">
                  {HOOK_EDUCATION.types.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-start gap-3 p-3 rounded-lg bg-brand-bg hover:bg-brand-highlight transition"
                    >
                      <span className="text-lg flex-shrink-0">{t.emoji}</span>
                      <div>
                        <div className="text-sm font-semibold text-brand-text">{t.name}</div>
                        <div className="text-sm text-brand-text-secondary italic">«{t.example}»</div>
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="font-bold text-brand-text mb-3">Где использовать хуки</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {HOOK_EDUCATION.whereToUse.map((w) => (
                    <div key={w.format} className="flex items-center gap-3 p-3 rounded-lg bg-brand-bg">
                      <span className="text-sm font-bold text-brand-accent w-20 flex-shrink-0">
                        {w.format}
                      </span>
                      <span className="text-sm text-brand-text-secondary">{w.desc}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-brand-soft border border-brand-border-soft rounded-xl">
                  <p className="text-sm text-brand-text">
                    💡 <strong>Совет:</strong> Один хук можно использовать в разных форматах.
                    Написали хук для Reels, используйте его же как первый слайд карусели
                    или первую строку поста. Так вы экономите время и тестируете, какой формат
                    дает больше охватов.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Ввод темы ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-brand-border p-6 mb-8"
        >
          <label className="block text-sm font-semibold text-brand-text mb-3">
            О чем хуки?
          </label>

          {/* Инпут + кнопка */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !generating && topic.trim() && handleGenerate()}
                placeholder="Например: тревога, границы, самооценка..."
                className="w-full px-4 py-3.5 rounded-xl border border-brand-border bg-white text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent transition pr-12"
              />
              <button
                onClick={pickRandomTopic}
                title="Случайная тема"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-brand-text-secondary hover:text-brand-accent transition cursor-pointer"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !topic.trim()}
              className={`px-5 py-3.5 rounded-xl font-medium transition flex items-center gap-2 cursor-pointer shrink-0 ${
                generating || !topic.trim()
                  ? 'bg-brand-highlight text-brand-text-secondary cursor-not-allowed'
                  : 'bg-brand-accent text-white hover:bg-brand-accent/90 shadow-sm'
              }`}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Генерирую...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">Сгенерировать</span>
                </>
              )}
            </button>
          </div>

          {/* Быстрые темы */}
          <div className="flex flex-wrap gap-2 mt-4">
            {QUICK_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className={`text-sm px-3 py-1.5 rounded-full border transition cursor-pointer ${
                  topic === t
                    ? 'bg-brand-accent text-white border-brand-accent'
                    : 'border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ─── Ошибка ─── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 bg-brand-soft border border-brand-border-soft rounded-xl text-brand-text text-sm mb-8"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Загрузка ─── */}
        <AnimatePresence>
          {generating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-16"
            >
              <Loader2 className="w-10 h-10 text-brand-accent animate-spin mx-auto mb-4" />
              <p className="font-semibold text-brand-text">AI придумывает хуки...</p>
              <p className="text-sm text-brand-text-secondary mt-1">10,15 секунд</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Результаты ─── */}
        {hooks.length > 0 && !generating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Панель действий */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFilterFormat(null)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition cursor-pointer ${
                    !filterFormat
                      ? 'bg-brand-accent text-white border-brand-accent'
                      : 'border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent'
                  }`}
                >
                  Все ({hooks.length})
                </button>
                {Object.keys(FORMAT_ICONS).map((fmt) => {
                  const count = hooks.filter((h) => h.use?.toLowerCase().includes(fmt)).length
                  if (!count) return null
                  return (
                    <button
                      key={fmt}
                      onClick={() => setFilterFormat(filterFormat === fmt ? null : fmt)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition cursor-pointer capitalize ${
                        filterFormat === fmt
                          ? 'bg-brand-accent text-white border-brand-accent'
                          : 'border-brand-border text-brand-text-secondary hover:border-brand-accent hover:text-brand-accent'
                      }`}
                    >
                      {fmt} ({count})
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyAll}
                  className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-brand-highlight border border-brand-border"
                >
                  {copiedAll ? <Check className="w-4 h-4 text-brand-sage" /> : <Copy className="w-4 h-4" />}
                  Скопировать все
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 text-sm text-brand-text-secondary hover:text-brand-accent transition cursor-pointer px-3 py-1.5 rounded-lg hover:bg-brand-highlight border border-brand-border"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Перегенерировать</span>
                </button>
              </div>
            </div>

            {/* Карточки хуков */}
            <div className="space-y-3">
              {filteredHooks.map((hook, index) => {
                const emoji = getTypeEmoji(hook.type)
                const formatKey = getFormatKey(hook.use)
                const colorClass = FORMAT_COLORS[formatKey] || FORMAT_COLORS['универсальный']
                const IconComponent = FORMAT_ICONS[formatKey] || Zap
                const isExpanded = expandedHook === index

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="group bg-white rounded-xl border border-brand-border hover:border-brand-accent/40 hover:shadow-md transition"
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Номер + эмодзи */}
                        <div className="w-10 h-10 rounded-full bg-brand-bg flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">{emoji}</span>
                        </div>

                        {/* Контент */}
                        <div className="flex-1 min-w-0">
                          <p className="text-brand-text text-base font-medium leading-snug mb-3">
                            &laquo;{hook.hook}&raquo;
                          </p>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm bg-brand-bg text-brand-text-secondary px-2.5 py-1 rounded-full capitalize">
                              {hook.type}
                            </span>

                            <span className={`text-sm px-2.5 py-1 rounded-full flex items-center gap-1 ${colorClass}`}>
                              <IconComponent className="w-3 h-3" />
                              {hook.use}
                            </span>

                            {hook.why && (
                              <button
                                onClick={() => setExpandedHook(isExpanded ? null : index)}
                                className="text-sm text-brand-accent hover:text-brand-accent/80 flex items-center gap-1 transition cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                                Почему работает
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Копировать */}
                        <button
                          onClick={() => copyHook(index)}
                          className="p-2 text-brand-border group-hover:text-brand-accent hover:bg-brand-bg rounded-lg transition cursor-pointer flex-shrink-0"
                          title="Копировать хук"
                        >
                          {copiedIndex === index ? (
                            <Check className="w-4 h-4 text-brand-sage" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Раскрытое объяснение */}
                    <AnimatePresence>
                      {isExpanded && hook.why && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 pt-0">
                            <div className="p-3 bg-brand-bg rounded-lg border border-brand-border">
                              <p className="text-sm text-brand-text-secondary leading-relaxed">
                                <Lightbulb className="w-3 h-3 inline mr-1 text-brand-sage" />
                                {hook.why}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>

            {/* Подсказка внизу */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 p-5 bg-brand-highlight rounded-xl border border-brand-border"
            >
              <h4 className="font-semibold text-brand-text text-sm mb-3">
                🎯 Как выбрать лучший хук?
              </h4>
              <ul className="text-sm text-brand-text-secondary space-y-2">
                <li>• <strong className="text-brand-text">Для охватов</strong>, выбирайте парадокс, провокацию или ломающий шаблон</li>
                <li>• <strong className="text-brand-text">Для вовлечения</strong>, вопрос, самоидентичность или пост-диагностика</li>
                <li>• <strong className="text-brand-text">Для доверия</strong>, признание, история или метафора</li>
                <li>• <strong className="text-brand-text">Для продаж</strong>, боль/узнавание + цифра/факт</li>
              </ul>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Пустое состояние ─── */}
        {hooks.length === 0 && !generating && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center py-16"
          >
            <div className="w-16 h-16 rounded-2xl bg-brand-soft flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-brand-accent" />
            </div>
            <h3 className="font-semibold text-brand-text mb-2">Введите тему и нажмите «Сгенерировать»</h3>
            <p className="text-sm text-brand-text-secondary max-w-md mx-auto">
              AI создаст 12 хуков разных типов, для Reels, постов, каруселей и Stories.
              Каждый хук персонализирован под ваш стиль и подход.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
