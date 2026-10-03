'use client'

// Секция «Мое оформление» в настройках: как выглядят обложка и последний слайд каждой новой карусели,
// и данные автора на них (ник, имя, строка о себе, фото). Сам вид запоминается из карусели кнопкой «Запомнить вид».

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Check, ArrowRight } from 'lucide-react'
import { shrink } from '@/lib/image-shrink'
import { initialsOf } from '@/components/CarouselDesigner'

type Mine = { style: string; label: string } | null
const COVER = 'Почему мы откладываем самое важное'
const FINAL = 'Если откликнулось, подписывайся'

export default function MyCarouselDesign() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mine, setMine] = useState<Mine>(null)
  const [canSave, setCanSave] = useState(false)
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState(0)
  const [bv, setBv] = useState('')
  const avatarRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([fetch('/api/carousel/design').then(r => r.json()), fetch('/api/carousel/photos').then(r => r.json())])
      .then(([d, p]) => {
        setMine(d.mine || null); setCanSave(!!d.canSaveMine); setHandle(d.handle || ''); setBv(d.brandVersion || '')
        setName(d.author?.name || ''); setAbout(d.author?.about || ''); setAvatar(p.avatar?.url || null)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  const save = async () => {
    setBusy('save'); setError(null); setSaved(false)
    try {
      const r = await fetch('/api/carousel/design', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, name, about }) })
      if (!r.ok) throw new Error()
      setSaved(true); setV(x => x + 1)
    } catch { setError('Не получилось сохранить, твои правки на месте. Нажми еще раз') }
    setBusy(null)
  }
  const upload = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy('avatar'); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', new File([await shrink(f)], 'photo.jpg', { type: 'image/jpeg' }))
      fd.append('kind', 'avatar')
      const r = await fetch('/api/carousel/photos', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setAvatar(d.avatar?.url || null); setV(x => x + 1)
    } catch (e: any) { setError(e?.message || 'Не получилось загрузить фото') }
    setBusy(null)
    if (avatarRef.current) avatarRef.current.value = ''
  }

  if (state === 'loading') return <div className="h-40 rounded-3xl bg-brand-soft animate-pulse" />
  if (state === 'error') return <p className="text-sm text-brand-muted">Не получилось загрузить оформление. Обнови страницу.</p>

  const src = (final: boolean) => mine
    ? `/api/carousel/preview?style=${mine.style}&mine=1&total=7&cover=${encodeURIComponent(final ? FINAL : COVER)}${final ? '&final=1' : ''}&v=${bv}-${v}`
    : ''
  const field = 'w-full px-3 py-2.5 rounded-xl border border-brand-border bg-white text-base sm:text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent'

  return (
    <div className="rounded-3xl bg-brand-card border border-brand-border p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-brand-text mb-1">Мое оформление</h3>
        <p className="text-sm text-brand-muted leading-relaxed">Стиль, цвета, ник и фото. Все новые карусели открываются сразу в этом виде.</p>
      </div>

      {mine ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[false, true].map(f => (
              <figure key={String(f)} className="space-y-1">
                <img src={src(f)} alt={f ? 'Последний слайд в твоем оформлении' : 'Обложка в твоем оформлении'} className="w-full aspect-[3/4] rounded-xl border border-brand-border bg-brand-bg object-cover" />
                <figcaption className="text-xs text-brand-muted">{f ? 'Последний слайд' : 'Обложка'}</figcaption>
              </figure>
            ))}
          </div>
          <p className="text-sm text-brand-text">Стиль: {mine.label}. Поменять можно в любой карусели: выбери другой вид и нажми «Оставить этот вид».</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-brand-soft p-4 space-y-3">
          <p className="text-sm text-brand-text">Пока не настроено. Сделай первую карусель, выбери стиль, и он появится здесь.</p>
          <Link href="/dashboard/make?format=carousel" className="inline-flex items-center gap-2 text-brand-accent font-semibold text-sm">Сделать карусель <ArrowRight className="w-4 h-4" /></Link>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="mcd-handle" className="block text-sm font-medium text-brand-text">Ник в Instagram</label>
            <input id="mcd-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@anna.psy" autoCapitalize="none" autoCorrect="off" className={field} />
          </div>
          {canSave && (
            <div className="space-y-1">
              <label htmlFor="mcd-name" className="block text-sm font-medium text-brand-text">Как тебя подписать</label>
              <input id="mcd-name" value={name} onChange={e => setName(e.target.value)} placeholder="Анна Соколова" className={field} />
            </div>
          )}
        </div>
        {canSave && (
          <div className="space-y-1">
            <label htmlFor="mcd-about" className="block text-sm font-medium text-brand-text">Пара слов о себе</label>
            <textarea id="mcd-about" value={about} onChange={e => setAbout(e.target.value)} maxLength={90} rows={2} placeholder="Психолог, работаю с тревогой и отношениями" className={field + ' resize-none'} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-soft border border-brand-border shrink-0">{avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-brand-text">{initialsOf(name)}</span>}</div>
          <button type="button" onClick={() => avatarRef.current?.click()} disabled={!!busy} className="text-sm font-semibold text-brand-accent hover:underline cursor-pointer">
            {busy === 'avatar' ? 'Загружаю' : avatar ? 'Сменить фото' : 'Твое фото'}
          </button>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files)} />
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={!!busy} className="px-5 h-11 rounded-xl text-sm font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60 cursor-pointer">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
          </button>
          {saved && <span className="text-sm text-brand-text" role="status"><Check className="w-4 h-4 inline -mt-0.5 mr-1 text-brand-sage" />Сохранила</span>}
        </div>
        {error && <p className="text-sm text-brand-text bg-brand-soft rounded-xl px-3 py-2" role="alert">{error}</p>}
      </div>
    </div>
  )
}
