'use client'

// Один формат в результате «Написать» (вкладка; вариант А, макеты A6 компьютер и A4 телефон, словарь 17.11).
// Карточка с текстом и «Описанием», под ней «Скопировать текст», «Поправить», «Уже в блоге». После копирования главная
// кнопка становится «Уже в блоге», после нажатия «Опубликовано» и «Отменить». «Поправить» открывает лист: Короче,
// Теплее, Живее, Убрать клише, Править текст, Другой вариант. «Звучит как я» / «Не похоже на меня» справа
// («Как тебе текст?») на компьютере и под текстом на телефоне. На телефоне действия в липкой панели над нижним меню.
// Обучение голосу: правки перед копированием уходят в /api/voice-events (как на старом экране).

import { track } from '@/lib/track'
import { normFormat } from '@/lib/analytics/events'
import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, MoreHorizontal, Loader2 } from 'lucide-react'
import { splitPostTitle } from '@/lib/post-format'
import ReelsScript from '@/components/ReelsScript'
import CaptionBlock, { splitCaption } from '@/components/CaptionBlock'
import CarouselDesigner, { type CarouselFocusOpts } from '@/components/CarouselDesigner'
import PostCover from '@/components/PostCover'
import { zamenaKak } from './vid-hints'
import BottomSheet from './BottomSheet'
import { useDashboardMe } from '@/lib/dashboard-me'
import { isMaterials, spendLine } from '@/lib/limit-texts'
import { dateRu } from '@/lib/billing/pay-texts'

export type PaneItem = {
  format: string          // формат экрана: reels, carousel, post, post_tg, stories
  code: string            // код текста: reels_monolog, post_tg...
  postId: string | null
  text: string
  baseline: string        // последняя версия от сервиса (для обучения на правках)
  publishedAt: string | null
  formatName?: string     // имя формата от генератора zh6 («Сценка: я и мой внутренний голос»), если пришло
  vidZamenen?: boolean    // zh6: выбранная подача не подошла голосу или «Пока без видео», генератор взял другую
  vid?: string            // zh6: код подачи каталога (по нему блок «как снять» над рилсом)
}

const ADJUST = [
  { id: 'короче', label: 'Короче' },
  { id: 'теплее', label: 'Теплее' },
  { id: 'живее', label: 'Живее' },
  { id: 'без клише', label: 'Убрать клише' },
]
const NOT_LIKE_REASONS = ['слишком умно', 'слишком сладко', 'не мои слова', 'длинно', 'не та тема']
const PLACEHOLDER_RE = /\[добавь:[^\]]*\]/g
const LONG = 600
const SHADOW = 'shadow-[0_1px_2px_rgba(59,42,34,.05),0_8px_24px_rgba(59,42,34,.06)]'
const FAIL_MARK = 'Отметить не получилось. Проверь интернет и нажми еще раз'

const sendVoiceEvent = (payload: Record<string, unknown>) =>
  fetch('/api/voice-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})

function replaceFirstLine(text: string, line: string): string {
  const lines = text.split('\n')
  const i = lines.findIndex(l => l.trim())
  if (i < 0) return text
  const m = lines[i].match(/^(\s*\[?(?:Слайд|Экран)\s*\d+\]?\s*:?\s*)/i)
  lines[i] = (m ? m[1] : '') + line
  return lines.join('\n')
}

// Блок правой колонки результата: на компьютере белая карточка с заголовком, на телефоне без карточки, заголовок тише
export function AsideCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 xl:rounded-[20px] xl:bg-brand-card xl:px-5 xl:py-[18px] xl:shadow-[0_1px_2px_rgba(59,42,34,.05),0_8px_24px_rgba(59,42,34,.06)]">
      <h2 className="text-[14px] leading-5 text-brand-muted xl:text-[18px] xl:leading-[26px] xl:font-semibold xl:text-brand-text">{title}</h2>
      {sub && <p className="hidden xl:block mt-0.5 text-[13px] leading-[18px] text-brand-muted">{sub}</p>}
      <div className="mt-2.5 xl:mt-3">{children}</div>
    </section>
  )
}

