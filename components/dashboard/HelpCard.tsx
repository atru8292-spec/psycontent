// Карточка «Помощь» в «Настройках» на телефоне (на компьютере вход в меню внизу).
// Только ведет на экран /dashboard/pomosch: кнопка Telegram с меткой и вопросы живут там, чтобы метку не просить дважды.
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { QUIET_BTN } from '@/lib/ui-classes'

export default function HelpCard({ className = '' }: { className?: string }) {
  return (
    <section aria-labelledby="help-card-title" className={`rounded-[20px] bg-brand-card border border-brand-border p-4 sm:p-6 ${className}`}>
      <h2 id="help-card-title" className="text-base font-semibold text-brand-text">Что-то не получается?</h2>
      <p className="mt-1 text-[15px] leading-[22px] text-brand-text-secondary">Ответит живой человек, обычно в течение дня</p>
      <Link href="/dashboard/pomosch" className={`${QUIET_BTN} mt-4`}>
        Открыть помощь
        <ChevronRight className="w-[18px] h-[18px]" aria-hidden />
      </Link>
    </section>
  )
}
