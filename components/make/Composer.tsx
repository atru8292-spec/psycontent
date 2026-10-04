'use client'

// «Сделать» под флагом нового мозга, ввод мысли (задача sdelat-i-brend, раздел 3; спецификация designer-psycont).
// Пустое поле: заголовок, поле с микрофоном и скрепкой, «Продолжить черновик», карточки «Не знаю, о чем писать»
// и «Видела классный пост?». В поле есть текст: карточки прячутся, появляются форматы, цель и кнопка.
// Режим «так же»: в поле ссылка на чужой пост или выбраны скрины (раздел 5).

import { useFeatureOpen, useTrackOnce } from '@/lib/analytics/hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Paperclip, Plus, Check, ChevronDown, ChevronRight, FileText, Link2, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import { useVoiceRecorder } from '@/lib/use-voice-recorder'
import VoiceSheet, { VOICE_MAX, VOICE_NEAR } from './VoiceSheet'
import BottomSheet from './BottomSheet'
import VoiceTextarea from '@/components/VoiceTextarea'
import { MAKE_FORMATS, DEFAULT_FORMATS, GOAL_OPTIONS, makeButtonText, type MakeFormat, type MakeGoal } from './formats'

export const DRAFT_KEY = 'psycont_make_draft'
const FORMATS_KEY = 'psycont_make_formats'
// «так же» включают только ссылки на Telegram и Instagram; другая ссылка в поле это просто мысль
const URL_RE = /^\s*(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|instagram\.com|instagr\.am)\/\S+\s*$/i

export type SozheSource = { kind: 'link'; url: string } | { kind: 'screens'; files: File[] } | { kind: 'text'; text: string; label: string }
// mode и voice только для замеров (make_start): тема взята готовой или своя мысль, надиктована ли
export type ComposerSubmit = { text: string; formats: MakeFormat[]; goal: MakeGoal; sozhe?: SozheSource; about?: string; mode?: 'thought' | 'topic'; voice?: boolean }

const readLS = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const writeLS = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch {} }

