'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Sparkles, FileText, PenTool, LogOut, User, BookOpen, Target } from 'lucide-react'

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

      // Check if onboarding completed
      const { data } = await supabase
        .from('onboarding_answers')
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

  const displayName = user?.user_metadata?.full_name || user?.email || 'Пользователь'
  const answers = profile?.answers || {}

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

      {/* Main */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-brand-text mb-2">
            Привет, {answers[1] || displayName}! 👋
          </h1>
          <p className="text-brand-text-secondary text-lg">
            Ваш кабинет готов. Вот что можно сделать:
          </p>
        </motion.div>

        {/* Brand Passport Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 p-6 rounded-2xl bg-brand-highlight border border-brand-accent/20"
        >
          <h2 className="text-lg font-bold text-brand-text mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-accent" />
            Ваш профиль
          </h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-brand-text-secondary">Направление:</span>
              <p className="font-semibold text-brand-text mt-1">
                {Array.isArray(answers[2]) ? answers[2].join(', ') : answers[2] || '—'}
              </p>
            </div>
            <div>
              <span className="text-brand-text-secondary">Стиль общения:</span>
              <p className="font-semibold text-brand-text mt-1">{answers[5] || '—'}</p>
            </div>
            <div>
              <span className="text-brand-text-secondary">Площадки:</span>
              <p className="font-semibold text-brand-text mt-1">
                {Array.isArray(answers[6]) ? answers[6].join(', ') : answers[6] || '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl bg-white border border-brand-border hover:shadow-md transition cursor-pointer"
          >
            <PenTool className="w-10 h-10 text-brand-accent mb-4" />
            <h3 className="font-bold text-brand-text mb-2">Создать пост</h3>
            <p className="text-sm text-brand-text-secondary mb-4">
              Генерация поста в вашем стиле и тоне
            </p>
            <span className="text-brand-accent text-sm font-semibold">Скоро →</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-6 rounded-2xl bg-white border border-brand-border hover:shadow-md transition cursor-pointer"
          >
            <FileText className="w-10 h-10 text-brand-accent mb-4" />
            <h3 className="font-bold text-brand-text mb-2">Контент-план</h3>
            <p className="text-sm text-brand-text-secondary mb-4">
              План публикаций на 30 дней
            </p>
            <span className="text-brand-accent text-sm font-semibold">Скоро →</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-6 rounded-2xl bg-white border border-brand-border hover:shadow-md transition cursor-pointer"
          >
            <BookOpen className="w-10 h-10 text-brand-accent mb-4" />
            <h3 className="font-bold text-brand-text mb-2">Паспорт бренда</h3>
            <p className="text-sm text-brand-text-secondary mb-4">
              Ваше позиционирование и тон коммуникации
            </p>
            <span className="text-brand-accent text-sm font-semibold">Скоро →</span>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
