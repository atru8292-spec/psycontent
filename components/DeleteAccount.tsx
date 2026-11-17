'use client'

// Кнопка «Удалить аккаунт» внизу Профиля (16.11, блок 1 запуска). Удаляет сразу и навсегда: аккаунт, все тексты,
// голос, темы и фото (POST /api/account/delete). Вопрос «что остановило» только чипами: свободный текст не храним,
// аккаунта уже не будет, а в тексте могут быть личные данные. Тексты copywriter-psycont 16.11.
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { REKV } from '@/lib/rekvizity'

const REASONS: { id: string; label: string }[] = [
  { id: 'tekst', label: 'Тексты не про меня' },
  { id: 'dorogo', label: 'Дорого' },
  { id: 'vremya', label: 'Нет времени на блог' },
  { id: 'pozzhe', label: 'Пока не нужно' },
  { id: 'neudob', label: 'Неудобно пользоваться' },
  { id: 'drugoe', label: 'Другое' },
]

export default function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // оплаченный тариф (17.11): сказать, что дни пропадут и как вернуть деньги
  const [paidUntil, setPaidUntil] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    fetch('/api/pay/me', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => setPaidUntil(j?.paid && j.until ? new Date(j.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }) : null)).catch(() => {})
  }, [open])

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  const remove = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'udalit', reasons: picked }) })
      if (!r.ok) throw new Error()
      try { localStorage.clear(); sessionStorage.clear() } catch {}
      await supabase.auth.signOut().catch(() => {})
      window.location.replace('/?udalen=1')
    } catch {
      setError(`Удалить аккаунт не получилось. Попробуй еще раз через пару минут, а если снова не выйдет, напиши на ${REKV.email}.`)
      setBusy(false)
    }
  }

  return (
    <div className="mt-10 pt-6 border-t border-brand-border">
      <button type="button" onClick={() => { setOpen(true); setError(null) }}
        className="h-11 px-2 -ml-2 rounded-xl text-[14px] text-brand-text-secondary hover:text-brand-text hover:bg-brand-soft-2 transition cursor-pointer">
        Удалить аккаунт
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-text/40 p-0 sm:p-4" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="del-title" onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-brand-card rounded-t-3xl sm:rounded-3xl border border-brand-border p-5 sm:p-6 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <p id="del-title" className="text-[19px] leading-6 font-semibold text-brand-text">Удалить аккаунт навсегда?</p>
              <button type="button" aria-label="Закрыть" disabled={busy} onClick={() => setOpen(false)} className="w-11 h-11 -m-2.5 flex items-center justify-center text-brand-muted hover:text-brand-text cursor-pointer shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-2 text-[15px] leading-[22px] text-brand-text-secondary">Сразу удалятся аккаунт, все тексты, голос, темы и фото. Вернуть их потом не получится.</p>
            {paidUntil && <p className="mt-2 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] leading-[22px] text-brand-text">Тариф оплачен до {paidUntil}. Автопродление выключится, а оставшиеся дни пропадут. Вернуть деньги за них можно, если сначала написать на {REKV.email}.</p>}

            <p className="mt-5 text-[15px] text-brand-text">Если хочешь, расскажи, что остановило</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REASONS.map(r => {
                const on = picked.includes(r.id)
                return (
                  <button key={r.id} type="button" aria-pressed={on} onClick={() => toggle(r.id)}
                    className={`min-h-11 px-4 rounded-full border text-[15px] transition cursor-pointer ${on ? 'bg-brand-soft border-brand-text text-brand-text' : 'border-brand-border text-brand-text-secondary hover:border-brand-text-secondary'}`}>
                    {r.label}
                  </button>
                )
              })}
            </div>

            {error && <p role="alert" className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-text">{error}</p>}

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)}
                className="h-12 w-full sm:w-auto sm:flex-1 shrink-0 rounded-2xl bg-brand-accent text-white font-semibold hover:bg-brand-accent-hover transition cursor-pointer">Оставить аккаунт</button>
              <button type="button" disabled={busy} onClick={remove}
                className="h-12 w-full sm:w-auto sm:flex-1 shrink-0 rounded-2xl border border-brand-text text-brand-text font-semibold hover:bg-brand-soft transition cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}Удалить навсегда
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
