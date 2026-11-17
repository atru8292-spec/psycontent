'use client'

// «Настройки» (вариант А, 17.11; макет A8 на компьютере, A11 на телефоне). Бывший «Профиль».
// Группы: Голос (с паспортом бренда и, у старого мозга, архетипом), Практика, Оформление каруселей, Тариф, Аккаунт.
// На телефоне Тариф первым блоком, остальное строками; ниже «Помощь» и подсказка «на экран Домой».
// Сводку /api/me берем из layout (DashboardMeContext), второй раз не тянем.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDashboardMe } from '@/lib/dashboard-me'
import MyCarouselDesign from '@/components/MyCarouselDesign'
import TariffSection from '@/components/TariffSection'
import SubscriptionCard from '@/components/SubscriptionCard'
import DeleteAccount from '@/components/DeleteAccount'
import HelpCard from '@/components/dashboard/HelpCard'
import AddToHome from '@/components/dashboard/AddToHome'
import { ARCHETYPES, ARCHETYPE_ACCENT, archetypeLabel, flexibleLine, getArchetypeSelectionFromProfile, type ArchetypeSelection } from '@/lib/archetypes'
import { ArchetypeGlyph, FlexibleGlyph } from '@/lib/archetype-glyphs'
import { isMaterials } from '@/lib/limit-texts'
import { STYLES, TEMPLATE_STYLES, type TemplateStyle } from '@/lib/carousel/styles'

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const PROFANITY_RU: Record<string, string> = { no: 'без мата', light: 'иногда', free: 'как в жизни' }
const INTENSITY_RU: Record<string, string> = { calm: 'спокойно', live: 'живо', hot: 'на эмоциях' }
// стили для мини-обложек без узоров и мрамора (решение 17.11); рисуются с decor=none
const CALM_STYLES: TemplateStyle[] = ['t_zametki', 't_perepiska', 't_premium', 't_redakciya']
const MINI_COVER = 'Почему мы откладываем самое важное'

type Design = { mine: { style: TemplateStyle; label: string } | null; handle: string }

