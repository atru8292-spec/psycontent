'use client'

// «Похоже на тебя?» под готовым текстом нового экрана «Написать» (26.11). На старом экране такая оценка была
// (FormatPane, «Звучит как я / Не похоже на меня»), при переходе на zh13 ее потеряли, и с 19.11 главный
// показатель продукта («звучит как ты») не измерялся. Пишет voice_events mine|not_like и generated_posts.feedback
// через /api/voice-events (в /admin это «Мое» и сигналы текстов).
// Честность (CLAUDE.md, ревью 26.11): реакция сама голос НЕ перестраивает (learning.ts ее не читает), поэтому
// обещания «следующие тексты подстроятся» нет; голос реально меняет экран «Покажи, как ты говоришь».
// Коды причин те же, что проверяет сервер (app/api/voice-events NOT_LIKE_REASONS), на экране новые подписи.
// Вид (дизайнер 26.11): тихая строка без коробки, чтобы под текстом не стояли три одинаковые карточки подряд;
// «Передать нам» работает и без причины (иначе not_like терялся бы у тех, кто не хочет разбираться).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { BTN_S, BTN_T } from './knopki'

const PRICHINY: { kod: string; tekst: string }[] = [
  { kod: 'слишком умно', tekst: 'Слишком заумно' },
  { kod: 'слишком сладко', tekst: 'Слишком сладко' },
  { kod: 'не мои слова', tekst: 'Не мои слова' },
  { kod: 'длинно', tekst: 'Слишком длинно' },
  { kod: 'не та тема', tekst: 'Мимо темы' },
]
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'
const PILL = `h-11 px-4 rounded-full border border-brand-border bg-white text-[15px] font-medium text-brand-text hover:border-brand-text cursor-pointer ${FOCUS}`
const DA_TEKST = 'Спасибо, отметили'

const send = (payload: Record<string, unknown>) =>
  fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})

export default function PohozheNaTebya({ postId }: { postId: string }) {
  const [shag, setShag] = useState<'vopros' | 'prichiny' | 'da' | 'net'>('vopros')
  const [vybor, setVybor] = useState<string[]>([])
  const root = useRef<HTMLElement>(null)
  const firstChip = useRef<HTMLButtonElement>(null)

  // кнопки исчезают после нажатия: фокус не должен падать в body
  useEffect(() => {
    if (shag === 'prichiny') firstChip.current?.focus()
    else if (shag !== 'vopros') root.current?.focus()
  }, [shag])

  const da = () => { setShag('da'); void send({ action: 'mine', postId }) }
  const peredat = (s: string[]) => { setShag('net'); void send({ action: 'not_like', postId, reasons: s }) }

  return (
    <section ref={root} tabIndex={-1} aria-labelledby={`pohozhe-${postId}`} className="mt-5 px-1 outline-none">
      {shag === 'da' ? (
        <p id={`pohozhe-${postId}`} className="min-h-11 flex items-center gap-2 text-[15px] text-brand-text"><Check className="w-5 h-5 text-brand-accent shrink-0" />{DA_TEKST}</p>
      ) : (
        <div className="lg:flex lg:items-center lg:gap-4">
          <h2 id={`pohozhe-${postId}`} className="text-[15px] font-semibold text-brand-text shrink-0">Похоже на тебя?</h2>
          {shag === 'vopros' && (
            <div className="mt-2 lg:mt-0 flex flex-wrap gap-2">
              <button type="button" onClick={da} className={PILL}>Да, это я</button>
              <button type="button" onClick={() => setShag('prichiny')} className={PILL}>Не совсем</button>
            </div>
          )}
        </div>
      )}
      {shag === 'prichiny' && (
        <div className="mt-2.5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Что не так">
            {PRICHINY.map((p, i) => {
              const on = vybor.includes(p.kod)
              return (
                <button key={p.kod} ref={i === 0 ? firstChip : undefined} type="button" aria-pressed={on} onClick={() => setVybor(on ? vybor.filter(x => x !== p.kod) : [...vybor, p.kod])}
                  className={`h-11 px-4 rounded-full text-[14px] cursor-pointer inline-flex items-center gap-1.5 ${FOCUS} ${on ? 'bg-brand-soft border border-brand-text text-brand-text font-semibold' : 'bg-white border border-brand-border text-brand-text-secondary'}`}>
                  {on && <Check className="w-3.5 h-3.5 text-brand-accent" />}{p.tekst}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => peredat(vybor)} className={BTN_S}>Передать нам</button>
            <button type="button" onClick={() => peredat([])} className={BTN_T}>Пропустить</button>
          </div>
        </div>
      )}
      <div aria-live="polite">
        {shag === 'net' && (
          <div className="mt-1">
            <p className="text-[14px] leading-5 text-brand-text-secondary">Спасибо, разберемся. Ближе к тебе тексты станут, когда покажешь пару своих фраз.</p>
            <Link href="/dashboard/voice" className={`mt-1 -ml-2 px-2 inline-flex min-h-11 items-center rounded-xl text-[15px] font-semibold text-brand-accent hover:bg-brand-soft-2 ${FOCUS}`}>Показать, как я говорю</Link>
          </div>
        )}
      </div>
    </section>
  )
}
