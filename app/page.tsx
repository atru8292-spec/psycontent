// Главная psycont.ru. Тексты: components/landing/content.ts, примеры генератора: components/landing/examples.ts,
// тарифы: lib/pricing.ts (один источник с витриной в настройках). Интерактив и аналитика лендинга (land_*)
// в клиентских частях components/landing. Демо «впиши мысль» снято: после онбординга «Сделать» открывается
// с темой дня, и мысль из демо до первого поста не доходила (правка в онбординге или MakeFlow, см. отчет 04.10). Страница серверная: первый экран приходит готовым HTML.
// Вид (v2, 05.10, референсы в _знания/lending-refy): соседние блоки всегда разного фона, в каждом блоке
// один «бумажный» прием (components/landing/Paper.tsx), декор только вырезками из public/dekor, 3 предмета на страницу.
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import LandingShell, { CtaButton } from '@/components/landing/LandingShell'
import Header from '@/components/landing/Header'
import ExamplePost from '@/components/landing/ExamplePost'
import Faq from '@/components/landing/Faq'
import ClampText from '@/components/landing/ClampText'
import { Wave, HandUnderline, HandArrow, Dekor } from '@/components/landing/Paper'
import { HERO, PAINS, HOW, EXAMPLE, WHY, ETHICS, PRICING, FAQ, FINAL, FOOTER, CONTACT_EMAIL, PRIVACY_URL, OFFER_URL } from '@/components/landing/content'
import { EXAMPLES, COMPARE_TOPIC, COMPARE_PSYCONT } from '@/components/landing/examples'
import { PLANS, PLAN_COMMON_LINE, MATERIAL_NOTE, formatRub, planPerks } from '@/lib/pricing'

// Год в подвале берется из даты сборки; пересобираем страницу раз в сутки, чтобы он сменился сам
export const revalidate = 86400

const WRAP = 'mx-auto w-full max-w-[1120px] px-4 md:px-8'
const SECTION = 'py-14 lg:py-24'
const H2 = 'text-[27px] font-bold leading-[1.15] text-brand-text [text-wrap:balance] lg:text-[38px]'
const TEXT = 'text-[17px] leading-[1.55] lg:text-[19px]'

// Заметки болей: цвет, поворот и место в свободной сетке на десктопе (12 колонок, два ряда разной ширины).
// На шалфее текст не мельче 18 px (контраст 4.7), поэтому у всех заметок 18 px и выше.
const NOTES = [
  { bg: 'bg-brand-bg', rot: 'rotate-[-1.5deg]', grid: 'lg:col-span-5' },
  { bg: 'bg-brand-lilac', rot: 'rotate-[1.2deg]', grid: 'lg:col-span-4 lg:mt-10' },
  { bg: 'bg-brand-sage', rot: 'rotate-[-0.6deg]', grid: 'lg:col-span-3 lg:mt-3' },
  { bg: 'bg-brand-soft', rot: 'rotate-[2deg]', grid: 'lg:col-span-5 lg:col-start-2 lg:-mt-2' },
  { bg: 'bg-brand-bg', rot: 'rotate-[-2deg]', grid: 'lg:col-span-6 lg:mt-6' },
]

// Шаги по нарастанию тона (крем с рамкой, бледная сирень, зеленый)
const STEP_CARD = [
  'border border-brand-border bg-brand-card text-brand-text',
  'bg-brand-soft text-brand-text lg:mt-12',
  'bg-brand-accent text-brand-bg lg:mt-24',
]

// Тарифы тоже по нарастанию тона: крем, бледная сирень, белая с зеленой рамкой. Метку «популярный» не ставим, пока нет данных
const PLAN_CARD = [
  'border border-brand-border bg-brand-bg',
  'border border-brand-border-soft bg-brand-soft-2 lg:mt-6',
  'border-[1.5px] border-brand-accent bg-brand-card lg:mt-12',
]

// Снимок во всю ширину рамки, лишнее уходит только снизу: бока экрана не режем
function PhoneShot({ src, alt, w, h }: { src: string; alt: string; w: number; h: number }) {
  return (
    <div className="w-[232px] rounded-[36px] lg:w-full lg:max-w-[280px] border border-brand-border bg-brand-card p-2">
      <div className="aspect-[375/600] overflow-hidden rounded-[28px] border border-brand-border bg-brand-bg">
        <Image src={src} alt={alt} width={w} height={h} sizes="(min-width: 1024px) 264px, 216px" className="block h-auto w-full" />
      </div>
    </div>
  )
}

