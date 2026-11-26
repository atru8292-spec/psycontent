'use client'

// «Похоже на тебя?» под готовым текстом нового экрана «Написать» (26.11). На старом экране такая оценка была
// (FormatPane, «Звучит как я / Не похоже на меня»), при переходе на zh13 ее потеряли, и с 19.11 главный
// показатель продукта («звучит как ты») не измерялся. Пишет voice_events mine|not_like и generated_posts.feedback
// через /api/voice-events (в /admin это «Мое» и сигналы текстов).
// Генератор учится на ответе (решение Арины 26.11): причины «Не совсем» новее последнего «Да, это я» zh13 дает
// писателю строкой поправок (pishi.ts popravkiIz), и в карусели тоже. «Мимо темы» писателю не идет, поэтому
// «учтем» показываем, только если ушла другая причина.
// «Сказать своими словами»: запись уходит в /api/voice-transcribe с purpose golos и postId. Ответ сервера golos:
// ok (голос пересобирается сразу), saved (сохранили, пересборку отсек предел), short (меньше полуминуты), copy
// (прочитан наш текст: не учимся сами у себя). На экране обещаем ровно то, что сказал сервер.
// Вид (дизайнер 26.11): тихая строка без коробки; «Передать нам» работает и без причины.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { BTN_S, BTN_T } from './knopki'
import VoiceSheet from '../VoiceSheet'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import { track } from '@/lib/track'

const PRICHINY: { kod: string; tekst: string }[] = [
  { kod: 'слишком умно', tekst: 'Слишком заумно' },
  { kod: 'слишком сладко', tekst: 'Слишком сладко' },
  { kod: 'не мои слова', tekst: 'Не мои слова' },
  { kod: 'длинно', tekst: 'Слишком длинно' },
  { kod: 'не та тема', tekst: 'Мимо темы' },
]
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'
const PILL = `h-11 px-4 rounded-full border border-brand-border bg-white text-[15px] font-medium text-brand-text hover:border-brand-text cursor-pointer ${FOCUS}`
const NOTE = 'text-[14px] leading-5 text-brand-text-secondary'
type Golos = 'ok' | 'saved' | 'short' | 'copy'
const GOLOS_TEKST: Record<Golos, string> = {
  ok: 'Записали. Следующий текст будет ближе к тому, как ты говоришь.',
  saved: 'Записали. Это войдет в твой голос при следующей настройке.',
  short: 'Вышло совсем коротко. Для голоса нужно хотя бы полминуты речи.',
  copy: 'Похоже на чтение текста вслух. Расскажи эту мысль своими словами.',
}

const send = (payload: Record<string, unknown>) =>
  fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})

export default function PohozheNaTebya({ postId }: { postId: string }) {
  const [shag, setShag] = useState<'vopros' | 'prichiny' | 'da' | 'net'>('vopros')
  const [vybor, setVybor] = useState<string[]>([])
  const [uchtem, setUchtem] = useState(false)
  const [golosOpen, setGolosOpen] = useState(false)
  const [golos, setGolos] = useState<Golos | null>(null)
  const root = useRef<HTMLElement>(null)
  const firstChip = useRef<HTMLButtonElement>(null)

  const peredat = (s: string[]) => { setShag('net'); setUchtem(s.some(k => k !== 'не та тема')); void send({ action: 'not_like', postId, reasons: s }) }
  const shagRef = useRef(shag); shagRef.current = shag
  const vyborRef = useRef(vybor); vyborRef.current = vybor

  const rec = useVoiceRecorder(() => {}, {
    maxSeconds: 60, nearSeconds: 50, purpose: 'golos', fields: { postId },
    onResult: d => {
      const g: Golos = d?.golos === 'ok' || d?.golos === 'saved' || d?.golos === 'copy' ? d.golos : 'short'
      setGolos(g)
      // записанная речь сама по себе ответ «не похоже»: если причины еще не отправлены, отправляем выбранные
      if ((g === 'ok' || g === 'saved') && shagRef.current === 'prichiny') peredat(vyborRef.current)
    },
  })

  // кнопки исчезают после нажатия: фокус не должен падать в body
  useEffect(() => {
    if (shag === 'prichiny') firstChip.current?.focus()
    else if (shag !== 'vopros') root.current?.focus()
  }, [shag])

  const da = () => { setShag('da'); void send({ action: 'mine', postId }) }
  const zapisat = () => { setGolos(null); rec.reset(); setGolosOpen(true); track('feature_open', { feature: 'golos_slova' }) }
  const idet = rec.state === 'transcribing'
  const golosOk = golos === 'ok' || golos === 'saved'

  const golosBlok = (
    <div aria-live="polite" className="mt-1">
      {idet && <p className={`${NOTE} inline-flex items-center gap-1.5`}><Loader2 className="w-3.5 h-3.5 animate-spin" />Расшифровываем запись</p>}
      {!idet && rec.state === 'error' && rec.errorKind === 'network' && (
        <p className={NOTE}>Не получилось расшифровать.{' '}<button type="button" onClick={rec.retry} className={`font-semibold text-brand-accent underline underline-offset-2 cursor-pointer rounded ${FOCUS}`}>Еще раз</button></p>
      )}
      {!idet && rec.state === 'error' && rec.errorKind === 'empty' && <p className={NOTE}>Ничего не слышно. Попробуй записать еще раз.</p>}
      {!idet && golos && <p className={NOTE}>{GOLOS_TEKST[golos]}</p>}
    </div>
  )
  const golosKnopka = !golosOk && (
    <button type="button" onClick={zapisat} disabled={idet} className={`mt-1 -ml-2 ${BTN_T}`}>Сказать своими словами</button>
  )

  return (
    <section ref={root} tabIndex={-1} aria-labelledby={`pohozhe-${postId}`} className="mt-5 px-1 outline-none">
      {shag === 'da' ? (
        <p id={`pohozhe-${postId}`} className="min-h-11 flex items-center gap-2 text-[15px] text-brand-text"><Check className="w-5 h-5 text-brand-accent shrink-0" />Спасибо, отметили</p>
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
          {golosKnopka}
        </div>
      )}
      {shag === 'net' && (
        <div className="mt-1">
          <p role="status" className={NOTE}>{uchtem ? 'Спасибо, учтем в следующем тексте.' : 'Спасибо, разберемся.'}</p>
          {!golosOk && (
            <>
              <p className={NOTE}>Тексты звучат ближе, когда у нас есть твои слова.</p>
              {golosKnopka}
              <div><Link href="/dashboard/voice" className={`-ml-2 px-2 inline-flex min-h-11 items-center rounded-xl text-[15px] font-semibold text-brand-accent hover:bg-brand-soft-2 ${FOCUS}`}>Покажи, как ты говоришь</Link></div>
            </>
          )}
        </div>
      )}
      {(shag === 'prichiny' || shag === 'net') && golosBlok}
      <VoiceSheet open={golosOpen} rec={rec} onClose={() => setGolosOpen(false)} onWriteText={() => setGolosOpen(false)} bezTeksta
        maxSeconds={60} prompt="Расскажи эту мысль своими словами, не читая текст." />
    </section>
  )
}
