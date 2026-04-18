'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  Sparkles,
  FileText,
  PenTool,
  LogOut,
  User,
  BookOpen,
  Target,
  Wrench,
  Star,
  MessageCircle,
  Film,
  RefreshCcw,
  Lightbulb,
  Settings,
  History,
  Layers,
  Search,
  Zap,
} from 'lucide-react'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUser(user)

      const { data } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!data) { router.push('/onboarding'); return }
      setProfile(data)
      setLoading(false)
    }
    init()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  const displayName = profile?.full_name || 'Специалист'

  const formatArray = (val: any) => {
    if (!val) return '—'
    if (Array.isArray(val)) return val.join(', ')
    if (typeof val === 'string') return val
    return '—'
  }

  const tools = [
    {
      icon: Target,
      title: 'Паспорт бренда',
      desc: 'Ваше позиционирование, тон голоса и аватар клиента',
      status: 'Открыть',
      color: 'text-purple-500',
      bg: 'bg-purple-50',
      href: '/dashboard/brand-passport',
      ready: true,
      badge: null,
    },
    {
      icon: PenTool,
      title: 'Генератор постов',
      desc: 'Создавайте посты и stories за 30 секунд',
      status: 'Открыть',
      color: 'text-violet-500',
      bg: 'bg-violet-50',
      href: '/dashboard/post-generator',
      ready: true,
      badge: null,
    },
    {
      icon: Layers,
      title: 'Генератор каруселей',
      desc: '8-10 слайдов с хуком и структурой',
      status: 'Открыть',
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      href: '/dashboard/carousel-generator',
      ready: true,
      badge: null,
    },
    {
      icon: Zap,
      title: 'Генератор хуков',
      desc: '12 цепляющих хуков для Reels, постов, каруселей и Stories',
      status: 'Открыть',
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      href: '/dashboard/hooks-generator',
      ready: true,
      badge: 'NEW',
    },
    {
      icon: FileText,
      title: 'Контент-план',
      desc: 'Персональный план публикаций на 30 дней',
      status: 'Открыть',
      color: 'text-green-500',
      bg: 'bg-green-50',
      href: '/dashboard/content-plan',
      ready: true,
      badge: null,
    },
    {
      icon: Wrench,
      title: 'Исследование тем',
      desc: 'AI найдёт 30 трендовых тем под вашу нишу',
      status: 'Открыть',
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      href: '/dashboard/research',
      ready: true,
      badge: null,
    },
    {
      icon: Film,
      title: 'Рилс-скрипты',
      desc: 'Готовые сценарии на 30 и 60 секунд',
      status: 'Открыть',
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
      href: '/dashboard/reels',
      ready: true,
      badge: null,
    },
    {
      icon: RefreshCcw,
      title: 'Переписывание текста',
      desc: 'Превратим ваши мысли в вирусный пост',
      status: 'Открыть',
      color: 'text-cyan-500',
      bg: 'bg-cyan-50',
      href: '/dashboard/rewrite',
      ready: true,
      badge: null,
    },
    {
      icon: Search,
      title: 'Анализ конкурентов',
      desc: 'Разбор Reels/TikTok/YouTube — получите сценарий',
      status: 'Открыть',
      color: 'text-red-500',
      bg: 'bg-red-50',
      href: '/dashboard/competitor-analysis',
      ready: true,
      badge: null,
    },
    {
      icon: History,
      title: 'История постов',
      desc: 'Все сгенерированные посты в одном месте',
      status: 'Открыть',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
      href: '/dashboard/post-history',
      ready: true,
      badge: null,
    },
    {
      icon: Lightbulb,
      title: 'Промпты и инструкции',
      desc: 'Готовые схемы для ChatGPT',
      status: 'Скоро',
      color: 'text-fuchsia-500',
      bg: 'bg-fuchsia-50',
      href: '#',
      ready: false,
      badge: null,
    },
    {
      icon: Star,
      title: 'Портфолио отзывов',
      desc: 'Соберите и оформите отзывы клиентов',
      status: 'Скоро',
      color: 'text-yellow-500',
      bg: 'bg-yellow-50',
      href: '#',
      ready: false,
      badge: null,
    },
    {
      icon: BookOpen,
      title: 'База знаний',
      desc: 'Мини-курс по SMM для психологов',
      status: 'Скоро',
      color: 'text-pink-500',
      bg: 'bg-pink-50',
      href: '#',
      ready: false,
      badge: null,
    },
  ]

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* ═══════════════ HEADER ═══════════════ */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          {/* Лого */}
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-brand-accent" />
            <span className="text-lg sm:text-xl font-bold text-brand-text">PsyContent</span>
          </div>

          {/* Юзер + выход */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Имя — скрыто на совсем маленьких экранах */}
            <div className="hidden sm:flex items-center gap-2 text-sm text-brand-text-secondary">
              <User className="w-4 h-4" />
              <span className="max-w-[120px] truncate">{displayName}</span>
            </div>
            {/* На мобилке — только иконка юзера */}
            <div className="flex sm:hidden items-center text-brand-text-secondary">
              <User className="w-4 h-4" />
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-brand-text-secondary hover:text-red-500 transition cursor-pointer p-2 -mr-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════════ CONTENT ═══════════════ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">

        {/* ── Welcome ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-10"
        >
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-brand-text mb-1 sm:mb-2">
            Привет, {displayName}! 👋
          </h1>
          <p className="text-brand-text-secondary text-base sm:text-lg">
            Ваш кабинет готов. Вот что мы знаем о вас:
          </p>
        </motion.div>

        {/* ── Profile Summary ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 sm:mb-10 p-4 sm:p-6 rounded-2xl bg-white border border-brand-border"
        >
          {/* Заголовок профиля */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-bold text-brand-text flex items-center gap-2">
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-accent shrink-0" />
              <span className="hidden sm:inline">Ваш профиль распаковки</span>
              <span className="sm:hidden">Профиль</span>
            </h2>
            <button
              onClick={() => router.push('/dashboard/edit-profile')}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-brand-text-secondary hover:text-brand-accent hover:bg-brand-highlight rounded-xl transition cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Редактировать</span>
            </button>
          </div>
          
          {/* Верхний грид — 1 col на мобилке, 2 на md, 4 на lg */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Подход</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text">
                {formatArray(profile?.approaches)}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Ниша</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text">
                {formatArray(profile?.niches)}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg col-span-2 lg:col-span-1">
              <p className="text-xs text-brand-text-secondary mb-1">Голос бренда</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text line-clamp-2">
                {profile?.live_voice || '—'}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg col-span-2 lg:col-span-1">
              <p className="text-xs text-brand-text-secondary mb-1">Цель на 3 месяца</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text line-clamp-2">
                {profile?.goal_3_months || '—'}
              </p>
            </div>
          </div>

          {/* Нижний грид — 1 col на мобилке, 3 на md+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Опыт</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text">
                {profile?.experience || '—'}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Площадки</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text">
                {formatArray(profile?.platforms)}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Клиентов сейчас</p>
              <p className="text-xs sm:text-sm font-semibold text-brand-text">
                {profile?.current_clients || '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Tools Heading ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4 sm:mb-6"
        >
          <h2 className="text-lg sm:text-xl font-bold text-brand-text">
            Ваши инструменты
          </h2>
        </motion.div>

        {/* ── Tools Grid — 1 col на мобилке, 2 на md, 3 на lg ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {tools.map((tool, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.03 }}
              onClick={() => tool.ready && router.push(tool.href)}
              className={`relative p-4 sm:p-6 rounded-2xl bg-white border border-brand-border hover:shadow-md transition active:scale-[0.98] group ${
                tool.ready ? 'cursor-pointer' : 'opacity-70'
              }`}
            >
              {/* NEW badge */}
              {tool.badge && (
                <span className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
                  {tool.badge}
                </span>
              )}

              {/* Мобилка: горизонтальный лейаут. Десктоп: вертикальный */}
              <div className="flex sm:block items-start gap-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${tool.bg} flex items-center justify-center shrink-0 sm:mb-4 group-hover:scale-110 transition`}>
                  <tool.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${tool.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-brand-text text-sm sm:text-base mb-0.5 sm:mb-2">{tool.title}</h3>
                  <p className="text-xs sm:text-sm text-brand-text-secondary mb-2 sm:mb-4 line-clamp-2">{tool.desc}</p>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full ${
                    tool.ready
                      ? 'text-brand-accent bg-brand-highlight'
                      : 'text-gray-400 bg-gray-100'
                  }`}>
                    {tool.status} →
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Motivation ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8 sm:mt-12 p-4 sm:p-6 rounded-2xl bg-brand-accent text-white text-center"
        >
          <h3 className="text-lg sm:text-xl font-bold mb-2">
            Вы уже на шаг впереди 90% психологов 🚀
          </h3>
          <p className="text-white/80 text-sm sm:text-base max-w-lg mx-auto">
            Вы прошли распаковку и теперь мы знаем ваш голос. Используйте инструменты
            чтобы превратить знания в контент, привлекающий клиентов.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