// компьютер или телефон: решает раскладку (строки A11 или карточки A8) и где живет MyCarouselDesign
function useDesktop() {
  const [desk, setDesk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesk(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desk
}

export default function SettingsPage() {
  const router = useRouter()
  const { me: summary, loaded } = useDashboardMe()
  const [profile, setProfile] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [design, setDesign] = useState<Design | null>(null)
  const [tariffsOpen, setTariffsOpen] = useState(false)
  // раскрытые строки на телефоне и «Все стили» на компьютере
  const [openRow, setOpenRow] = useState<null | 'carousel' | 'account' | 'archetype'>(null)
  const [allStyles, setAllStyles] = useState(false)
  const [askLogout, setAskLogout] = useState(false)
  const desk = useDesktop()
  // новый кабинет (новый мозг у этого человека): zh6 архетип не читает, поэтому тест тут не предлагаем
  const newPipe = summary?.newPipeline === true

  useEffect(() => {
    if (!loaded) return
    let on = true
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!on) return
      if (!user) { router.replace('/'); return }
      setEmail(user.email || '')
      const prof = await supabase.from('onboarding_profiles')
        .select('archetype_scores, archetype_primary, profanity, intensity, author_gender, approaches, one_niche, niches, experience')
        .eq('user_id', user.id).maybeSingle()
      if (!on) return
      if (!summary) { setStatus('error'); return }
      setProfile(prof.data || null)
      setStatus('ready')
    }
    load()
    fetch('/api/carousel/design').then(r => (r.ok ? r.json() : null)).then(d => { if (on && d) setDesign({ mine: d.mine || null, handle: d.handle || '' }) }).catch(() => {})
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, !!summary, router])

  // Переход по якорю: #tariff раскрывает тарифы (так ведут «Посмотреть тарифы» из меню и отказы лимита),
  // #carousel раскрывает оформление, остальные (#voice, #archetype) просто прокручивают
  const goHash = useCallback(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    if (hash === 'tariff') setTariffsOpen(true)
    if (hash === 'carousel') setOpenRow('carousel')
    if (hash === 'archetype') setOpenRow('archetype')
    window.setTimeout(() => {
      const el = document.getElementById(hash === 'tariff' ? 'tariff-list' : hash)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }, [])
  useEffect(() => {
    if (status !== 'ready') return
    goHash()
    window.addEventListener('hashchange', goHash)
    return () => window.removeEventListener('hashchange', goHash)
  }, [status, goHash])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const materials = isMaterials(summary?.materials) ? summary.materials : null
  const voiceParts = [
    profile?.profanity && PROFANITY_RU[profile.profanity] ? `Мат: ${PROFANITY_RU[profile.profanity]}` : '',
    profile?.intensity && INTENSITY_RU[profile.intensity] ? `Эмоции: ${INTENSITY_RU[profile.intensity]}` : '',
    profile?.author_gender ? `Пишешь о себе в ${profile.author_gender === 'male' ? 'мужском' : 'женском'} роде` : '',
  ].filter(Boolean)
  const voiceStatus = voiceParts.length ? voiceParts.join(' · ') : 'Подстраивается сам по правкам и диктовке'
  const approach = Array.isArray(profile?.approaches) && profile.approaches[0] ? String(profile.approaches[0]).replace(/\s*\(.*\)\s*/, '') : ''
  const niche = String(profile?.one_niche || (Array.isArray(profile?.niches) ? profile.niches[0] || '' : '')).trim()
  const exp = profile?.experience ? `${String(profile.experience).replace(/\s*\(.*\)\s*/, '').toLowerCase()} практики` : ''
  const practiceStatus = [approach, niche.length > 48 ? niche.slice(0, 46).trimEnd() + '…' : niche, exp].filter(Boolean).join(' · ') || 'Подход, с чем работаешь, клиент и площадки'
  const carouselStatus = [design?.mine ? `Стиль: ${design.mine.label}` : 'Стиль выбирается в первой карусели', design?.handle ? (design.handle.startsWith('@') ? design.handle : `@${design.handle}`) : ''].filter(Boolean).join(' · ')
  const sel: ArchetypeSelection | null = getArchetypeSelectionFromProfile(profile)
  const archetypeStatus = sel?.primary ? archetypeLabel(sel) : 'Тест на семь минут'

  const toggleTariffs = () => {
    setTariffsOpen(o => {
      if (!o) window.setTimeout(() => document.getElementById('tariff-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
      return !o
    })
  }

  const accountBody = (
    <div>
      {!askLogout ? (
        <button type="button" onClick={() => setAskLogout(true)} className={BTN}>Выйти</button>
      ) : (
        <div className="rounded-2xl bg-brand-soft-2 p-4">
          <p className="text-[15px] font-semibold text-brand-text">Выйти из аккаунта?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={logout} className={BTN}>Выйти</button>
            <button type="button" onClick={() => setAskLogout(false)} className="h-11 px-4 rounded-2xl text-[15px] font-semibold text-brand-text hover:bg-brand-card transition cursor-pointer">Остаться</button>
          </div>
        </div>
      )}
      {/* удаление аккаунта: компонент как был (подтверждение, причины чипами); его отступы прижаты тут */}
      <div className="[&>div]:mt-4 [&>div]:pt-3">
        <DeleteAccount />
      </div>
    </div>
  )

  return (
    <div className="max-w-[1104px] mx-auto px-4 sm:px-6 lg:px-12 pt-4 lg:pt-10">
      <h1 className="text-[26px] leading-8 lg:text-[32px] lg:leading-10 font-semibold text-brand-text">Настройки</h1>

      {status === 'loading' && (
        <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-x-10">
          <div className="h-40 rounded-[20px] bg-brand-soft-2 animate-pulse" />
          <div className="h-40 rounded-[20px] bg-brand-soft-2 animate-pulse" />
        </div>
      )}

      {status === 'error' && (
        <div className="mt-6 rounded-[20px] bg-brand-card border border-brand-border p-6 text-center">
          <p className="text-brand-text font-semibold mb-1">Не получилось загрузить настройки</p>
          <p className="text-sm text-brand-muted mb-4">Похоже, временный сбой связи. Обнови страницу.</p>
          <button onClick={() => window.location.reload()} className="btn-primary px-5 py-2.5 text-sm">Обновить</button>
        </div>
      )}

      {status === 'ready' && (
        <div className="mt-5 lg:mt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_auto_1fr] gap-4 lg:gap-x-10 items-start">
          {/* ── Тариф: телефон первым блоком, компьютер справа сверху ── */}
          <SubscriptionCard className="order-1 lg:col-start-2 lg:row-start-1"
            planCode={summary?.plan?.code} planName={summary?.plan?.name} materials={materials}
            tariffsOpen={tariffsOpen} onToggleTariffs={toggleTariffs} />

          {/* ── Витрина тарифов: под блоком тарифа на телефоне, во всю ширину внизу на компьютере ── */}
          {tariffsOpen && (
            <section id="tariff-list" aria-label="Тарифы" className="order-2 lg:col-span-2 lg:row-start-4 scroll-mt-20 lg:mt-6">
              <TariffSection currentCode={summary?.plan?.code} paymentsOn={summary?.paymentsOn === true} />
            </section>
          )}

          {/* ── Голос, Практика, Карусели ── */}
          <div className="order-3 lg:col-start-1 lg:row-start-1 lg:row-span-3 min-w-0">
            {desk ? (
              <div className="space-y-4">
                <Card id="voice" title="Голос" status={voiceStatus} action={<Link href="/dashboard/voice" className={BTN_SM}>Открыть</Link>}>
                  <p className="mt-2.5 text-sm leading-5 text-brand-text">Голос подстраивается сам по правкам и диктовке. Здесь можно сказать по-своему или показать свои посты.</p>
                  <SubRow title="Паспорт бренда" status="Кто ты в блоге, для кого пишешь и как звучишь. Можно скачать в PDF" action={<Link href="/dashboard/brand-passport" className={BTN_SM}>Открыть</Link>} />
                  {!newPipe && (
                    <div id="archetype" className="scroll-mt-20 mt-4 pt-4 border-t border-brand-border">
                      <ArchetypeBlock profile={profile} sel={sel} onTest={() => router.push('/onboarding/archetype')} />
                    </div>
                  )}
                </Card>
                <Card title="Практика" status={practiceStatus} action={<Link href="/dashboard/edit-profile" className={BTN_SM}>Изменить</Link>} />
                <Card id="carousel" title="Оформление каруселей" status={carouselStatus}
                  action={<button type="button" onClick={() => setAllStyles(v => !v)} aria-expanded={allStyles} aria-controls="carousel-more" className={BTN_SM}>{allStyles ? 'Свернуть' : 'Все стили'}</button>}>
                  <StyleMinis mine={design?.mine || null} all={allStyles} />
                  {allStyles && <div id="carousel-more" className="mt-5"><MyCarouselDesign /></div>}
                </Card>
              </div>
            ) : (
              <>
                <div className="rounded-[20px] bg-brand-card border border-brand-border px-4 divide-y divide-brand-border">
                  <RowLink id="voice" href="/dashboard/voice" title="Голос" status={voiceStatus} />
                  <RowLink href="/dashboard/edit-profile" title="Практика" status={practiceStatus} />
                  <RowToggle id="carousel" title="Оформление каруселей" status={carouselStatus} open={openRow === 'carousel'} onToggle={() => setOpenRow(r => (r === 'carousel' ? null : 'carousel'))}>
                    <MyCarouselDesign />
                  </RowToggle>
                  <RowLink href="/dashboard/brand-passport" title="Паспорт бренда" status="Кто ты в блоге, на одной странице, в PDF" />
                  {!newPipe && (
                    <RowToggle id="archetype" title="Архетип" status={archetypeStatus} open={openRow === 'archetype'} onToggle={() => setOpenRow(r => (r === 'archetype' ? null : 'archetype'))}>
                      <ArchetypeBlock profile={profile} sel={sel} onTest={() => router.push('/onboarding/archetype')} />
                    </RowToggle>
                  )}
                  <RowToggle id="account" title="Аккаунт" status={email ? `${email} · выйти, удалить` : 'Выйти, удалить'} open={openRow === 'account'} onToggle={() => setOpenRow(r => (r === 'account' ? null : 'account'))}>
                    {accountBody}
                  </RowToggle>
                </div>
                <HelpCard className="mt-4" />
                <AddToHome className="mt-4" />
              </>
            )}
          </div>

          {/* ── Аккаунт (компьютер справа под тарифом) ── */}
          {desk && (
            <Card id="account" title="Аккаунт" status={email} className="order-4 lg:col-start-2 lg:row-start-2">
              <div className="mt-3.5">{accountBody}</div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

const BTN = 'h-11 px-4 inline-flex items-center justify-center rounded-2xl border-[1.5px] border-brand-accent text-brand-accent text-[15px] font-semibold bg-brand-card hover:bg-brand-soft-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'
const BTN_SM = 'shrink-0 h-10 px-4 inline-flex items-center justify-center rounded-[14px] border-[1.5px] border-brand-accent text-brand-accent text-sm font-semibold bg-brand-card hover:bg-brand-soft-2 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'

function Card({ id, title, status, action, children, className = '' }: { id?: string; title: string; status?: string; action?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-label={title} className={`scroll-mt-20 rounded-[20px] bg-brand-card border border-brand-border px-6 py-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-brand-text">{title}</h2>
          {status && <p className="mt-0.5 text-sm leading-5 text-brand-muted break-words">{status}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function SubRow({ title, status, action }: { title: string; status: string; action: React.ReactNode }) {
  return (
    <div className="mt-4 pt-4 border-t border-brand-border flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-brand-text">{title}</h3>
        <p className="mt-0.5 text-sm leading-5 text-brand-muted">{status}</p>
      </div>
      {action}
    </div>
  )
}

function RowLink({ id, href, title, status }: { id?: string; href: string; title: string; status: string }) {
  return (
    <Link id={id} href={href} className="scroll-mt-20 flex items-center gap-3 min-h-16 py-3.5 focus-visible:outline-2 focus-visible:outline-brand-accent rounded-lg">
      <span className="flex-1 min-w-0">
        <span className="block text-base font-medium text-brand-text">{title}</span>
        <span className="block mt-0.5 text-[13px] leading-[18px] text-brand-muted truncate">{status}</span>
      </span>
      <ChevronRight className="w-5 h-5 text-brand-muted shrink-0" aria-hidden />
    </Link>
  )
}

function RowToggle({ id, title, status, open, onToggle, children }: { id: string; title: string; status: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`${id}-panel`}
        className="w-full flex items-center gap-3 min-h-16 py-3.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-accent rounded-lg">
        <span className="flex-1 min-w-0">
          <span className="block text-base font-medium text-brand-text">{title}</span>
          <span className="block mt-0.5 text-[13px] leading-[18px] text-brand-muted truncate">{status}</span>
        </span>
        <ChevronDown className={`w-5 h-5 text-brand-muted shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div id={`${id}-panel`} className="pb-4">{children}</div>}
    </div>
  )
}

// Мини-обложки стилей (A8): свой стиль первым и в рамке, дальше спокойные без узоров. «Все стили» показывает все 14.
// Картинки рисует /api/carousel/preview (decor=none, без разводов), грузятся лениво.
function StyleMinis({ mine, all }: { mine: Design['mine']; all: boolean }) {
  const base = all ? TEMPLATE_STYLES : CALM_STYLES
  const list = mine ? [mine.style, ...base.filter(s => s !== mine.style)].slice(0, all ? undefined : 4) : base
  const src = (s: TemplateStyle) => `/api/carousel/preview?style=${s}&total=7&decor=none&cover=${encodeURIComponent(MINI_COVER)}${mine?.style === s ? '&mine=1' : ''}`
  return (
    <div className="mt-3.5">
      <ul className="flex flex-wrap gap-3">
        {list.map(s => (
          <li key={s} className="w-[72px] text-center">
            <img src={src(s)} alt="" loading="lazy" width={72} height={96}
              className={`w-[72px] h-[96px] rounded-lg object-cover bg-brand-bg ${mine?.style === s ? 'ring-2 ring-brand-accent' : 'border border-brand-border'}`} />
            <span className="block mt-1.5 text-[13px] leading-[18px] font-medium text-brand-text truncate">{STYLES[s].label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-[18px] text-brand-muted">Стиль выбирается в карусели, кнопкой «Сохранить оформление» он станет основным.</p>
    </div>
  )
}

// Архетип (тест-распаковка): как был в Профиле, теперь внутри «Голоса». Только у старого мозга (zh6 архетип не читает).
function ArchetypeBlock({ profile, sel, onTest }: { profile: any; sel: ArchetypeSelection | null; onTest: () => void }) {
  if (!sel || !sel.primary) {
    return (
      <div>
        <h3 className="text-[15px] font-semibold text-brand-text">Архетип автора</h3>
        <p className="mt-0.5 text-sm leading-5 text-brand-muted">Тест на семь минут. Станет понятно, какой ты автор, и посты начнут звучать так, как говоришь ты.</p>
        <button type="button" onClick={onTest} className={`${BTN_SM} mt-3`}>Пройти тест</button>
      </div>
    )
  }
  const pk = sel.primary
  const accent = sel.flexible ? '#3B2A22' : ARCHETYPE_ACCENT[pk]
  const top3 = (profile?.archetype_scores?.top3 || []) as { key: keyof typeof ARCHETYPES; percent: number }[]
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: accent + '1A' }}>
          <div style={{ color: accent }}>{sel.flexible ? <FlexibleGlyph size={26} /> : <ArchetypeGlyph k={pk} size={26} />}</div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-brand-text">{archetypeLabel(sel)}</h3>
          <p className="text-sm text-brand-muted leading-5 mt-0.5">{sel.flexible ? flexibleLine(sel) : cap(ARCHETYPES[pk].gift)}</p>
        </div>
      </div>
      {top3.length > 0 && (
        <div className="mt-3 space-y-2 max-w-[420px]">
          {top3.map((t) => (
            <div key={t.key}>
              <div className="flex items-baseline justify-between mb-1"><span className="text-sm text-brand-text">{ARCHETYPES[t.key].name}</span><span className="text-xs text-brand-muted tabular-nums">{t.percent}</span></div>
              <div className="h-1.5 rounded-full bg-brand-soft overflow-hidden"><div className="h-full rounded-full" style={{ width: `${t.percent}%`, backgroundColor: ARCHETYPE_ACCENT[t.key] }} /></div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => { if (window.confirm('Пройти тест заново? Текущий архетип заменится новым результатом.')) onTest() }}
        className="mt-3 h-11 text-sm text-brand-muted hover:text-brand-text transition cursor-pointer">Пройти тест заново</button>
    </div>
  )
}
