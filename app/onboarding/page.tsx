'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react'

const questions = [
  {
    id: 1,
    question: "Как вас зовут?",
    subtitle: "Имя и фамилия, как хотите чтобы к вам обращались",
    type: "text",
    placeholder: "Например: Анна Петрова"
  },
  {
    id: 2,
    question: "В каком направлении психологии вы работаете?",
    subtitle: "Выберите одно или несколько",
    type: "multi",
    options: ["КПТ", "Гештальт", "Психоанализ", "Схема-терапия", "ACT", "EMDR", "Арт-терапия", "Системная семейная", "Другое"]
  },
  {
    id: 3,
    question: "С какими запросами к вам чаще приходят?",
    subtitle: "Выберите основные темы",
    type: "multi",
    options: ["Тревога и панические атаки", "Депрессия", "Отношения и привязанность", "Самооценка", "Выгорание", "Травма и ПТСР", "Потеря и горевание", "Зависимости", "Расстройства пищевого поведения", "Другое"]
  },
  {
    id: 4,
    question: "Кто ваш идеальный клиент?",
    subtitle: "Опишите свободно: пол, возраст, ситуация",
    type: "textarea",
    placeholder: "Например: Женщины 25-40 лет, которые переживают кризис в отношениях и хотят разобраться в себе..."
  },
  {
    id: 5,
    question: "Как бы вы описали свой стиль общения?",
    subtitle: "Как вы обычно говорите с клиентами и аудиторией",
    type: "single",
    options: ["Тёплый и поддерживающий", "Прямой и конкретный", "Академичный и глубокий", "Лёгкий и с юмором", "Провокационный и вызывающий на размышления"]
  },
  {
    id: 6,
    question: "На каких площадках вы хотите вести блог?",
    subtitle: "Выберите одну или несколько",
    type: "multi",
    options: ["Instagram", "Telegram", "YouTube", "VK", "TikTok", "Свой сайт/блог"]
  },
  {
    id: 7,
    question: "Что для вас самое сложное в ведении блога?",
    subtitle: "Выберите главную боль",
    type: "single",
    options: ["Не знаю о чём писать", "Нет времени", "Стесняюсь себя продвигать", "Не умею писать интересно", "Не понимаю что работает"]
  },
]

export default function Onboarding() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })
  }, [])

  const currentQuestion = questions[step]
  const progress = ((step + 1) / questions.length) * 100

  const handleTextChange = (value: string) => {
    setAnswers({ ...answers, [currentQuestion.id]: value })
  }

  const handleSingleSelect = (option: string) => {
    setAnswers({ ...answers, [currentQuestion.id]: option })
  }

  const handleMultiSelect = (option: string) => {
    const current = answers[currentQuestion.id] || []
    if (current.includes(option)) {
      setAnswers({ ...answers, [currentQuestion.id]: current.filter((o: string) => o !== option) })
    } else {
      setAnswers({ ...answers, [currentQuestion.id]: [...current, option] })
    }
  }

  const canGoNext = () => {
    const answer = answers[currentQuestion.id]
    if (!answer) return false
    if (Array.isArray(answer) && answer.length === 0) return false
    if (typeof answer === 'string' && answer.trim() === '') return false
    return true
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const { error } = await supabase.from('onboarding_answers').insert({
        user_id: user.id,
        answers: answers,
        completed_at: new Date().toISOString()
      })
      if (error) throw error
      setDone(true)
    } catch (err) {
      console.error('Submit error:', err)
      alert('Ошибка сохранения. Попробуйте ещё раз.')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand-text mb-4">Нужно войти в аккаунт</h1>
          <a href="/" className="text-brand-accent hover:underline">Вернуться на главную</a>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-brand-text mb-4">Распаковка завершена! 🎉</h1>
          <p className="text-brand-text-secondary mb-8">
            Мы получили ваши ответы и уже готовим ваш персональный паспорт бренда. 
            Скоро вы получите контент-стратегию, созданную специально для вас.
          </p>
          <div className="p-4 bg-brand-highlight rounded-xl">
            <p className="text-brand-accent font-semibold text-sm">⏳ Паспорт бренда будет готов в ближайшее время</p>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur border-b border-brand-border">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-accent" />
            <span className="font-bold text-brand-text">Распаковка</span>
          </div>
          <span className="text-sm text-brand-text-secondary">{step + 1} из {questions.length}</span>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <motion.div
            className="h-full bg-brand-accent"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="pt-24 pb-32 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-brand-text mb-2">
              {currentQuestion.question}
            </h2>
            <p className="text-brand-text-secondary mb-8">{currentQuestion.subtitle}</p>

            {/* Text input */}
            {currentQuestion.type === 'text' && (
              <input
                type="text"
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={currentQuestion.placeholder}
                className="w-full p-4 rounded-xl border border-brand-border bg-white text-brand-text text-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent"
              />
            )}

            {/* Textarea */}
            {currentQuestion.type === 'textarea' && (
              <textarea
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={currentQuestion.placeholder}
                rows={4}
                className="w-full p-4 rounded-xl border border-brand-border bg-white text-brand-text text-lg focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent resize-none"
              />
            )}

            {/* Single select */}
            {currentQuestion.type === 'single' && (
              <div className="space-y-3">
                {currentQuestion.options?.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleSingleSelect(option)}
                    className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${
                      answers[currentQuestion.id] === option
                        ? 'border-brand-accent bg-brand-highlight text-brand-accent font-semibold'
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
              <div className="flex flex-wrap gap-3">
                {currentQuestion.options?.map((option) => {
                  const selected = (answers[currentQuestion.id] || []).includes(option)
                  return (
                    <button
                      key={option}
                      onClick={() => handleMultiSelect(option)}
                      className={`px-5 py-3 rounded-full border transition cursor-pointer ${
                        selected
                          ? 'border-brand-accent bg-brand-highlight text-brand-accent font-semibold'
                          : 'border-brand-border bg-white text-brand-text hover:border-brand-accent/50'
                      }`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 w-full bg-white/80 backdrop-blur border-t border-brand-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition cursor-pointer ${
              step === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-brand-text hover:bg-gray-100'
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          {step < questions.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canGoNext()}
              className={`flex items-center gap-2 px-8 py-3 rounded-full font-semibold transition cursor-pointer ${
                canGoNext()
                  ? 'bg-brand-accent text-white hover:bg-brand-accent-hover'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Далее <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canGoNext() || submitting}
              className={`flex items-center gap-2 px-8 py-3 rounded-full font-semibold transition cursor-pointer ${
                canGoNext() && !submitting
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Сохраняю...' : 'Завершить'} <CheckCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
