'use client'

// «Помощь» (17.11, вариант А): пока заглушка. Связь через Telegram-бота делается отдельной задачей,
// до нее кнопка неактивна с подписью «Скоро». Вход: внизу меню на компьютере, карточкой в «Настройках» на телефоне.
import { useFeatureOpen } from '@/lib/analytics/hooks'
import HelpCard from '@/components/dashboard/HelpCard'

export default function HelpPage() {
  useFeatureOpen('help')
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-12 pt-4 lg:pt-10">
      <h1 className="text-[26px] leading-8 lg:text-[32px] lg:leading-10 font-semibold text-brand-text">Помощь</h1>
      <HelpCard className="mt-6" big />
    </div>
  )
}
