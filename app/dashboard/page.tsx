'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  Sparkles, Target, PenTool, Layers, Zap, FileText,
  Wrench, Film, RefreshCcw, Search, History,
  CheckCircle2, Circle, ArrowRight, TrendingUp,
  BookOpen, Star,
} from 'lucide-react'

const toolGroups = [
  {
    label: 'Создать контент',
    items: [
      { icon: PenTool,    title: 'Генератор постов',   desc: 'Пост за 30 секунд под ваш голос',    href: '/dashboard/post-generator',      badge: null,    color: 'bg-violet-100 text-violet-600' },
      { icon: Layers,     title: 'Карусели',            desc: '8–10 слайдов с хуком и структурой',  href: '/dashboard/carousel-generator',  badge: null,    color: 'bg-blue-100 text-blue-600' },
      { icon: Film,       title: 'Рилс-скрипты',        desc: 'Сценарии 30 и 60 сек',               href: '/dashboard/reels',               badge: null,    color: 'bg-indigo-100 text-indigo-600' },
      { icon: Zap,        title: 'Генератор хуков',     desc: '12 хуков для любого формата',        href: '/dashboard/hooks-generator',     badge: 'NEW',   color: 'bg-amber-100 text-amber-600' },
    ],
  },
  {
    label: 'Стратегия',
    items: [
      { icon: FileText,   title: 'Контент-план',        desc: '30 дней публикаций',                 href: '/dashboard/content-plan',        badge: null,    color: 'bg-green-100 text-green-600' },
      { icon: Target,     title: 'Паспорт бренда',      desc: 'Позиционирование и TOV',             href: '/dashboard/brand-passport',      badge: null,    color: 'bg-purple-100 text-purple-600' },
      { icon: Wrench,     title: 'Исследование тем',    desc: '30 трендовых тем под вашу нишу',     href: '/dashboard/research',            badge: null,    color: 'bg-orange-100 text-orange-600' },
      { icon: Search,     title: 'Анализ конкурентов',  desc: 'Разбор Reels/TikTok/YouTube',        href: '/dashboard/competitor-analysis', badge: null,    color: 'bg-red-100 text-red-600' },
    ],
  },
  {
    label: 'Инструменты',
    items: [
      { icon: RefreshCcw, title: 'Переписать текст',    desc: 'Превратим мысли в вирусный пост',    href: '/dashboard/rewrite',             badge: null,    color: 'bg-cyan-100 text-cyan-600' },
      { icon: History,    title: 'История постов',      desc: 'Все сгенерированные посты',           href: '/dashboard/post-history',        badge: null,    color: 'bg-emerald-100 text-emerald-600' },
      { icon: BookOpen,   title: 'Промпты',             desc: 'Готовые схемы для ChatGPT',          href: '#',                              badge: 'Скоро', color: 'bg-fuchsia-100 text-fuchsia-600' },
      { icon: Star,       title: 'Портфолио отзывов',   desc: 'Соберите отзывы клиентов',           href: '#',                              badge: 'Скоро', color: 'bg-yellow-100 text-yellow-600' },
    ],
  },
]

const quickActions = [
  { icon: PenTool, label: 'Написать пост', href: '/dashboard/post-generator', color: 'bg-[#7C5CFC] text-white hover:bg-[#6A4CE0]' },
  { icon: Zap,     label: 'Придумать хук', href: '/dashboard/hooks-generator', color: 'bg-white text-[#1E1E2E] hover:bg-[#F4F3FF] border border-[#E5E7EB]' },
  { icon: Film,    label: 'Скрипт Reels',  href: '/dashboard/reels',           color: 'bg-white text-[#1E1E2E] hover:bg-[#F4F3FF] border border-[#E5E7EB]' },
]

const checklistSteps = [
  { key: 'onboarding', label: 'Заполнить профиль',         href: '/dashboard/edit-profile' },
  { key: 'passport',   label: 'Создать паспорт бренда',    href: '/dashboard/brand-passport' },
  { key: 'post',       label: 'Сгенерировать первый пост', href: '/dashboard/post-generator' },
  { key: 'plan',       label: 'Составить контент-план',    href: '/dashboard/content-plan' },
]

