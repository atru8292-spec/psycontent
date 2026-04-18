'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ArrowRight, ArrowLeft, CheckCircle, User, MessageCircle, Heart, MapPin, Flag, Star
} from 'lucide-react'

const blocks = [
  { id: 'who', title: 'Кто вы', icon: User, color: 'text-purple-600 bg-purple-100' },
  { id: 'voice', title: 'Ваш голос', icon: MessageCircle, color: 'text-orange-600 bg-orange-100' },
  { id: 'client', title: 'Идеальный клиент', icon: Heart, color: 'text-pink-600 bg-pink-100' },
  { id: 'current', title: 'Где вы сейчас', icon: MapPin, color: 'text-blue-600 bg-blue-100' },
  { id: 'goal', title: 'Куда хотите', icon: Flag, color: 'text-green-600 bg-green-100' },
  { id: 'final', title: 'Финальный штрих', icon: Star, color: 'text-yellow-600 bg-yellow-100' },
]

const questions = [
  // ... (оставил все вопросы без изменений)
]

export default function Onboarding() {
  const [step, setStep] = useState(-1)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUserId(user.id)

      // 1) Проверяем, не прошёл ли человек онбординг полностью
      const { data: existingProfile } = await supabase
        .from('onboarding_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (existingProfile) {
        router.push('/dashboard')
        return
      }

      // 2) Если профиля нет — пробуем восстановить черновик
      const { data: draft } = await supabase
        .from('onboarding_drafts')
        .select('step, answers')
        .eq('user_id', user.id)
        .single()

      if (draft) {
        setAnswers(draft.answers || {})
        setStep(typeof draft.step === 'number' ? draft.step : 0)
      }
    }

    init()
  }, [router])

  const currentQuestion = step >= 0 ? questions[step] : null
  const currentBlock = currentQuestion ? blocks[currentQuestion.block] : null
  const progress = ((step) / questions.length) * 100

  const toggleArrayItem = (key: string, item: string, max?: number) => {
    const arr = answers[key] || []
    if (arr.includes(item)) {
      setAnswers({ ...answers, [key]: arr.filter((i: string) => i !== item) })
    } else {
      if (max && arr.length >= max) return
      setAnswers({ ...answers, [key]: [...arr, item] })
    }
  }

  const canProceed = () => {
    if (!currentQuestion) return false
    const { key, type } = currentQuestion
    const textKey = (currentQuestion as any).textKey
    const singleKey = (currentQuestion as any).singleKey
    const optionsKey = (currentQuestion as any).optionsKey
    const single2Key = (currentQuestion as any).single2Key

    if (type === 'text' || type === 'textarea') return (answers[key]?.length > 2)
    if (type === 'single') return !!answers[key]
    if (type === 'multi') return (answers[key]?.length > 0)
    if (type === 'text_and_single') return (answers[key]?.length > 2 && !!answers[optionsKey])
    if (type === 'multi_and_text') return (answers[key]?.length > 0 && answers[textKey]?.length > 2)
    if (type === 'single_and_text') return (answers[key] && answers[textKey]?.length > 2)
    if (type === 'multi_and_single') return (answers[key]?.length > 0 && !!answers[singleKey])
    if (type === 'single_and_single') return (answers[key] && !!answers[single2Key])
    if (type === 'text_and_multi') return true
    if (type === 'sliders') return true
    return true
  }

  const saveDraft = async (nextStep: number, nextAnswers: Record<string, any>) => {
    if (!userId) return
    try {
      await supabase.from('onboarding_drafts').upsert({
        user_id: userId,
        step: nextStep,
        answers: nextAnswers,
      })
    } catch (e) {
      console.error('onboarding draft save error', e)
    }
  }

  const handleNext = async () => {
    if (!currentQuestion) {
      setStep(0)
      return
    }

    if (step < questions.length - 1) {
      const nextStep = step + 1
      const nextAnswers = answers
      setStep(nextStep)
      window.scrollTo(0, 0)
      await saveDraft(nextStep, nextAnswers)
    } else {
      await handleSubmit()
    }
  }

  const handleSubmit = async () => {
    if (!userId) return
    setLoading(true)

    const profileData = {
      user_id: userId,
      full_name: answers.full_name || '',
      appeal: answers.appeal || '',
      approaches: answers.approaches || [],
      niches: answers.niches || [],
      one_niche: answers.one_niche || '',
      experience: answers.experience || '',
      path_to_profession: answers.path_to_profession || '',
      formats: answers.formats || [],
      price: answers.price || '',
      tone_formal: answers.tone_formal || 50,
      tone_serious: answers.tone_serious || 50,
      tone_cautious: answers.tone_cautious || 50,
      tone_verbal: answers.tone_verbal || '',
      values: answers.values || [],
      values_custom: answers.values_custom || '',
      anti_values: answers.anti_values || [],
      anti_values_custom: answers.anti_values_custom || '',
      superpowers: answers.superpowers || [],
      content_struggles: answers.content_struggles || [],
      live_voice: answers.live_voice || '',
      client_avatar: answers.client_avatar || '',
      client_job: answers.client_job || '',
      client_pain_phrases: answers.client_pain_phrases || '',
      client_tried: answers.client_tried || [],
      client_fear: answers.client_fear || [],
      client_result: answers.client_result || '',
      platforms: answers.platforms || [],
      current_followers: answers.current_followers || '',
      current_clients: answers.current_clients || '',
      client_source: answers.client_source || [],
      content_pain: answers.content_pain || '',
      content_pain_detail: answers.content_pain_detail || '',
      desired_clients: answers.desired_clients || '',
      goal_3_months: answers.goal_3_months || '',
      time_available: answers.time_available || '',
      video_attitude: answers.video_attitude || '',
      dream_blog: answers.dream_blog || '',
      idols: answers.idols || '',
      idols_why: answers.idols_why || [],
      something_else: answers.something_else || '',
    }

    const { error } = await supabase
      .from('onboarding_profiles')
      .insert(profileData)

    if (error) {
      console.error('Save error:', error)
      alert('Ошибка при сохранении. Проверьте добавлены ли новые колонки в Supabase.')
      setLoading(false)
      return
    }

    // Успешно завершили — чистим черновик
    await supabase.from('onboarding_drafts').delete().eq('user_id', userId)

    setCompleted(true)
  }

  // дальше код экрана завершения, приветствия и шагов — без изменений...
}