// Серия сторис: «Экран N:», под ним «Снять:», «Надпись:», «Стикер:»; в конце «Что делать с ответами:»
function StoriesView({ text }: { text: string }) {
  const blocks: { n: string; rows: [string, string][] }[] = []
  let tail = ''
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (!l) continue
    const scr = l.match(/^Экран\s*(\d+)\s*:?\s*(.*)$/iu)
    if (scr) { blocks.push({ n: scr[1], rows: scr[2] ? [['Надпись', scr[2]]] : [] }); continue }
    const lab = l.match(/^(Снять|Надпись|Стикер)\s*:\s*(.*)$/iu)
    if (lab && blocks.length) { blocks[blocks.length - 1].rows.push([lab[1], lab[2]]); continue }
    const fin = l.match(/^Что делать с ответами\s*:\s*(.*)$/iu)
    if (fin) { tail = fin[1]; continue }
    if (blocks.length) blocks[blocks.length - 1].rows.push(['', l])
  }
  if (!blocks.length) return <p className="text-[16px] leading-[26px] text-brand-text whitespace-pre-wrap break-words">{text}</p>
  return (
    <div className="space-y-3">
      {blocks.map(b => (
        <div key={b.n} className="rounded-2xl bg-brand-bg px-4 py-3">
          <p className="text-[13px] font-semibold text-brand-muted">Экран {b.n}</p>
          {b.rows.map(([k, v], i) => (
            <p key={i} className={`mt-1 text-[15px] leading-6 break-words ${k === 'Надпись' ? 'text-brand-text font-semibold' : 'text-brand-text-secondary'}`}>
              {k && k !== 'Надпись' && <span className="text-brand-muted">{k}: </span>}{v}
            </p>
          ))}
        </div>
      ))}
      {tail && <p className="text-[15px] leading-6 text-brand-text-secondary"><span className="text-brand-muted">Что делать с ответами: </span>{tail}</p>}
    </div>
  )
}

