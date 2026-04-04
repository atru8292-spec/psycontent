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
} from 'lucide-react'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
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
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!data) {
        router.push('/onboarding')
        return
      }

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
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Специалист'

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
    },
    {
      icon: PenTool,
      title: 'Генератор постов',
      desc: 'Создавайте посты в вашем тоне за 30 секунд',
      status: 'Открыть',
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      href: '/dashboard/post-generator',
      ready: true,
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
    },
    {
      icon: Wrench,
      title: 'Исследование тем',
      desc: 'Perplexity найдёт 30 трендовых тем в интернете под вашу нишу',
      status: 'Открыть',
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      href: '/dashboard/research',
      ready: true,
    },
    {
      icon: Film,
      title: 'Рилс-скрипты',
      desc: 'Готовые сценарии на 30 и 60 секунд',
      status: 'Скоро',
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
      href: '#',
      ready: false,
    },
    {
      icon: RefreshCcw,
      title: 'Переписывание текста',
      desc: 'Превратим ваши мысли в вирусный пост',
      status: 'Скоро',
      color: 'text-cyan-500',
      bg: 'bg-cyan-50',
      href: '#',
      ready: false,
    },
    {
      icon: Lightbulb,
      title: 'Промпты и инструкции',
      desc: '"Сходи туда" - готовые схемы',
      status: 'Скоро',
      color: 'text-fuchsia-500',
      bg: 'bg-fuchsia-50',
      href: '#',
      ready: false,
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
    },
    {
      icon: BookOpen,
      title: 'База знаний',
      desc: 'Мини-курс по SMM для психологов (7 уроков)',
      status: 'Скоро',
      color: 'text-pink-500',
      bg: 'bg-pink-50',
      href: '#',
      ready: false,
    },
  ]

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-accent" />
            <span className="text-xl font-bold text-brand-text">PsyContent</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-brand-text-secondary">
              <User className="w-4 h-4" />
              {displayName}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-brand-text-secondary hover:text-red-500 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">
            Привет, {displayName}! 👋
          </h1>
          <p className="text-brand-text-secondary text-lg">
            Ваш кабинет готов. Вот что мы знаем о вас:
          </p>
        </motion.div>

        {/* Profile Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10 p-6 rounded-2xl bg-white border border-brand-border"
        >
          <h2 className="text-lg font-bold text-brand-text mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-brand-accent" />
            Ваш профиль распаковки
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Подход</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.approach?.join(', ') || '—'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Ниша</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.niche?.join(', ') || '—'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Тон общения</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.tone || '—'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Цель</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.goal || '—'}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Опыт</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.experience || '—'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Площадки</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.platforms?.join(', ') || '—'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-brand-bg">
              <p className="text-xs text-brand-text-secondary mb-1">Клиентов в месяц</p>
              <p className="text-sm font-semibold text-brand-text">
                {profile?.current_clients || '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Tools Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <h2 className="text-xl font-bold text-brand-text mb-6">
            Ваши инструменты
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              onClick={() => tool.ready && router.push(tool.href)}
              className={`p-6 rounded-2xl bg-white border border-brand-border hover:shadow-md transition group ${
                tool.ready ? 'cursor-pointer' : 'opacity-70'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl ${tool.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition`}>
                <tool.icon className={`w-6 h-6 ${tool.color}`} />
              </div>
              <h3 className="font-bold text-brand-text mb-2">{tool.title}</h3>
              <p className="text-sm text-brand-text-secondary mb-4">{tool.desc}</p>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
                tool.ready
                  ? 'text-brand-accent bg-brand-highlight'
                  : 'text-gray-400 bg-gray-100'
              }`}>
                {tool.status} →
              </span>
            </motion.div>
          ))}
        </div>

        {/* Motivation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-12 p-6 rounded-2xl bg-brand-accent text-white text-center"
        >
          <h3 className="text-xl font-bold mb-2">
            Вы уже на шаг впереди 90% психологов 🚀
          </h3>
          <p className="text-white/80 max-w-lg mx-auto">
            Вы прошли распаковку и теперь мы знаем ваш голос. Скоро здесь появятся
            инструменты, которые превратят ваши знания в контент, привлекающий клиентов.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
