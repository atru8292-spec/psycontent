'use client'
// Демо: человек вписывает мысль, она сохраняется в localStorage (psycont_seed_thought), после регистрации
// и онбординга экран «Сделать» подхватывает ее первым постом (components/make/MakeFlow.tsx).
// Сама мысль в аналитику не уходит, только факт land_demo_submit.
import Image from 'next/image'
import { useRef, useState } from 'react'
import { track } from '@/lib/track'
import { useLanding } from './LandingShell'
import { DEMO } from './content'

const MAX = 600

export default function Demo() {
  const { who, start } = useLanding()
  const [text, setText] = useState('')
  const [hint, setHint] = useState('')
  const [sent, setSent] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const t = text.trim().slice(0, MAX)
    if (t.length < 3) { setHint(DEMO.empty); field.current?.focus(); return }
    setHint('')
    try { localStorage.setItem('psycont_seed_thought', JSON.stringify({ text: t, ts: Date.now() })) } catch { /* без хранилища регистрация все равно откроется */ }
    track('land_demo_submit')
    setSent(true)
    start('demo', 'free', { note: DEMO.authNote })
  }

  return (
    <div className="mx-auto max-w-[880px] rounded-3xl border border-brand-border bg-brand-card p-6 shadow-[0_1px_2px_rgba(59,42,34,.06)] lg:p-8">
      <div className="lg:grid lg:grid-cols-[1fr_200px] lg:gap-8">
        <div>
          <label htmlFor="demo-thought" className="sr-only">Твоя мысль</label>
          <textarea
            id="demo-thought"
            ref={field}
            value={text}
            maxLength={MAX}
            onChange={e => { setText(e.target.value); if (hint && e.target.value.trim().length >= 3) setHint('') }}
            placeholder={DEMO.placeholder}
            rows={4}
            className="min-h-[120px] w-full resize-none rounded-2xl border border-brand-border bg-brand-bg/40 p-4 text-[17px] leading-[1.55] text-brand-text placeholder:text-brand-muted focus:border-brand-accent focus:outline-2 focus:outline-brand-accent/30"
          />
          {(hint || text.length >= 550) && (
            <p className="mt-2 text-[15px] text-brand-muted" role="status">{hint || DEMO.long}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO.hints.map(h => (
              <button key={h} type="button" onClick={() => { setText(h); setHint(''); field.current?.focus() }}
                className="min-h-11 rounded-2xl border border-brand-border bg-transparent px-4 py-2 text-left text-[15px] text-brand-text hover:bg-brand-bg focus-visible:outline-2 focus-visible:outline-brand-accent cursor-pointer">
                {h}
              </button>
            ))}
          </div>
          {sent && who === 'anon' && <p className="mt-4 text-[15px] text-brand-text">{DEMO.saved}</p>}
          <button type="button" onClick={submit}
            className="mt-4 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-brand-accent px-7 text-[17px] font-semibold text-brand-bg transition-colors hover:bg-brand-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent cursor-pointer lg:w-auto">
            {sent && who === 'anon' ? DEMO.ctaAgain : DEMO.cta}
          </button>
          <p className="mt-3 text-[15px] text-brand-muted">{DEMO.note}</p>
        </div>
        <div className="hidden lg:flex lg:items-end lg:justify-center">
          <Image src="/vera/zapisyvaet.webp" alt="Вера записывает мысль" width={175} height={240} className="h-[240px] w-auto" />
        </div>
      </div>
    </div>
  )
}