export default function Dashboard() {
  const [profile, setProfile]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [checklist, setChecklist] = useState<string[]>([])
  const [stats, setStats]         = useState({ posts: 0, plan: false, passport: false })
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: prof } = await supabase
        .from('onboarding_profiles').select('*').eq('user_id', user.id).single()
      if (!prof) { router.push('/onboarding'); return }
      setProfile(prof)

      const completed: string[] = ['onboarding']
      const [passRes, postsRes, planRes] = await Promise.all([
        supabase.from('brand_passports').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('generated_posts').select('id', { count: 'exact' }).eq('user_id', user.id),
        supabase.from('content_plans').select('id').eq('user_id', user.id).maybeSingle(),
      ])

      if (passRes.data) completed.push('passport')
      if (postsRes.data && postsRes.data.length > 0) completed.push('post')
      if (planRes.data) completed.push('plan')

      setChecklist(completed)
      setStats({
        posts: postsRes.count || postsRes.data?.length || 0,
        plan: !!planRes.data,
        passport: !!passRes.data,
      })
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#7C5CFC] border-t-transparent rounded-full" />
      </div>
    )
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'Специалист'
  const progress  = Math.round((checklist.length / 4) * 100)
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-[#6B7280] mb-1">{greeting} 👋</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1E1E2E] leading-tight">{firstName}</h1>
            <p className="text-[#6B7280] text-sm mt-1">
              {profile?.niches ? `Психолог · ${Array.isArray(profile.niches) ? profile.niches[0] : profile.niches}` : 'Психолог'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E5E7EB] text-sm text-[#1E1E2E] font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-[#7C5CFC]" />
              {stats.posts} постов
            </div>
            {stats.passport && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-100 text-sm text-purple-700 font-medium">
                <Target className="w-3.5 h-3.5" />
                Паспорт готов
              </div>
            )}
            {stats.plan && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-100 text-sm text-green-700 font-medium">
                <FileText className="w-3.5 h-3.5" />
                Есть план
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
        <div className="flex gap-2 flex-wrap">
          {quickActions.map((a) => (
            <button key={a.href} onClick={() => router.push(a.href)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${a.color}`}>
              <a.icon className="w-4 h-4" />
              {a.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Checklist */}
      {checklist.length < 4 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mb-8 p-5 rounded-2xl bg-white border border-[#E5E7EB] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#7C5CFC]" />
              <span className="font-bold text-[#1E1E2E] text-sm">Быстрый старт</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 bg-[#F4F3FF] rounded-full overflow-hidden">
                <div className="h-full bg-[#7C5CFC] rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-[#6B7280] font-medium">{checklist.length}/4</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklistSteps.map((step) => {
              const done = checklist.includes(step.key)
              return (
                <button key={step.key} onClick={() => !done && router.push(step.href)}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left transition cursor-pointer ${
                    done ? 'bg-[#F4F3FF] opacity-60 cursor-default' : 'bg-[#F9F8FF] hover:bg-[#F4F3FF] border border-[#E5E7EB] hover:border-[#7C5CFC]/30'
                  }`}>
                  {done
                    ? <CheckCircle2 className="w-4 h-4 text-[#7C5CFC] shrink-0" />
                    : <Circle className="w-4 h-4 text-[#D1D5DB] shrink-0" />}
                  <span className={`text-sm font-medium ${done ? 'line-through text-[#9CA3AF]' : 'text-[#1E1E2E]'}`}>{step.label}</span>
                  {!done && <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF] ml-auto shrink-0" />}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Tool Groups */}
      {toolGroups.map((group, gi) => (
        <motion.div key={group.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + gi * 0.05 }} className="mb-8">
          <h2 className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">{group.label}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {group.items.map((tool) => {
              const disabled = tool.href === '#'
              return (
                <div key={tool.title} onClick={() => !disabled && router.push(tool.href)}
                  className={`relative p-4 rounded-2xl bg-white border border-[#E5E7EB] transition group ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#7C5CFC]/30 hover:shadow-md cursor-pointer active:scale-[0.98]'
                  }`}>
                  {tool.badge && (
                    <span className={`absolute top-3 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                      tool.badge === 'NEW' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}>{tool.badge}</span>
                  )}
                  <div className={`w-9 h-9 rounded-xl ${tool.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}>
                    <tool.icon className="w-4 h-4" />
                  </div>
                  <p className="text-[13px] font-bold text-[#1E1E2E] leading-tight mb-1">{tool.title}</p>
                  <p className="text-[11px] text-[#9CA3AF] leading-snug line-clamp-2">{tool.desc}</p>
                </div>
              )
            })}
          </div>
        </motion.div>
      ))}

      {/* Banner */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="rounded-2xl bg-gradient-to-r from-[#7C5CFC] to-[#9B7FFF] p-6 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-bold text-lg leading-tight mb-1">Вы на шаг впереди 90% психологов 🚀</p>
          <p className="text-white/75 text-sm">Регулярный контент — это клиенты без холодных продаж</p>
        </div>
        <button onClick={() => router.push('/dashboard/content-plan')}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-white text-[#7C5CFC] font-semibold text-sm rounded-xl hover:bg-[#F4F3FF] transition cursor-pointer">
          Составить план <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>

    </div>
  )
}