export default function Composer({ firstTime, topics, busy, onSubmit, initialText, initialFormats, askSampleText, onSampleCleared }: {
  firstTime: boolean
  topics: string[]
  busy: boolean
  onSubmit: (s: ComposerSubmit) => void
  initialText?: string
  initialFormats?: MakeFormat[] // формат из плана (?format=) выбран заранее
  askSampleText?: boolean       // ссылка не открылась (закрытый канал, ошибка): просим вставить текст поста
  onSampleCleared?: () => void  // ссылку убрали или поменяли: просьба вставить текст больше не нужна
}) {
  const router = useRouter()
  const [text, setText] = useState(initialText || '')
  // черновик пишем, только когда человек сам печатал: тема из адреса не должна затирать ее черновик
  const typed = useRef(false)
  const [about, setAbout] = useState('')
  const [screens, setScreens] = useState<File[]>([])
  // текст чужого поста или расшифровка рилса, когда ссылка не открывается
  const [sampleText, setSampleText] = useState('')
  const [videoState, setVideoState] = useState<'idle' | 'busy' | 'error'>('idle')
  const videoInput = useRef<HTMLInputElement>(null)
  const [formats, setFormats] = useState<MakeFormat[]>(DEFAULT_FORMATS)
  const [goal, setGoal] = useState<MakeGoal>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [topicIdx, setTopicIdx] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // прошлый набор форматов и незаконченный черновик
  useEffect(() => {
    try {
      const f = JSON.parse(readLS(FORMATS_KEY) || 'null')
      if (initialFormats?.length) setFormats(initialFormats)
      else if (Array.isArray(f) && f.length) setFormats(f.filter((x: string) => MAKE_FORMATS.some(m => m.id === x)))
    } catch {}
    const d = readLS(DRAFT_KEY)
    // черновик помним и при теме из адреса: тема в поле, а «Продолжить черновик» появится, если поле очистить
    if (d && d.trim() && d.trim() !== (initialText || '').trim()) setDraft(d)
  }, [initialText, initialFormats])
  useEffect(() => { if (initialText) setText(initialText) }, [initialText])

  // черновик пишется сам, пока человек печатает
  useEffect(() => {
    const t = setTimeout(() => { if (typed.current && text.trim().length >= 3 && !URL_RE.test(text)) writeLS(DRAFT_KEY, text) }, 600)
    return () => clearTimeout(t)
  }, [text])

  // поле растет от 3 до 6 строк, дальше прокрутка внутри
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 144)}px`
  }, [text])

  const usedVoice = useRef(false)
  const appendVoice = useCallback((t: string) => { typed.current = true; usedVoice.current = true; setText(prev => (prev.trim() ? `${prev.trim()} ${t}` : t)) }, [])
  const rec = useVoiceRecorder(appendVoice, { maxSeconds: VOICE_MAX, nearSeconds: VOICE_NEAR })
  const transcribing = rec.state === 'transcribing'
  const transcribeFailed = rec.state === 'error' && rec.errorKind === 'network'

  const link = URL_RE.test(text) ? text.trim() : null
  // Instagram по ссылке текст не отдает: просим скрины, подпись или расшифровку рилса (своим Whisper, бесплатно)
  const igLink = !!link && /instagram\.com|instagr\.am/i.test(link)
  const igReel = igLink && /\/(reel|reels)\//i.test(link!)
  const needText = !!link && (igLink || !!askSampleText)
  // новая ссылка: старую просьбу вставить текст снимаем
  const lastLink = useRef(link)
  useEffect(() => {
    if (lastLink.current !== link) { lastLink.current = link; if (askSampleText) onSampleCleared?.() }
  }, [link, askSampleText, onSampleCleared])
  const sozhe: SozheSource | undefined = screens.length ? { kind: 'screens', files: screens }
    : link && needText ? (sampleText.trim().length >= 40 ? { kind: 'text', text: sampleText.trim(), label: link } : undefined)
    : link ? { kind: 'link', url: link } : undefined
  const hasText = !!text.trim() || !!sozhe || screens.length > 0
  useFeatureOpen('sozhe', !!link || screens.length > 0)
  const topic = topics.length ? topics[topicIdx % topics.length] : null

  const toggleFormat = (f: MakeFormat) => setFormats(prev => {
    const next = prev.includes(f) ? prev.filter(x => x !== f) : MAKE_FORMATS.map(m => m.id).filter(id => id === f || prev.includes(id))
    return next
  })

  const pasteLink = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim()
      // не ссылка в поле не идет: чужой пост, вставленный текстом, ушел бы в генерацию как своя мысль
      if (t && URL_RE.test(t)) { setText(t); setHint(null); return }
      if (t) { setHint('В буфере не ссылка. Скопируй ссылку на пост или загрузи скрин'); return }
    } catch {}
    setHint('Телефон не дал прочитать скопированное. Вставь ссылку сама: долгое нажатие на поле и «Вставить»')
    area.current?.focus()
  }
  const pickScreens = (list: FileList | null) => {
    const files = Array.from(list || []).filter(f => f.type.startsWith('image/')).slice(0, 10)
    if (files.length) setScreens(files)
  }
  const clearSozhe = () => { setScreens([]); if (link) setText(''); setAbout(''); setSampleText(''); onSampleCleared?.() }
  // видео рилса: расшифровка тем же своим Whisper, что голос (ничего не считаем); видео не храним
  const transcribeVideo = async (file: File | undefined) => {
    if (!file) return
    setVideoState('busy')
    try {
      const fd = new FormData()
      fd.append('file', file, file.name || 'reel.mp4')
      fd.append('purpose', 'sample') // чужой ролик: сервер не пишет его в память голоса
      const res = await fetch('/api/voice-transcribe', { method: 'POST', body: fd })
      const d = await res.json().catch(() => null)
      const t = typeof d?.text === 'string' ? d.text.trim() : ''
      if (!res.ok || !t) throw new Error()
      setSampleText(t); setVideoState('idle')
    } catch { setVideoState('error') }
  }

  const submit = () => {
    if (busy || !hasText || !formats.length || transcribing || (link && needText && !sozhe)) return
    writeLS(FORMATS_KEY, JSON.stringify(formats))
    // черновик стирает MakeFlow после первого готового формата: при ошибке мысль должна остаться
    setDraft(null)
    // тема: поле ровно как готовая тема (из адреса, карточки «Беру» или плана), иначе своя мысль
    const t = text.trim()
    const isTopic = !!t && (t === (initialText || '').trim() || topics.includes(t))
    onSubmit({ text: link ? '' : t, formats, goal, sozhe, about: sozhe ? about.trim() : undefined, mode: isTopic ? 'topic' : 'thought', voice: usedVoice.current })
  }

  const sourceLabel = screens.length
    ? `${screens.length} ${screens.length === 1 ? 'скрин' : screens.length < 5 ? 'скрина' : 'скринов'}`
    : link ? link.replace(/^https?:\/\/(www\.)?/i, '') : ''

  return (
    <div className="max-w-[560px] mx-auto px-4 pt-4 pb-8">
      <h1 className="text-[22px] leading-7 font-semibold text-brand-text">О чем сегодня?</h1>
      {firstTime && <p className="mt-1 text-[15px] leading-5 text-brand-muted">Начни с мысли. Например: «Сегодня клиентка сказала...»</p>}

      {(sozhe || link) && (
        <div className="mt-3 h-11 flex items-center gap-2 pl-3 rounded-xl bg-brand-soft text-brand-text">
          {screens.length ? <ImageIcon className="w-4 h-4 shrink-0" /> : <Link2 className="w-4 h-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-[14px] [overflow-wrap:anywhere]">По мотивам: {sourceLabel}</span>
          <button type="button" onClick={clearSozhe} aria-label="Убрать источник" className="w-11 h-11 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* поле мысли */}
      <div className="mt-3 rounded-[20px] bg-brand-card border-[1.5px] border-brand-border focus-within:border-brand-accent focus-within:ring-[3px] focus-within:ring-brand-soft transition">
        <textarea
          ref={area}
          value={text}
          onChange={e => { typed.current = true; setText(e.target.value); setHint(null) }}
          readOnly={transcribing}
          rows={3}
          aria-label="Мысль"
          placeholder={transcribing ? 'Расшифровываю...' : 'Наговори или напиши мысль. Пары слов хватит.'}
          className={`block w-full resize-none bg-transparent px-4 pt-3.5 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none ${transcribing ? 'animate-pulse' : ''}`}
        />
        <div className="h-16 flex items-center gap-2 pl-1 pr-1.5">
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Вставить скрин" className="w-11 h-11 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-soft cursor-pointer shrink-0">
            <Paperclip className="w-[22px] h-[22px]" />
          </button>
          <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-brand-muted">
            {transcribing ? <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Расшифровываю...</span> : 'Можно вставить и свой старый текст'}
          </p>
          <button type="button" onClick={() => { rec.reset(); setVoiceOpen(true) }} disabled={transcribing} aria-label="Записать голосом"
            className="w-14 h-14 rounded-full bg-brand-accent text-white flex items-center justify-center hover:bg-brand-accent-hover active:scale-95 transition cursor-pointer disabled:opacity-50 shrink-0">
            <Mic className="w-[26px] h-[26px]" />
          </button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={e => { pickScreens(e.target.files); e.target.value = '' }} />

      {transcribeFailed && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[14px] text-brand-text">
          <span className="min-w-0">Не получилось расшифровать. Запись цела</span>
          <button type="button" onClick={rec.retry} className="h-11 px-4 rounded-full border border-brand-border font-semibold cursor-pointer shrink-0">Еще раз</button>
        </div>
      )}
      {hint && <p className="mt-2 text-[13px] text-brand-muted" role="status">{hint}</p>}

      {!hasText && (
        <>
          {draft && (
            <button type="button" onClick={() => { typed.current = true; setText(draft); setDraft(null) }}
              className="mt-2 w-full h-11 flex items-center gap-2 px-1 text-left text-brand-text cursor-pointer">
              <FileText className="w-[18px] h-[18px] text-brand-muted shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[15px]">Продолжить черновик: {draft}</span>
              <ChevronRight className="w-4 h-4 text-brand-muted shrink-0" />
            </button>
          )}

          {/* Не знаю, о чем писать */}
          <div className="mt-4 rounded-2xl bg-brand-card border border-brand-border p-3.5">
            <p className="text-[13px] text-brand-muted">Не знаю, о чем писать</p>
            {topic ? (
              <p className="mt-1 text-[16px] leading-[22px] text-brand-text line-clamp-2">Сегодня можно: «{topic}»</p>
            ) : (
              <p className="mt-1 text-[16px] leading-[22px] text-brand-text">Загляни в темы: там идеи под твою нишу</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              {topic && (
                <>
                  <button type="button" onClick={() => setText(topic)} className="h-11 px-5 rounded-full border-[1.5px] border-brand-accent text-brand-accent text-[15px] font-semibold hover:bg-brand-soft cursor-pointer">Беру</button>
                  {topics.length > 1 && <button type="button" onClick={() => setTopicIdx(i => i + 1)} className="h-11 px-3 text-[15px] text-brand-text cursor-pointer">Другая</button>}
                </>
              )}
              <button type="button" onClick={() => router.push('/dashboard/content-plan?tab=ideas')} className="ml-auto h-11 px-2 text-[15px] text-brand-text-secondary hover:text-brand-text cursor-pointer">Все темы →</button>
            </div>
          </div>

          {/* Видела классный пост? */}
          <div className="mt-3 rounded-2xl bg-brand-soft p-3">
            <p className="text-[16px] leading-[22px] font-semibold text-brand-text">Видела классный пост?</p>
            <p className="mt-0.5 text-[14px] leading-5 text-brand-text/80">Вставь ссылку или скрин. Сделаю так же, но про твое и твоим голосом.</p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" onClick={pasteLink} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer">Вставить ссылку</button>
              <button type="button" onClick={() => fileInput.current?.click()} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer">Скрин</button>
            </div>
            <p className="mt-2 text-[13px] text-brand-text/70">Только публичные посты. Переписки с клиентами не загружай</p>
          </div>
        </>
      )}

      {hasText && (
        <div className="mt-4">
          {link && needText && !screens.length && (
            <div className="mb-4 space-y-2">
              <p className="text-[14px] text-brand-text">
                {igReel ? 'Загрузи видео или вставь расшифровку. Расшифровка бесплатно'
                  : igLink ? 'Инстаграм не отдает текст по ссылке. Загрузи скрины или скопируй подпись'
                  : 'Не получилось открыть пост по ссылке. Пришли скрин или вставь его текст'}
              </p>
              <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={4} aria-label="Текст поста"
                placeholder={igReel ? 'Расшифровка ролика' : 'Текст поста'}
                className="block w-full resize-y rounded-xl bg-brand-card border border-brand-border px-4 py-3 text-[16px] leading-6 text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent" />
              <div className="flex flex-wrap gap-2">
                {igReel && (
                  <button type="button" onClick={() => videoInput.current?.click()} disabled={videoState === 'busy'} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
                    {videoState === 'busy' && <Loader2 className="w-4 h-4 animate-spin" />}{videoState === 'busy' ? 'Расшифровываю...' : 'Загрузить видео'}
                  </button>
                )}
                <button type="button" onClick={() => fileInput.current?.click()} className="h-11 px-4 rounded-xl bg-white border border-brand-border-soft text-[15px] text-brand-text cursor-pointer">Скрин</button>
              </div>
              {videoState === 'error' && <p className="text-[13px] text-brand-muted">Не получилось расшифровать видео. Вставь расшифровку сама или загрузи скрины</p>}
              <input ref={videoInput} type="file" accept="video/*" hidden onChange={e => { transcribeVideo(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          )}
          {(sozhe || link) && (
            <div className="mb-4"><VoiceTextarea value={about} onChange={setAbout} placeholder="О чем у тебя? (можно пусто, подберу сама)" minHeight={56} /></div>
          )}
          <p className="text-[13px] text-brand-muted">Что сделать из этой мысли</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MAKE_FORMATS.map(f => {
              const on = formats.includes(f.id)
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => toggleFormat(f.id)}
                  className={`h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-[15px] cursor-pointer transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text'}`}>
                  {on ? <Check className="w-4 h-4 text-brand-accent" /> : <Plus className="w-4 h-4 text-brand-muted" />}
                  {f.label}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => setGoalOpen(true)} className="mt-2 h-11 inline-flex items-center gap-1 text-[15px] cursor-pointer">
            <span className="text-brand-muted">Цель:</span>
            <span className="text-brand-text">{(GOAL_OPTIONS.find(g => g.id === goal)?.label || 'Любая').toLowerCase()}</span>
            <ChevronDown className="w-4 h-4 text-brand-muted" />
          </button>
          <button type="button" onClick={submit} disabled={busy || !formats.length || transcribing || (!!link && needText && !sozhe)}
            className={`mt-4 w-full h-[52px] rounded-2xl text-[16px] font-semibold transition cursor-pointer ${formats.length ? 'bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60' : 'bg-brand-border text-brand-muted cursor-not-allowed'}`}>
            {!formats.length ? 'Выбери хотя бы один формат' : (sozhe || link) ? 'Сделать так же' : makeButtonText(formats)}
          </button>
          <p className="mt-2 text-center text-[13px] text-brand-muted">Все сохранится само в «Моих текстах»</p>
        </div>
      )}

      <VoiceSheet open={voiceOpen} rec={rec} onClose={() => setVoiceOpen(false)} onWriteText={() => { setVoiceOpen(false); rec.reset(); setTimeout(() => area.current?.focus(), 50) }} />
      <BottomSheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Цель">
        <div role="radiogroup" aria-label="Цель">
          {GOAL_OPTIONS.map(g => (
            <button key={String(g.id)} type="button" role="radio" aria-checked={goal === g.id} onClick={() => { setGoal(g.id); setGoalOpen(false) }}
              className="w-full h-[52px] flex items-center gap-3 text-left text-[16px] text-brand-text cursor-pointer">
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${goal === g.id ? 'border-brand-accent' : 'border-brand-border'}`}>
                {goal === g.id && <span className="w-2.5 h-2.5 rounded-full bg-brand-accent" />}
              </span>
              {g.label}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
