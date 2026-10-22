'use client'
// Карточка опроса на предпросмотре: обертка как у главной кабинета, над карточкой заглушка «Написать пост».
// После закрытия карточка возвращается через секунду, чтобы снимок можно было повторить без перезагрузки.
import { useState } from 'react'
import { PenTool } from 'lucide-react'
import ExitSurveyCard, { type ExitSurveyView } from '@/components/dashboard/ExitSurveyCard'

export default function SurveyDemo({ view }: { view: ExitSurveyView }) {
  const [open, setOpen] = useState(true)
  const close = () => { setOpen(false); setTimeout(() => setOpen(true), 1000) }
  return (
    <div className="min-h-dvh bg-brand-bg">
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <p className="text-sm text-brand-muted mb-1">Добрый день</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-text leading-tight">Анна</h1>
        </div>
        <div className="mb-8 flex gap-2 flex-wrap">
          <span className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-brand-accent text-white"><PenTool className="w-4 h-4" aria-hidden /> Написать пост</span>
          <span className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-brand-card text-brand-text border border-brand-border">Придумать хук</span>
        </div>
        {open && <ExitSurveyCard place="cooling" onClose={close} initialView={view} initialContact={view === 'thanks'} />}
        <div className="h-40 rounded-3xl bg-brand-card border border-brand-border" aria-hidden />
      </div>
    </div>
  )
}
