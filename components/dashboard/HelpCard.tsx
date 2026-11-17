// Карточка «Помощь»: экран /dashboard/pomosch и карточка в «Настройках» на телефоне (макет A11).
// Кнопка Telegram неактивна, пока нет бота (отдельная задача); события у нее нет, потому что нажать ее нельзя.
// Когда бот появится: ссылка на бота и событие (feature_open 'help' уже пишет экран «Помощь»).
import { Send } from 'lucide-react'

export default function HelpCard({ className = '', big = false }: { className?: string; big?: boolean }) {
  return (
    <section aria-labelledby="help-title" className={`rounded-[20px] bg-brand-card border border-brand-border p-4 sm:p-6 ${className}`}>
      <h2 id="help-title" className={`font-semibold text-brand-text ${big ? 'text-[20px] leading-7' : 'text-base'}`}>Что-то не получается?</h2>
      <p className="mt-1 text-[15px] leading-[22px] text-brand-muted">Напиши, ответит живой человек из команды PsyCont, обычно в течение дня</p>
      <button type="button" disabled aria-describedby="help-soon"
        className="mt-4 w-full sm:w-auto h-12 px-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-border text-[15px] font-semibold text-brand-muted bg-brand-card cursor-not-allowed">
        <Send className="w-4 h-4" aria-hidden />Написать в Telegram
        <span id="help-soon" className="ml-1 inline-flex items-center h-6 px-2 rounded-full bg-brand-soft-2 text-[12px] font-medium text-brand-text">Скоро</span>
      </button>
    </section>
  )
}
