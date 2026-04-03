'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  User,
  Target,
  Rocket,
} from 'lucide-react'

const blocks = [
  { id: 'who', title: 'Кто вы', icon: User, color: 'bg-purple-100 text-purple-600' },
  { id: 'where', title: 'Где вы сейчас', icon: Target, color: 'bg-blue-100 text-blue-600' },
  { id: 'goal', title: 'Куда хотите', icon: Rocket, color: 'bg-green-100 text-green-600' },
]

const questions = [
  // Блок 1: Кто вы (0-6)
  {
    block: 0,
    key: 'full_name',
    title: 'Как вас зовут?',
    subtitle: 'Имя, которое увидят ваши клиенты',
    type: 'text',
    placeholder: 'Например: Анна Петрова',
  },
  {
    block: 0,
    key: 'approach',
    title: 'Какой у вас подход?',
    subtitle: 'Выберите один или несколько',
    type: 'multi',
    options: [
      'КПТ (когнитивно-поведенческая)',
      'Гештальт-терапия',
      'Психоанализ',
      'Системная семейная терапия',
      'Арт-терапия',
      'Экзистенциальная терапия',
      'Схема-терапия',
      'EMDR',
      'Эклектика / интегративный',
      'Другое',
    ],
  },
  {
    block: 0,
    key: 'niche',
    title: 'С чем вы работаете?',
    subtitle: 'Основные темы вашей практики',
    type: 'multi',
    options: [
      'Тревожность и панические атаки',
      'Депрессия',
      'Отношения и привязанность',
      'Травма и ПТСР',
      'Самооценка и уверенность',
      'Выгорание',
      'Зависимости',
      'Расстройства пищевого поведения',
      'Дети и подростки',
      'Семейные конфликты',
      'Горевание и утрата',
      'Другое',
    ],
  },
  {
    block: 0,
    key: 'experience',
    title: 'Сколько у вас опыта?',
    subtitle: 'Практический опыт работы с клиентами',
    type: 'single',
    options: [
      'Только учусь / стажировка',
      'До 1 года',
      '1–3 года',
      '3–5 лет',
      '5–10 лет',
      'Больше 10 лет',
    ],
  },
  {
    block: 0,
    key: 'tone',
    title: 'Какой у вас стиль общения?',
    subtitle: 'Как бы вы описали свой тон в текстах',
    type: 'single',
    options: [
      'Тёплый и поддерживающий',
      'Экспертный и структурный',
      'Дерзкий и провокационный',
      'Мягкий и философский',
      'Простой и разговорный',
      'Ироничный с юмором',
    ],
  },
  {
    block: 0,
    key: 'values_text',
    title: 'Что для вас важно в работе?',
    subtitle: 'Ваши ценности как специалиста',
    type: 'textarea',
    placeholder: 'Например: безопасное пространство, честность, уважение к темпу клиента...',
  },
  {
    block: 0,
    key: 'what_annoys',
    title: 'Что вас бесит в индустрии?',
    subtitle: 'Это поможет понять вашу позицию и голос',
    type: 'textarea',
    placeholder: 'Например: инфоцыганство, обещания "вылечу за 1 сессию", обесценивание профессии...',
  },

  // Блок 2: Где вы сейчас (7-10)
  {
    block: 1,
    key: 'current_followers',
    title: 'Сколько у вас подписчиков?',
    subtitle: 'Примерно, на основной площадке',
    type: 'single',
    options: [
      'Пока нет / до 100',
      '100–500',
      '500–1 000',
      '1 000–5 000',
      '5 000–10 000',
      'Больше 10 000',
    ],
  },
  {
    block: 1,
    key: 'platforms',
    title: 'Где ведёте или хотите вести блог?',
    subtitle: 'Выберите площадки',
    type: 'multi',
    options: [
      'Instagram',
      'Telegram',
      'ВКонтакте',
      'YouTube',
      'TikTok',
      'Свой сайт',
      'Пока нигде',
    ],
  },
  {
    block: 1,
    key: 'current_clients',
    title: 'Сколько клиентов в месяц?',
    subtitle: 'Примерное количество активных клиентов',
    type: 'single',
    options: [
      'Пока нет клиентов',
      '1–3',
      '4–8',
      '9–15',
      '16–25',
      'Больше 25',
    ],
  },
  {
    block: 1,
    key: 'client_source',
    title: 'Откуда приходят клиенты сейчас?',
    subtitle: 'Основной источник',
    type: 'single',
    options: [
      'Сарафанное радио',
      'Социальные сети',
      'Агрегаторы (B17, Ясно, Alter)',
      'Реклама',
      'Свой сайт',
      'Клиентов пока нет',
    ],
  },

  // Блок 3: Куда хотите (11-14)
  {
    block: 2,
    key: 'goal',
    title: 'Какая главная цель на 3 месяца?',
    subtitle: 'Что для вас самое важное сейчас',
    type: 'single',
    options: [
      'Найти первых клиентов',
      'Увеличить поток клиентов',
      'Стать узнаваемым в нише',
      'Запустить онлайн-курс / группу',
      'Масштабировать практику',
      'Просто начать вести блог',
    ],
  },
  {
    block: 2,
    key: 'time_available',
    title: 'Сколько времени готовы тратить на контент?',
    subtitle: 'В день, реалистично',
    type: 'single',
    options: [
      '15–30 минут',
      '30 минут – 1 час',
      '1–2 часа',
      'Больше 2 часов',
      'Хочу минимум — пусть AI делает',
    ],
  },
  {
    block: 2,
    key: 'biggest_pain',
    title: 'Что больше всего мешает вести блог?',
    subtitle: 'Выберите главную боль',
    type: 'single',
    options: [
      'Не знаю о чём писать',
      'Нет времени и энергии',
      'Чувствую себя инфоцыганом',
      'Пишу — но результата нет',
      'Не понимаю техническую сторону',
      'Боюсь осуждения коллег',
      'Всё вместе 😅',
    ],
  },
  {
    block: 2,
    key: 'dream_blog',
    title: 'Опишите свой идеальный блог',
    subtitle: 'Каким бы вы хотели видеть свой блог через полгода?',
    type: 'textarea',
    placeholder: 'Например: хочу чтобы люди находили меня и писали "ваш пост — это про меня", чтобы приходили 5-10 новых клиентов в месяц...',
  },
]

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setUserId(user.id)

      // Check if already completed
      const { data } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        router.push('/dashboard')
      }
    }
    checkUser()
  }, [router])

  const currentQuestion = questions[step]
  const currentBlock = blocks[currentQuestion?.block || 0]
  const progress = ((step + 1) / questions.length) * 100

  const handleAnswer = (value: any) => {
    const key = currentQuestion.key
    if (currentQuestion.type === 'multi') {
      const current = answers[key] || []
      if (current.includes(value)) {
        setAnswers({ ...answers, [key]: current.filter((v: string) => v !== value) })
      } else {
        setAnswers({ ...answers, [key]: [...current, value] })
      }
    } else {
      setAnswers({ ...answers, [key]: value })
    }
  }

  const canProceed = () => {
    const key = currentQuestion.key
    const answer = answers[key]
    if (!answer) return false
    if (currentQuestion.type === 'multi' && Array.isArray(answer) && answer.length === 0) return false
    if (typeof answer === 'string' && answer.trim() === '') return false
    return true
  }

  const handleNext = () => {
    if (step < questions.length - 1) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSubmit = async () => {
    if (!userId) return
    setLoading(true)

    const profileData = {
      user_id: userId,
      full_name: answers.full_name || '',
      approach: answers.approach || [],
      niche: answers.niche || [],
      experience: answers.experience || '',
      tone: answers.tone || '',
      values_text: answers.values_text || '',
      what_annoys: answers.what_annoys || '',
      current_followers: answers.current_followers || '',
      platforms: answers.platforms || [],
      current_clients: answers.current_clients || '',
      client_source: answers.client_source || '',
      biggest_pain: answers.biggest_pain || '',
      goal: answers.goal || '',
      time_available: answers.time_available || '',
      dream_blog: answers.dream_blog || '',
    }

    const { error } = await supabase
      .from('onboarding_profiles')
      .insert(profileData)

    if (error) {
      console.error('Error saving:', error)
      alert('Ошибка сохранения. Попробуйте ещё раз.')
      setLoading(false)
      return
    }

    setCompleted(true)
    setLoading(false)

    setTimeout(() => {
      router.push('/dashboard')
    }, 3000)
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
          >
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          </motion.div>
          <h1 className="text-3xl font-bold text-brand-text mb-4">
            Распаковка завершена! 🎉
          </h1>
          <p className="text-brand-text-secondary mb-2">
            Мы получили ваши ответы и уже готовим ваш персональный паспорт бренда.
          </p>
          <p className="text-brand-text-secondary mb-6">
            Переходим в ваш кабинет...
          </p>
          <div className="animate-spin w-6 h-6 border-3 border-brand-accent border-t-transparent rounded-full mx-auto"></div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-accent" />
              <span className="font-bold text-brand-text">PsyContent</span>
            </div>
            <span className="text-sm text-brand-text-secondary">
              {step + 1} из {questions.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              className="bg-brand-accent h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {/* Block indicator */}
          <div className="flex gap-2 mt-3">
            {blocks.map((block, i) => (
              <div
                key={block.id}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition ${
                  currentQuestion.block === i
                    ? block.color
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                <block.icon className="w-3 h-3" />
                {block.title}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="max-w-2xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-brand-text mb-2">
              {currentQuestion.title}
            </h2>
            <p className="text-brand-text-secondary mb-8">
              {currentQuestion.subtitle}
            </p>

            {/* Text input */}
            {currentQuestion.type === 'text' && (
              <input
                type="text"
                value={answers[currentQuestion.key] || ''}
                onChange={(e) => handleAnswer(e.target.value)}
                placeholder={currentQuestion.placeholder}
                className="w-full px-5 py-4 rounded-xl border border-brand-border bg-white text-brand-text text-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent"
                autoFocus
              />
            )}

            {/* Textarea */}
            {currentQuestion.type === 'textarea' && (
              <textarea
                value={answers[currentQuestion.key] || ''}
                onChange={(e) => handleAnswer(e.target.value)}
                placeholder={currentQuestion.placeholder}
                rows={4}
                className="w-full px-5 py-4 rounded-xl border border-brand-border bg-white text-brand-text text-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent resize-none"
                autoFocus
              />
            )}

            {/* Single select */}
            {currentQuestion.type === 'single' && (
              <div className="grid gap-3">
                {currentQuestion.options?.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleAnswer(option)}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition cursor-pointer ${
                      answers[currentQuestion.key] === option
                        ? 'border-brand-accent bg-brand-highlight text-brand-text font-medium'
                        : 'border-brand-border bg-white text-brand-text hover:border-brand-accent/50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* Multi select */}
            {currentQuestion.type === 'multi' && (
              <div className="grid gap-3">
                {currentQuestion.options?.map((option) => {
                  const selected = (answers[currentQuestion.key] || []).includes(option)
                  return (
                    <button
                      key={option}
                      onClick={() => handleAnswer(option)}
                      className={`w-full text-left px-5 py-4 rounded-xl border transition cursor-pointer flex items-center gap-3 ${
                        selected
                          ? 'border-brand-accent bg-brand-highlight text-brand-text font-medium'
                          : 'border-brand-border bg-white text-brand-text hover:border-brand-accent/50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        selected ? 'border-brand-accent bg-brand-accent' : 'border-gray-300'
                      }`}>
                        {selected && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      {option}
                    </button>
                  )
                })}
                <p className="text-sm text-brand-text-secondary mt-1">
                  Можно выбрать несколько
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium transition cursor-pointer ${
              step === 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-brand-text-secondary hover:text-brand-text'
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold transition cursor-pointer ${
              canProceed() && !loading
                ? 'bg-brand-accent text-white hover:bg-brand-accent-hover shadow-lg shadow-brand-accent/25'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                Сохраняем...
              </>
            ) : step === questions.length - 1 ? (
              <>
                Завершить <CheckCircle className="w-4 h-4" />
              </>
            ) : (
              <>
                Далее <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