export default function Home() {
  const year = new Date().getFullYear()
  const [why1, ...whyRest] = WHY.points
  return (
    <LandingShell>
      <Header />
      <main className="overflow-x-clip">
        {/* 1. Первый экран, крем: одно слово с рукописным штрихом, Вера вырезкой стоит на краю блока */}
        <section className={`${WRAP} pt-6 lg:grid lg:grid-cols-12 lg:gap-8 lg:pt-16`}>
          <div className="lg:col-span-7 lg:self-center lg:pb-24">
            <h1 className="max-w-[640px] text-[36px] font-bold leading-[1.12] tracking-[-0.01em] text-brand-text [text-wrap:balance] lg:text-[60px]">
              {HERO.title}{' '}
              <span className="relative inline-block whitespace-nowrap">{HERO.titleMark}<HandUnderline /></span>
            </h1>
            <p className="mt-5 max-w-[640px] text-[17px] leading-[1.55] text-brand-muted lg:mt-7 lg:text-[20px]">{HERO.lead}</p>
            <div className="mt-6 flex flex-col gap-3 lg:mt-10 lg:flex-row lg:items-center lg:gap-4">
              <CtaButton place="hero" className="w-full lg:w-auto">{HERO.cta}</CtaButton>
              <p className="text-[15px] text-brand-muted">{HERO.note}</p>
            </div>
          </div>
          <figure className="relative z-10 mt-8 flex items-end justify-end gap-3 lg:col-span-5 lg:mt-0 lg:flex-col lg:items-end lg:gap-4">
            {/* Реплика-наклейка с хвостиком к Вере; она же подпись роли. Мобилка: слева от Веры, десктоп: над ней */}
            <figcaption className="relative mb-24 min-w-0 max-w-[260px] flex-1 rotate-[-1.5deg] rounded-2xl border border-brand-border-soft bg-brand-card px-4 py-3 text-[16px] leading-[1.45] text-brand-text lg:mr-24 lg:mb-0 lg:max-w-[290px] lg:flex-none lg:rotate-[-2deg]">
              {HERO.veraSays}
              <span aria-hidden className="absolute -right-[7px] bottom-6 h-3.5 w-3.5 rotate-45 border-t border-r border-brand-border-soft bg-brand-card lg:hidden" />
              <span aria-hidden className="absolute -bottom-[7px] right-10 hidden h-3.5 w-3.5 rotate-45 border-r border-b border-brand-border-soft bg-brand-card lg:block" />
            </figcaption>
            <Image src="/vera/privet.webp" alt="Вера машет рукой" width={278} height={360} priority
              className="-mb-4 h-[200px] w-auto shrink-0 lg:-mb-6 lg:h-[330px]" />
          </figure>
        </section>

        {/* 2. Боли на шоколаде: фразы психологов заметками в четырех цветах, на мобилке лента вбок */}
        <section className="bg-brand-text pt-14 pb-10 lg:py-24">
          <div className={WRAP}>
            <h2 className={`${H2} max-w-[560px] !text-brand-bg`}>{PAINS.title}</h2>
            <p className="mt-3 flex items-center gap-1.5 text-[15px] text-brand-on-dark lg:hidden">
              {PAINS.swipeHint}<ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.75} />
            </p>
            <ul tabIndex={0} aria-label={PAINS.title.replace(' ', ' ')}
              className="-mx-4 mt-2 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-10 pb-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-brand-on-dark lg:mx-0 lg:mt-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6 lg:gap-y-10 lg:overflow-visible lg:px-0 lg:pb-0">
              {PAINS.items.map((p, i) => {
                const n = NOTES[i % NOTES.length]
                return (
                  <li key={i} className={`relative w-[78%] max-w-[340px] shrink-0 snap-start lg:w-auto lg:max-w-none ${n.grid}`}>
                    <p className={`h-full rounded-md px-5 lg:h-auto pt-6 pb-7 text-[18px] font-medium leading-[1.4] text-brand-text lg:px-7 lg:pt-8 lg:pb-9 lg:text-[20px] ${n.bg} ${n.rot}`}>{p}</p>
                    {i === 0 && <Dekor name="knopka-derevo" className="-top-7 left-1/2 w-[40px] -translate-x-1/2 rotate-[8deg] lg:w-[46px]" />}
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* 3. Как это работает, крем: шаги по нарастанию тона, без иконок */}
        <section className={SECTION}>
          <div className={WRAP}>
            <h2 className={H2}>{HOW.title}</h2>
            <ol className="mt-8 grid gap-5 lg:mt-12 lg:grid-cols-3 lg:items-start lg:gap-6">
              {HOW.steps.map((s, i) => {
                const dark = i === 2
                return (
                  <li key={s.title} className={`rounded-[28px] p-6 lg:p-7 ${STEP_CARD[i]}`}>
                    <p aria-hidden className={`text-[56px] font-bold leading-none ${dark ? 'text-brand-lilac' : 'text-brand-text'}`}>{i + 1}</p>
                    <h3 className="mt-4 text-[22px] font-bold leading-[1.2] lg:text-[24px]"><span className="sr-only">Шаг {i + 1}. </span>{s.title}</h3>
                    <p className={`mt-3 text-[17px] leading-[1.55] ${dark ? 'text-brand-bg' : 'text-brand-text'}`}>{s.text}</p>
                    {i === 0 && <p className="mt-4 text-[15px] text-brand-muted">{HOW.step1Questions}</p>}
                    {i === 1 && (
                      <ul aria-label="Форматы" className="mt-4 flex flex-wrap gap-2">
                        {HOW.step2Formats.map(f => (
                          <li key={f.label} className={`flex h-9 items-center rounded-full px-3 text-[15px] text-brand-text ${f.on ? 'border-[1.5px] border-brand-text/70 bg-brand-card font-semibold' : 'border border-brand-border-soft'}`}>{f.label}</li>
                        ))}
                      </ul>
                    )}
                    {s.shot && <div className={`mt-6 justify-center ${i === 0 ? 'hidden lg:flex' : 'flex'}`}><PhoneShot src={s.shot} alt={s.alt} w={s.w} h={s.h} /></div>}
                    {dark && (
                      <>
                        <p className="mt-4 text-[15px] text-brand-on-dark">{HOW.step3Note}</p>
                        <figure className="mt-5 flex items-end gap-3">
                          <Image src={s.vera} alt={s.alt} width={338} height={360} className="h-[150px] w-auto" />
                          <figcaption className="mb-2 text-[14px] text-brand-on-dark">{HERO.veraRole}</figcaption>
                        </figure>
                        <CtaButton place="how" variant="light" className="mt-5 w-full">{HOW.step3Link}</CtaButton>
                      </>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* 4. Пример на бледной сирени: волна сверху и снизу, пост на зажиме, одна рукописная стрелка */}
        <section className={`relative z-10 bg-brand-soft ${SECTION}`}>
          <Wave side="top" />
          <div className={WRAP}>
            <h2 className={H2}>{EXAMPLE.title}</h2>
            <p className={`mt-3 max-w-[640px] text-brand-text ${TEXT}`}>{EXAMPLE.lead}</p>
            <div className="mt-2 flex flex-row-reverse items-start justify-end gap-2">
              <p className="text-[15px] text-brand-muted">{EXAMPLE.caption}</p>
              <HandArrow className="mt-3 h-12 w-14 shrink-0 -scale-x-100 lg:-ml-2 lg:h-16 lg:w-20" />
            </div>
            <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
              {EXAMPLES.map((e, i) => (
                <div key={e.id} className={i === 0 ? 'relative mx-2 rotate-[-1deg] pt-3 lg:mx-0 lg:rotate-[-1.5deg]' : 'lg:mt-20'}>
                  {i === 0 && <Dekor name="zazhim-sirenevyj" className="-top-5 left-1/2 z-10 w-[44px] -translate-x-1/2 lg:w-[52px]" />}
                  <ExamplePost kind={e.kind} text={e.text} />
                </div>
              ))}
            </div>
          </div>
          <Wave side="bottom" />
        </section>

        {/* 5. Почему звучит как ты, белый: один пункт крупно, два поменьше */}
        <section className={`bg-brand-card ${SECTION}`}>
          <div className={WRAP}>
            <div className="lg:grid lg:grid-cols-12 lg:gap-8">
              <h2 className={`${H2} lg:col-span-5`}>{WHY.title}</h2>
              <div className="mt-8 lg:col-span-7 lg:mt-0">
                <h3 className="text-[22px] font-bold leading-[1.25] text-brand-text lg:text-[26px]">{why1.title}</h3>
                <p className={`mt-2 max-w-[600px] text-brand-text ${TEXT}`}>{why1.text}</p>
                <ul className="mt-8 grid gap-6 border-t border-brand-border pt-6 sm:grid-cols-2 sm:gap-8">
                  {whyRest.map(p => (
                    <li key={p.title}>
                      <h3 className="text-[18px] font-semibold text-brand-text">{p.title}</h3>
                      <p className="mt-1 text-[16px] leading-[1.55] text-brand-muted">{p.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className={`mt-14 max-w-[640px] font-semibold text-brand-text lg:mt-20 ${TEXT}`}>{WHY.compareLead}</p>
            <p className="mt-1 text-[15px] text-brand-muted">Тема: {COMPARE_TOPIC}</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
              <figure className="rounded-3xl border border-brand-border p-6 lg:p-8">
                <figcaption className="inline-flex h-8 items-center rounded-full border border-brand-border px-3 text-[14px] text-brand-muted">{WHY.aiLabel}</figcaption>
                <div className="mt-4"><ClampText text={WHY.aiText} className={`text-brand-text ${TEXT}`} /></div>
              </figure>
              <figure className="rounded-3xl bg-brand-bg p-6 lg:p-8">
                <figcaption className="inline-flex h-8 items-center rounded-full bg-brand-soft px-3 text-[14px] text-brand-text">{WHY.oursLabel}</figcaption>
                <div className="mt-4"><ClampText text={COMPARE_PSYCONT} className={`text-brand-text ${TEXT}`} /></div>
              </figure>
            </div>
            <p className="mt-4 max-w-[640px] text-[15px] text-brand-muted">{WHY.compareNote}</p>
          </div>
        </section>

        {/* 6. Этика, крем: заголовок сверху, четыре пункта в ряд (не повторяет раскладку «почему» и FAQ) */}
        <section className={SECTION}>
          <div className={WRAP}>
            <h2 className={`${H2} max-w-[640px]`}>{ETHICS.title}</h2>
            <ul className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
              {ETHICS.items.map(it => (
                <li key={it.title}>
                  <h3 className="text-[19px] font-bold leading-[1.25] text-brand-text">{it.title}</h3>
                  <p className="mt-2 text-[17px] leading-[1.55] text-brand-muted">{it.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. Тарифы из lib/pricing.ts, белый фон и кремовые карточки */}
        <section className={`bg-brand-card ${SECTION}`}>
          <div id="pricing" className={`${WRAP} scroll-mt-20`}>
            <h2 className={H2}>{PRICING.title}</h2>
            <p className={`mt-3 max-w-[640px] text-brand-muted ${TEXT}`}>{PRICING.lead}</p>
            <p className="mt-3 flex items-center gap-1.5 text-[15px] text-brand-muted lg:hidden">
              {PAINS.swipeHint}<ArrowRight aria-hidden className="h-4 w-4" strokeWidth={1.75} />
            </p>
            <div tabIndex={0} role="group" aria-label={PRICING.title}
              className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-brand-accent lg:mx-0 lg:mt-12 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:overflow-visible lg:px-0">
              {PLANS.map((p, i) => (
                <div key={p.id} className={`flex w-[84%] max-w-[360px] shrink-0 snap-start flex-col rounded-3xl p-6 lg:w-auto lg:max-w-none lg:p-8 ${PLAN_CARD[i]}`}>
                  <h3 className="text-[18px] font-semibold text-brand-text">{p.name}</h3>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="text-[40px] font-bold leading-none text-brand-text">{formatRub(p.price)}</span>
                    {p.perMonth && <span className="text-[17px] text-brand-muted">{PRICING.perMonth}</span>}
                  </p>
                  <p className="mt-3 text-[17px] leading-[1.45] text-brand-muted lg:text-[18px]">{p.who}</p>
                  <ul className="mt-5 mb-6">
                    {planPerks(p).map(perk => <li key={perk} className="border-t border-brand-border py-3 text-[17px] text-brand-text lg:text-[18px]">{perk}</li>)}
                  </ul>
                  <div className="mt-auto">
                    {p.price > 0 && <p className="mb-2 text-[14px] text-brand-muted">{PRICING.soon}</p>}
                    <CtaButton place="pricing" plan={p.track} variant={p.price > 0 ? 'secondary' : 'primary'} className="w-full !px-4">
                      {p.price > 0 ? PRICING.ctaPaid : PRICING.ctaFree}
                    </CtaButton>
                  </div>
                </div>
              ))}
            </div>
            <p className={`mt-8 max-w-[640px] text-brand-text ${TEXT}`}>{PLAN_COMMON_LINE}</p>
            <p className="mt-3 max-w-[640px] text-[15px] text-brand-muted">{MATERIAL_NOTE}</p>
          </div>
        </section>

        {/* 8. Вопросы, крем */}
        <section className={SECTION}>
          <div className={`${WRAP} lg:grid lg:grid-cols-12 lg:gap-8`}>
            <h2 className={`${H2} lg:col-span-4`}>{FAQ.title}</h2>
            <div className="mt-6 max-w-[800px] lg:col-span-8 lg:mt-0"><Faq /></div>
          </div>
        </section>

        {/* 9. Финал на бледной сирени: волна сверху, Вера в другой позе с бантом */}
        <section className="relative z-10 bg-brand-soft pt-14 pb-12 lg:pt-20 lg:pb-16">
          <Wave side="top" />
          <div className={`${WRAP} lg:grid lg:grid-cols-12 lg:items-center lg:gap-8`}>
            <figure className="relative mx-auto flex w-fit flex-col items-center lg:mx-0 lg:order-2 lg:col-span-5 lg:justify-self-center">
              <Image src="/vera/raduetsya.webp" alt="Вера радуется" width={299} height={360} className="h-[170px] w-auto lg:h-[300px]" />
              <Dekor name="bant-zelenyj-atlas" className="top-[4%] left-[14%] w-[48px] rotate-[-24deg] lg:w-[64px]" />
              <figcaption className="mt-2 text-[14px] text-brand-muted">{HERO.veraRole}</figcaption>
            </figure>
            <div className="mt-6 lg:order-1 lg:col-span-7 lg:mt-0">
              <h2 className={H2}>{FINAL.title}</h2>
              <p className={`mt-3 max-w-[640px] text-brand-text ${TEXT}`}>{FINAL.lead}</p>
              <CtaButton place="final" className="mt-6 w-full lg:mt-8 lg:w-auto">{FINAL.cta}</CtaButton>
              <p className="mt-3 text-[15px] text-brand-muted">{FINAL.note}</p>
            </div>
          </div>
        </section>
      </main>

      {/* Подвал на шоколаде */}
      <footer className="bg-brand-text py-12 text-brand-bg lg:py-16">
        <div className={`${WRAP} flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between`}>
          <div>
            <Image src="/brand/psycont-wordmark-light.svg" alt="PsyCont" width={131} height={40} className="h-10 w-auto" />
            <p className="mt-3 text-[15px] text-brand-on-dark">{FOOTER.slogan}</p>
          </div>
          <div className="flex flex-col gap-2 text-[15px] lg:items-end">
            {CONTACT_EMAIL && <p className="text-brand-on-dark">{FOOTER.mailLabel} <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-bg underline underline-offset-4">{CONTACT_EMAIL}</a></p>}
            {(PRIVACY_URL || OFFER_URL) && (
              <p className="flex flex-wrap gap-x-4">
                {PRIVACY_URL && <a href={PRIVACY_URL} className="text-brand-on-dark underline-offset-4 hover:underline">{FOOTER.privacy}</a>}
                {OFFER_URL && <a href={OFFER_URL} className="text-brand-on-dark underline-offset-4 hover:underline">{FOOTER.offer}</a>}
              </p>
            )}
            <p className="text-[14px] text-brand-on-dark-muted">© {year} PsyCont</p>
          </div>
        </div>
      </footer>
    </LandingShell>
  )
}
