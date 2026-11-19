// Строка «Без автосписаний · Карта или СБП · Чек на почту» над тарифами (аудит В11, мокап mockup-tarify-390).
// Маркеры точками шалфея, обычный текст, без капса. Показывать только при открытой оплате и выключенных автоплатежах.
// Серверный и клиентский: без хуков, подходит и лендингу, и кабинету.
import { PAY_TRUST } from '@/lib/pricing'

export default function PayTrust({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1.5 text-[15px] leading-[22px] text-brand-text ${className}`}>
      {PAY_TRUST.map(t => (
        <li key={t} className="inline-flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-sage" />
          {t}
        </li>
      ))}
    </ul>
  )
}

// Система кнопок оплаты (мокап ui/mockup-system): высота 48, радиус 12, цель касания от 44
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'
export const BTN_MAIN = `inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 text-[16px] font-semibold text-white transition-colors hover:bg-brand-accent-hover cursor-pointer disabled:opacity-60 disabled:cursor-default ${FOCUS}`
export const BTN_SECOND = `inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-card px-5 text-[16px] font-semibold text-brand-text transition-colors hover:bg-brand-soft-2 cursor-pointer disabled:opacity-60 disabled:cursor-default ${FOCUS}`
export const BTN_TEXT = `inline-flex h-12 items-center justify-center px-3 rounded-xl text-[16px] font-semibold text-brand-accent transition-colors hover:bg-brand-soft-2 cursor-pointer ${FOCUS}`