export default function FormatPane({ item, onChange, onPublished, onMore, moreContent, onMoreOpenChange, onCopied, aside, carouselFocus, onCarouselFocus }: {
  item: PaneItem
  onChange: (patch: Partial<PaneItem>) => void
  onPublished: (at: string | null) => void
  onMore?: () => void                               // старый способ: экран сам открывает лист «Еще»
  moreContent?: (close: () => void) => ReactNode     // пункты листа «Еще» от экрана (еще из мысли, скопировать все, удалить)
  onMoreOpenChange?: (open: boolean) => void         // лист «Еще» открылся или закрылся (экран сбрасывает подтверждение удаления)
  onCopied?: () => void                              // показать «Скопировано» вверху экрана
  aside?: ReactNode                                  // «Еще из этой мысли»: справа на компьютере, под текстом на телефоне
  carouselFocus?: CarouselFocusOpts                  // шапка режима фокуса карусели (вкладки форматов, «Назад»)
  onCarouselFocus?: (on: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [adjusting, setAdjusting] = useState<string | null>(null)
  // full и formatName приходят у текстов zh6: «Другой вариант» там это весь новый текст, а не одна первая строка
  const [hooks, setHooks] = useState<{ hook_type: string; text: string; why: string; full?: string; formatName?: string }[] | null>(null)
  const [reaction, setReaction] = useState<'mine' | 'not_like' | null>(null)
  const [notLikeOpen, setNotLikeOpen] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [phValues, setPhValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [copiedOnce, setCopiedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastReported, setLastReported] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  // пока поле в фокусе (нижнее меню уехало под клавиатуру), липкую панель тоже прячем, иначе она висит в воздухе
  const { typing, me } = useDashboardMe()
  // «Другой вариант» пишет целый новый текст и тратит 1 текст: сначала пояснение и кнопка, не с одного касания
  const [variantAsk, setVariantAsk] = useState(false)
  const materials = isMaterials(me?.materials) ? me.materials : null
  const paidUntil = (() => { try { return me?.paidUntil ? dateRu(me.paidUntil) : undefined } catch { return undefined } })()
  useEffect(() => { onMoreOpenChange?.(moreOpen) }, [moreOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const { text, code, postId } = item
  const isCarousel = code === 'carousel'
  const parsed = splitPostTitle(text, code)
  const body = parsed?.body ?? text
  const placeholders = Array.from(new Set(text.match(PLACEHOLDER_RE) || []))
  const clampable = !code.startsWith('reels') && code !== 'stories' && text.length > LONG
  const published = !!item.publishedAt

  const copy = () => {
    if (postId && item.baseline && lastReported !== text) {
      setLastReported(text)
      sendVoiceEvent({ action: 'copy', postId, generated: item.baseline, copied: text })
    }
    track('material_take', { how: 'copy', format: normFormat(code), ...(postId ? { post: postId } : {}) })
    // служебная строка [смена] (смена надписи в беззвучном рилсе zh6) в Instagram не нужна, вместо нее пустая строка
    const out = text.replace(/^[ \t]*\[\s*смена\s*\][ \t]*$/gimu, '').replace(/\n{3,}/g, '\n\n')
    navigator.clipboard.writeText(out).then(() => { setCopied(true); setCopiedOnce(true); onCopied?.(); setTimeout(() => setCopied(false), 2000) })
      .catch(() => { setError('Не получилось скопировать. Нажми на текст и выдели вручную') })
  }

  const adjust = async (action: string) => {
    if (!postId || adjusting) return
    setAdjusting(action); setError(null)
    try {
      const r = await fetch('/api/generate-post/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, action, text }) })
      const d = await r.json().catch(() => ({}))
      // zh6: правка сломала бы разметку, сервер вернул текст без изменений; текст не трогаем, говорим мягко
      if (r.status === 422 && d?.unchanged) {
        setError(typeof d.error === 'string' && d.error.trim() ? d.error.trim().slice(0, 200) : 'Аккуратно поправить не получилось, текст остался прежним. Попробуй еще раз или другую кнопку.')
        return
      }
      // zh6: «Другой вариант» пишет целый текст и считается как текст; предел сказать словами сервера, не сырым кодом
      if (r.status === 429 && d?.limit) { setError(typeof d.error === 'string' ? d.error.slice(0, 200) : 'Тексты закончились'); return }
      if (!r.ok) throw new Error()
      if (action === 'hooks') { if (Array.isArray(d.hooks)) setHooks(d.hooks) }
      else if (typeof d.post === 'string') onChange({ text: d.post, baseline: d.post })
      if (action !== 'hooks') { setFixOpen(false); setDone('Готово, текст поправлен'); setTimeout(() => setDone(null), 2500) }
    } catch {
      setError('Не получилось поправить. Текст на месте, попробуй еще раз')
    } finally { setAdjusting(null) }
  }
  // «Другой вариант» сразу из-под текста: лист открывается уже с вариантами
  const otherVariant = () => { setHooks(null); setVariantAsk(true); setFixOpen(true) }
  const noLeft = !!materials && materials.remaining <= 0

  const pickHook = (h: { hook_type: string; text: string; full?: string; formatName?: string }) => {
    const first = text.split('\n').find(l => l.trim()) || ''
    sendVoiceEvent({ action: 'hook_pick', postId, before: first, after: h.text, hookType: h.hook_type })
    const failSave = 'Вариант на экране, но сохранить не получилось. Скопируй его сейчас или нажми «Другой вариант» еще раз'
    if (typeof h.full === 'string' && h.full.trim()) {
      onChange({ text: h.full, baseline: h.full, ...(typeof h.formatName === 'string' && h.formatName.trim() ? { formatName: h.formatName.trim().slice(0, 120) } : {}) })
      // zh6: вариант целиком ставим и в базу (сервер берет его из своей записи, текст с экрана не доверяем)
      if (postId) fetch('/api/generate-post/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, action: 'zahod_pick' }) })
        .then(r => { if (!r.ok) setError(failSave) })
        .catch(() => setError(failSave))
    } else onChange({ text: replaceFirstLine(text, h.text), baseline: replaceFirstLine(item.baseline, h.text) })
    setHooks(null); setFixOpen(false)
  }

  const react = (kind: 'mine' | 'not_like') => {
    if (!postId) return
    setReaction(kind); setNotLikeOpen(false)
    sendVoiceEvent({ action: kind, postId, reasons: kind === 'not_like' ? reasons : [], note: kind === 'not_like' ? note : '' })
  }

  const togglePublished = async () => {
    if (!postId) return
    const undo = published
    const at = undo ? null : new Date().toISOString()
    onPublished(at)
    try {
      const r = await fetch('/api/generate-post/published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, undo }) })
      if (!r.ok) { onPublished(item.publishedAt); setError(FAIL_MARK) }
    } catch { onPublished(item.publishedAt); setError(FAIL_MARK) }
  }

  const openMore = () => { if (moreContent) setMoreOpen(true); else onMore?.() }

  // ---------- кнопки ----------
  const btnP = 'h-12 px-5 rounded-2xl bg-brand-accent text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-brand-accent-hover cursor-pointer transition'
  const btnO = 'h-12 px-5 rounded-2xl border-[1.5px] border-brand-accent bg-white text-brand-accent text-[16px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-brand-soft-2 cursor-pointer transition disabled:opacity-40'
  const copyBtn = (cls: string) => (
    <button type="button" onClick={copy} className={cls}>
      {copied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}<span className="truncate">{copied ? 'Скопировано' : <>Скопировать<span className="hidden sm:inline"> текст</span></>}</span>
    </button>
  )
  const blogBtn = (cls: string) => (
    <button type="button" onClick={togglePublished} disabled={!postId} className={cls}><Check className="w-4 h-4 shrink-0" /><span className="truncate">Уже в блоге</span></button>
  )
  const publishedPill = (cls = '') => (
    <span className={`h-12 pl-3.5 pr-1 rounded-2xl bg-brand-soft-2 inline-flex items-center gap-1.5 min-w-0 ${cls}`} role="status">
      <Check className="w-4 h-4 text-brand-accent shrink-0" />
      <span className="text-[15px] font-semibold text-brand-text truncate">Опубликовано{item.publishedAt && <span className="hidden lg:inline"> {new Date(item.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>}</span>
      <button type="button" onClick={togglePublished} className="ml-auto min-h-11 px-2.5 text-[14px] font-medium text-brand-muted hover:text-brand-text cursor-pointer shrink-0">Отменить</button>
    </span>
  )
  // главная: до копирования «Скопировать текст», после «Уже в блоге», после отметки «Опубликовано» и «Отменить»
  const primary = (cls: string, pillCls?: string) => published ? publishedPill(pillCls) : copiedOnce ? blogBtn(`${btnP} ${cls}`) : copyBtn(`${btnP} ${cls}`)
  const fixBtn = (cls: string) => <button type="button" onClick={() => setFixOpen(true)} disabled={!postId} className={`${btnO} ${cls}`}>Поправить</button>
  const moreBtn = () => (
    <button type="button" onClick={openMore} aria-label="Еще действия" className="w-12 h-12 rounded-2xl border-[1.5px] border-brand-accent bg-white text-brand-accent inline-flex items-center justify-center cursor-pointer shrink-0 hover:bg-brand-soft-2">
      <MoreHorizontal className="w-5 h-5" />
    </button>
  )

  const reactions = postId ? (
    <AsideCard title="Как тебе текст?" sub="Следующие тексты подстроятся под ответ">
      {reaction ? (
        <p className="text-[14px] leading-5 text-brand-text-secondary" role="status">Принято, это учтется в следующих текстах</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => react('mine')} className="h-11 px-4 rounded-full border border-brand-border bg-white text-[15px] font-medium text-brand-text hover:border-brand-text cursor-pointer">Звучит как я</button>
            <button type="button" aria-expanded={notLikeOpen} onClick={() => setNotLikeOpen(!notLikeOpen)}
              className={`h-11 px-4 rounded-full border bg-white text-[15px] font-medium text-brand-text cursor-pointer ${notLikeOpen ? 'border-brand-text' : 'border-brand-border hover:border-brand-text'}`}>Не похоже на меня</button>
          </div>
          {notLikeOpen && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {NOT_LIKE_REASONS.map(r => (
                  <button key={r} type="button" aria-pressed={reasons.includes(r)} onClick={() => setReasons(reasons.includes(r) ? reasons.filter(x => x !== r) : [...reasons, r])}
                    className={`h-11 px-4 rounded-full text-[14px] cursor-pointer inline-flex items-center gap-1.5 ${reasons.includes(r) ? 'bg-brand-soft border border-brand-text text-brand-text font-semibold' : 'bg-white border border-brand-border text-brand-text-secondary'}`}>
                    {reasons.includes(r) && <Check className="w-3.5 h-3.5 text-brand-accent" />}{r}
                  </button>
                ))}
              </div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Или своими словами, что не так" aria-label="Что не так"
                className="w-full h-11 px-3 rounded-xl border border-brand-border bg-white text-[16px] text-brand-text focus:outline-none focus:border-brand-accent" />
              <button type="button" disabled={!reasons.length && !note.trim()} onClick={() => react('not_like')}
                className="h-11 px-5 rounded-xl text-[15px] font-semibold text-white bg-brand-accent disabled:opacity-40 cursor-pointer">Учесть</button>
            </div>
          )}
        </>
      )}
    </AsideCard>
  ) : null

  // липкая панель на телефоне: у карусели своя (CarouselDesigner mobileBar="fixed"), две панели не ставим
  const phoneBar = !editing && !typing && !isCarousel

  return (
    <div className={`min-w-0 ${isCarousel ? '' : 'xl:flex xl:items-start xl:gap-10'} ${phoneBar ? 'max-lg:pb-[84px]' : ''}`}>
      <div className={`min-w-0 ${isCarousel ? '' : 'xl:w-[704px] xl:shrink-0'}`}>
        <div className={`rounded-[20px] bg-brand-card ${SHADOW} p-5 lg:px-[30px] lg:py-7 min-w-0 overflow-hidden`}>
          {editing ? (
            <textarea value={text} onChange={e => onChange({ text: e.target.value })} autoFocus aria-label="Текст"
              rows={Math.min(24, Math.max(8, text.split('\n').length + 2))}
              className="w-full px-3 py-2.5 rounded-xl border border-brand-border bg-white text-brand-text text-[16px] leading-relaxed focus:outline-none focus:border-brand-accent resize-y" />
          ) : (
            <>
              {item.vidZamenen && <p className="mb-2 text-[13px] leading-5 text-brand-muted break-words">{zamenaKak(item.formatName)}</p>}
              {item.formatName && !code.startsWith('reels') && (
                <p className="mb-2 text-[13px] leading-5 text-brand-muted break-words">{item.formatName}</p>
              )}
              {parsed?.title && (
                <h3 className="mb-3 text-[22px] leading-[30px] font-semibold text-brand-text break-words">{parsed.title}</h3>
              )}
              {code.startsWith('reels') ? (
                <ReelsScript text={text} format={code} postId={postId} mark={t => t} title={item.formatName} vid={item.vid} />
              ) : code === 'stories' ? (
                <StoriesView text={text} />
              ) : (
                <div className="space-y-5">
                  <div className={`relative space-y-4 ${clampable && !expanded ? 'max-lg:max-h-[360px] max-lg:overflow-hidden' : ''}`}>
                    {splitCaption(body).body.split(/\n{2,}/).map((p, i) => (
                      <p key={i} className="text-[16px] leading-[26px] lg:text-[17px] lg:leading-[28px] text-brand-text whitespace-pre-wrap break-words">{p}</p>
                    ))}
                    {clampable && !expanded && <span aria-hidden="true" className="lg:hidden absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-brand-card to-brand-card/0" />}
                  </div>
                  {clampable && !expanded && (
                    <button type="button" onClick={() => setExpanded(true)} className="lg:hidden -mt-3 h-11 text-[15px] font-medium text-brand-muted hover:text-brand-text cursor-pointer">Читать дальше</button>
                  )}
                  <CaptionBlock caption={splitCaption(body).caption} format={code} postId={postId} title="Описание" />
                </div>
              )}
            </>
          )}

          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="mt-3 h-11 px-5 rounded-xl bg-brand-accent text-white font-semibold cursor-pointer">Готово</button>
          )}

          {placeholders.length > 0 && !editing && (
            <div className="mt-4 rounded-xl border border-brand-border px-3 py-3 space-y-2">
              <p className="text-[14px] text-brand-text">Тут нужна твоя история или мнение, их за тебя не придумать. Впиши, и это встанет в текст:</p>
              {placeholders.map(ph => {
                const label = ph.replace(/^\[добавь:\s*/, '').replace(/\]$/, '')
                return (
                  <div key={ph} className="flex gap-2">
                    <input value={phValues[ph] || ''} onChange={e => setPhValues({ ...phValues, [ph]: e.target.value })} placeholder={label} aria-label={label}
                      className="min-w-0 flex-1 h-11 px-3 rounded-lg border border-brand-border bg-white text-[16px] text-brand-text focus:outline-none focus:border-brand-accent" />
                    <button type="button" onClick={() => { const v = (phValues[ph] || '').trim(); if (v) onChange({ text: text.split(ph).join(v) }) }}
                      className="h-11 px-3 rounded-lg text-[14px] font-semibold text-brand-accent border border-brand-accent/40 cursor-pointer shrink-0">Вставить</button>
                  </div>
                )
              })}
            </div>
          )}

          {error && !fixOpen && <p className="mt-3 text-[14px] text-brand-text" role="status">{error}</p>}
          {done && <p className="mt-3 text-[14px] text-brand-muted" role="status">{done}</p>}

          {/* действия под текстом: на компьютере всегда, на телефоне у карусели (у нее своя липкая панель) */}
          {!editing && (
            <div className={`${isCarousel ? 'flex' : 'hidden lg:flex'} mt-5 flex-wrap items-center gap-2.5`}>
              {primary('', 'min-w-[220px]')}
              {fixBtn('')}
              {published || copiedOnce ? copyBtn(btnO) : blogBtn(btnO)}
              {moreBtn()}
            </div>
          )}
          {!editing && postId && !code.startsWith('reels_scenka') && (
            <button type="button" onClick={otherVariant} disabled={!!adjusting}
              className={`${isCarousel ? 'inline-flex' : 'hidden lg:inline-flex'} mt-3 min-h-11 items-center gap-2 text-[15px] font-semibold text-brand-accent hover:text-brand-accent-hover cursor-pointer disabled:opacity-50`}>
              {adjusting === 'hooks' && <Loader2 className="w-4 h-4 animate-spin" />}Другой вариант
            </button>
          )}
        </div>

        {/* оформление карусели и обложка поста */}
        {postId && !editing && isCarousel && (
          <div className="mt-4"><CarouselDesigner postId={postId} text={text} onTextChange={t => onChange({ text: t })} focus={carouselFocus} onFocusChange={onCarouselFocus} mobileBar="fixed" /></div>
        )}
        {postId && !editing && code === 'post' && <div className="mt-4"><PostCover key={postId} postId={postId} text={text} /></div>}
      </div>

      {(reactions || aside) && (
        <div className={`mt-5 space-y-5 min-w-0 ${isCarousel ? 'xl:grid xl:grid-cols-2 xl:gap-5 xl:space-y-0' : 'xl:mt-0 xl:w-[360px] xl:shrink-0'}`}>
          {reactions}
          {aside}
        </div>
      )}

      {/* липкая панель над нижним меню (56 px) на телефоне; пока текст правится, ее нет */}
      {phoneBar && (
        <div className="lg:hidden fixed inset-x-0 z-30 bottom-[calc(56px+env(safe-area-inset-bottom))] bg-brand-card border-t border-brand-border">
          <div className="flex items-center gap-2 px-4 py-2.5">
            {primary('flex-1 min-w-0 px-3', 'flex-1')}
            {fixBtn('px-4 shrink-0')}
            {moreBtn()}
          </div>
        </div>
      )}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Еще">
        <div className="pt-1">
          {/* копирование и отметка тут тоже: на телефоне главная кнопка уже могла смениться на «Уже в блоге» */}
          <button type="button" onClick={() => { copy(); setMoreOpen(false) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Скопировать текст</button>
          {!published && postId && (
            <button type="button" onClick={() => { togglePublished(); setMoreOpen(false) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Уже в блоге</button>
          )}
          {postId && !code.startsWith('reels_scenka') && (
            <button type="button" onClick={() => { setMoreOpen(false); otherVariant() }} className="lg:hidden w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Другой вариант</button>
          )}
          {published && (
            <button type="button" onClick={() => { setFixOpen(true); setMoreOpen(false) }} className="w-full h-[52px] text-left text-[16px] text-brand-text cursor-pointer">Поправить</button>
          )}
          {moreContent?.(() => setMoreOpen(false))}
        </div>
      </BottomSheet>

      <BottomSheet open={fixOpen} onClose={() => { setFixOpen(false); setHooks(null); setVariantAsk(false) }} title={variantAsk || hooks || adjusting === 'hooks' ? 'Другой вариант' : 'Поправить'}>
        {variantAsk && !hooks && adjusting !== 'hooks' ? (
          <div className="pt-1 pb-1">
            <p className="text-[15px] leading-[22px] text-brand-text">Новый вариант целиком, это 1 из твоих текстов.</p>
            {materials && <p className="mt-1 text-[14px] leading-5 text-brand-muted">{noLeft ? 'Тексты закончились, новый вариант сейчас не написать' : spendLine(materials, 1, paidUntil)}</p>}
            <button type="button" disabled={noLeft || !!adjusting} onClick={() => { setVariantAsk(false); adjust('hooks') }}
              className="mt-4 w-full h-[52px] rounded-2xl bg-brand-accent text-white text-[16px] font-semibold hover:bg-brand-accent-hover cursor-pointer disabled:opacity-40">Написать другой вариант</button>
            {error && <p className="py-2 text-[14px] text-brand-text" role="status">{error}</p>}
          </div>
        ) : adjusting === 'hooks' && !hooks ? (
          <p className="py-6 flex items-center gap-2 text-[15px] text-brand-text-secondary" role="status"><Loader2 className="w-4 h-4 animate-spin" />Вариант пишется</p>
        ) : hooks ? (
          <div className="space-y-2 pt-1">
            <p className="text-[14px] text-brand-muted">{hooks.some(h => h.full) ? 'Нажми на вариант, и он встанет целиком вместо этого текста.' : 'Выбери первую строку, она встанет вместо текущей:'}</p>
            {hooks.map((h, i) => (
              <button key={i} type="button" onClick={() => pickHook(h)} className="w-full text-left px-4 py-3 rounded-xl border border-brand-border bg-white hover:border-brand-accent cursor-pointer">
                <span className="block text-[15px] text-brand-text break-words">{h.text}</span>
                {h.why && <span className="block text-[13px] text-brand-muted mt-0.5">{h.why}</span>}
              </button>
            ))}
            {error && <p className="py-2 text-[14px] text-brand-text" role="status">{error}</p>}
          </div>
        ) : (
          <div className="pt-1">
            {/* действия строками: пилюли тут читались бы как выбор */}
            {ADJUST.map(a => (
              <button key={a.id} type="button" disabled={!!adjusting} onClick={() => adjust(a.id)}
                className="w-full h-[52px] flex items-center gap-2 text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-50">
                {adjusting === a.id && <Loader2 className="w-4 h-4 animate-spin" />}{a.label}
              </button>
            ))}
            <button type="button" onClick={() => { setFixOpen(false); setEditing(true) }}
              className="w-full h-[52px] flex items-center text-left text-[16px] text-brand-text cursor-pointer">Править текст</button>
            {!code.startsWith('reels_scenka') && (
              <button type="button" disabled={!!adjusting} onClick={() => setVariantAsk(true)}
                className="w-full h-[52px] flex items-center gap-2 text-left text-[16px] text-brand-text cursor-pointer disabled:opacity-50">Другой вариант</button>
            )}
            {error && <p className="py-2 text-[14px] text-brand-text" role="status">{error}</p>}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
