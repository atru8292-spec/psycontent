// Главная psycont.ru. Тексты: components/landing/content.ts, примеры генератора: components/landing/examples.ts,
// тарифы: lib/pricing.ts (один источник с витриной в настройках). Интерактив и аналитика лендинга (land_*)
// в клиентских частях components/landing. Страница серверная: первый экран приходит готовым HTML.
import Image from 'next/image'
import LandingShell, { CtaButton, Reveal } from '@/components/landing/LandingShell'
import Header from '@/components/landing/Header'
import Demo from '@/components/landing/Demo'
import ExamplePost from '@/components/landing/ExamplePost'
import Faq from '@/components/landing/Faq'
import { HERO, PAINS, HOW, DEMO, EXAMPLE, WHY, ETHICS, PRICING, FAQ, FINAL, FOOTER, CONTACT_EMAIL, PRIVACY_URL, OFFER_URL } from '@/components/landing/content'
import { EXAMPLES, COMPARE_TOPIC, COMPARE_PSYCONT } from '@/components/landing/examples'
import { PLANS, PLAN_COMMON_LINE, MATERIAL_NOTE, formatRub, planPerks } from '@/lib/pricing'

// Год в подвале берется из даты сборки; пересобираем страницу раз в сутки, чтобы он сменился сам
export const revalidate = 86400

const WRAP = 'mx-auto w-full max-w-[1120px] px-4 md:px-8'
const SECTION = 'py-[72px] lg:py-36'
const H2 = 'text-[27px] font-bold leading-[1.15] text-brand-text lg:text-[38px]'
const TEXT = 'text-[17px] leading-[1.55] lg:text-[19px]'

// Рукописная линия шалфеем под ключевыми словами первого экрана (единственная на странице)
function Underline() {
  return (
    <svg aria-hidden viewBox="0 0 210 12" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-[10px] w-full text-brand-sage">
      <path d="M2 8 C 14 3, 28 12, 46 7 S 74 2, 96 8 S 128 4, 158 9 S 186 5, 208 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// Снимок во всю ширину рамки, лишнее уходит только снизу: бока экрана не режем
function PhoneShot({ src, alt, w, h }: { src: string; alt: string; w: number; h: number }) {
  return (
    <div className="w-[232px] rounded-[40px] border border-brand-border bg-white p-2 shadow-[0_1px_2px_rgba(59,42,34,.06)] lg:w-[300px]">
      <div className="aspect-[375/600] overflow-hidden rounded-[32px] border border-brand-border bg-brand-bg">
        <Image src={src} alt={alt} width={w} height={h} sizes="(min-width: 1024px) 284px, 216px" className="block h-auto w-full" />
      </div>
    </div>
  )
}

export default function Home() {
  const year = new Date().getFullYear()
  return (
    <LandingShell>
      <Header />
      <main>
        {/* 2. Первый экран */}
        <section className={`${WRAP} pt-6 pb-[72px] lg:grid lg:min-h-[560px] lg:grid-cols-12 lg:items-center lg:gap-8 lg:pt-16 lg:pb-28`}>
          <div className="lg:col-span-7">
            <h1 className="max-w-[640px] text-[36px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-text lg:text-[60px]">
              {HERO.title}{' '}
              <span className="relative inline-block whitespace-nowrap">{HERO.titleMark}<Underline /></span>
            </h1>
            <p className="mt-4 max-w-[640px] text-[17px] leading-[1.55] text-brand-muted lg:mt-6 lg:text-[20px]">{HERO.lead}</p>
            <div className="mt-6 flex flex-col gap-3 lg:mt-10 lg:flex-row lg:items-center lg:gap-4">
              <CtaButton place="hero" className="w-full lg:w-auto">{HERO.cta}</CtaButton>
              <p className="text-[15px] text-brand-muted">{HERO.note}</p>
            </div>
          </div>
          <div className="mt-6 flex items-end gap-4 lg:col-span-5 lg:mt-0 lg:flex-row-reverse lg:justify-self-end">
            <figure className="flex shrink-0 flex-col items-center">
              <Image src="/vera/privet.webp" alt="Вера машет рукой" width={278} height={360} priority className="h-[168px] w-auto lg:h-[300px]" />
              <figcaption className="mt-2 text-center text-[14px] text-brand-muted">{HERO.veraRole}</figcaption>
            </figure>
            <p className="relative mb-12 min-w-0 flex-1 rounded-3xl border border-brand-border-soft bg-brand-soft px-4 py-3 text-[16px] leading-[1.45] text-brand-text lg:mb-24 lg:max-w-[260px] lg:flex-none">
              {HERO.veraSays}
            </p>
          </div>
        </section>

        {/* 3. Узнаешь себя */}
        <Reveal as="section" className={SECTION}>
          <div className={`${WRAP} lg:grid lg:grid-cols-12 lg:gap-8`}>
            <h2 className={`${H2} lg:sticky lg:top-28 lg:col-span-4 lg:self-start`}>{PAINS.title}</h2>
            <ul className="mt-8 lg:col-span-8 lg:mt-0">
              {PAINS.items.map((p, i) => (
                <li key={i} className={`max-w-[640px] py-5 text-[20px] font-medium leading-[1.35] text-brand-text lg:py-7 lg:text-[24px] ${i < PAINS.items.length - 1 ? 'border-b border-brand-border' : ''}`}>{p}</li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* 4. Как это работает */}
        <Reveal as="section" className={SECTION}>
          <div className={WRAP}>
            <h2 className={H2}>{HOW.title}</h2>
            <ol className="mt-8 flex flex-col gap-16 lg:mt-12 lg:gap-24">
              {HOW.steps.map((s, i) => {
                const mirror = i === 1
                return (
                  <li key={s.title} className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-8">
                    <div className={mirror ? 'lg:col-span-5 lg:col-start-7 lg:row-start-1' : 'lg:col-span-5'}>
                      <p className="text-[15px] font-semibold text-brand-muted">Шаг {i + 1} из 3</p>
                      <h3 className="mt-2 text-[22px] font-bold leading-[1.2] text-brand-text lg:text-[28px]">{s.title}</h3>
                      <p className={`mt-3 max-w-[640px] text-brand-text ${TEXT}`}>{s.text}</p>
                      {i === 0 && <p className="mt-4 text-[15px] text-brand-muted">{HOW.step1Questions}</p>}
                      {i === 1 && (
                        <ul aria-label="Форматы" className="mt-4 flex flex-wrap gap-2">
                          {HOW.step2Formats.map(f => (
                            <li key={f.label} className={`flex h-9 items-center rounded-full px-3 text-[15px] text-brand-text ${f.on ? 'border-[1.5px] border-brand-text/70 bg-brand-soft font-semibold' : 'border border-brand-border'}`}>{f.label}</li>
                          ))}
                        </ul>
                      )}
                      {i === 2 && (
                        <div className="mt-4">
                          <p className="text-[15px] text-brand-muted">{HOW.step3Note}</p>
                          <a href="#demo" className="mt-2 inline-flex h-11 items-center rounded-lg font-semibold text-brand-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-accent">{HOW.step3Link}</a>
                        </div>
                      )}
                    </div>
                    <div className={`mt-8 flex justify-center lg:mt-0 ${mirror ? 'lg:col-span-4 lg:col-start-2 lg:row-start-1' : 'lg:col-span-4 lg:col-start-8'}`}>
                      <PhoneShot src={s.shot} alt={s.alt} w={s.w} h={s.h} />
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </Reveal>

        {/* 5. Демо */}
        <Reveal as="section" className={`${SECTION} scroll-mt-16`}>
          <div id="demo" className={`${WRAP} scroll-mt-20`}>
            <div className="mx-auto flex max-w-[880px] items-end justify-between gap-4">
              <div>
                <h2 className={H2}>{DEMO.title}</h2>
                <p className={`mt-3 max-w-[640px] text-brand-muted ${TEXT}`}>{DEMO.lead}</p>
              </div>
              <Image src="/vera/zapisyvaet.webp" alt="Вера записывает мысль" width={110} height={150} className="h-[150px] w-auto shrink-0 lg:hidden" />
            </div>
            <div className="mt-8 lg:mt-12"><Demo /></div>
          </div>
        </Reveal>

        {/* 6. Пример текста: акцент на бледной сирени */}
        <section className={`${SECTION} bg-brand-soft`}>
          <Reveal className={WRAP}>
            <h2 className={H2}>{EXAMPLE.title}</h2>
            <p className={`mt-3 max-w-[640px] text-brand-text ${TEXT}`}>{EXAMPLE.lead}</p>
            <p className="mt-2 text-[15px] text-brand-muted">{EXAMPLE.caption}</p>
            <div className="mt-8 grid gap-6 lg:mt-12 lg:grid-cols-2 lg:items-start lg:gap-8">
              {EXAMPLES.map((e, i) => <ExamplePost key={e.id} kind={e.kind} text={e.text} className={i === 1 ? 'lg:mt-16' : ''} />)}
            </div>
          </Reveal>
        </section>

        {/* 7. Почему звучит как ты */}
        <Reveal as="section" className={SECTION}>
          <div className={WRAP}>
            <div className="lg:grid lg:grid-cols-12 lg:gap-8">
              <h2 className={`${H2} lg:col-span-5`}>{WHY.title}</h2>
              <ul className="mt-8 lg:col-span-7 lg:mt-0">
                {WHY.points.map((p, i) => (
                  <li key={p.title} className={`max-w-[640px] ${i ? 'mt-5 border-t border-brand-border pt-5' : ''}`}>
                    <h3 className="text-[18px] font-semibold text-brand-text lg:text-[20px]">{p.title}</h3>
                    <p className={`mt-1 text-brand-muted ${TEXT}`}>{p.text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <p className={`mt-12 max-w-[640px] font-semibold text-brand-text lg:mt-16 ${TEXT}`}>{WHY.compareLead}</p>
            <p className="mt-1 text-[15px] text-brand-muted">Тема: {COMPARE_TOPIC}</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
              <figure className="rounded-3xl border border-brand-border p-6 lg:p-8">
                <figcaption className="inline-flex h-8 items-center rounded-full border border-brand-border px-3 text-[14px] text-brand-muted">{WHY.aiLabel}</figcaption>
                <p className="mt-4 text-[17px] leading-[1.55] text-brand-text">{WHY.aiText}</p>
              </figure>
              <figure className="rounded-3xl border border-brand-border bg-brand-card p-6 shadow-[0_1px_2px_rgba(59,42,34,.06)] lg:p-8">
                <figcaption className="inline-flex h-8 items-center rounded-full bg-brand-soft px-3 text-[14px] text-brand-text">{WHY.oursLabel}</figcaption>
                <p className="mt-4 whitespace-pre-line text-[17px] leading-[1.55] text-brand-text">{COMPARE_PSYCONT}</p>
              </figure>
            </div>
            <p className="mt-4 max-w-[640px] text-[15px] text-brand-muted">{WHY.compareNote}</p>
          </div>
        </Reveal>

        {/* 8. Этика */}
        <Reveal as="section" className={SECTION}>
          <div className={`${WRAP} lg:grid lg:grid-cols-12 lg:gap-8`}>
            <h2 className={`${H2} lg:col-span-4`}>{ETHICS.title}</h2>
            <ul className="mt-8 grid gap-5 lg:col-span-8 lg:mt-0 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-8">
              {ETHICS.items.map(it => (
                <li key={it.title} className="border-t border-brand-border pt-5">
                  <h3 className="text-[18px] font-semibold text-brand-text">{it.title}</h3>
                  <p className="mt-1 text-[17px] leading-[1.55] text-brand-muted">{it.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* 9. Тарифы из lib/pricing.ts */}
        <Reveal as="section" className={SECTION}>
          <div id="pricing" className={`${WRAP} scroll-mt-20`}>
            <h2 className={H2}>{PRICING.title}</h2>
            <p className={`mt-3 max-w-[640px] text-brand-muted ${TEXT}`}>{PRICING.lead}</p>
            <div className="mt-8 grid gap-4 lg:mt-12 lg:grid-cols-3 lg:gap-6">
              {PLANS.map(p => (
                <div key={p.id} className="flex flex-col rounded-3xl border border-brand-border bg-brand-card p-6 shadow-[0_1px_2px_rgba(59,42,34,.06)] lg:p-8">
                  <h3 className="text-[18px] font-semibold text-brand-text">{p.name}</h3>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="text-[40px] font-bold leading-none text-brand-text">{formatRub(p.price)}</span>
                    {p.perMonth && <span className="text-[17px] text-brand-muted">{PRICING.perMonth}</span>}
                  </p>
                  <p className="mt-3 text-[17px] leading-[1.45] text-brand-muted">{p.who}</p>
                  <ul className="mt-5 mb-6">
                    {planPerks(p).map(perk => <li key={perk} className="border-t border-brand-border py-3 text-[17px] text-brand-text">{perk}</li>)}
                  </ul>
                  <div className="mt-auto">
                    {p.price > 0 && <p className="mb-2 text-[14px] text-brand-muted">{PRICING.soon}</p>}
                    <CtaButton place="pricing" plan={p.track} variant={p.price > 0 ? 'secondary' : 'primary'} className="w-full">
                      {p.price > 0 ? PRICING.ctaPaid : PRICING.ctaFree}
                    </CtaButton>
                  </div>
                </div>
              ))}
            </div>
            <p className={`mt-8 max-w-[640px] text-brand-text ${TEXT}`}>{PLAN_COMMON_LINE}</p>
            <p className="mt-3 max-w-[640px] text-[15px] text-brand-muted">{MATERIAL_NOTE}</p>
          </div>
        </Reveal>

        {/* 10. Вопросы */}
        <Reveal as="section" className={SECTION}>
          <div className={`${WRAP} lg:grid lg:grid-cols-12 lg:gap-8`}>
            <h2 className={`${H2} lg:col-span-4`}>{FAQ.title}</h2>
            <div className="mt-6 max-w-[800px] lg:col-span-8 lg:mt-0"><Faq /></div>
          </div>
        </Reveal>

        {/* 11. Финал: акцент на бледной сирени */}
        <section className="bg-brand-soft py-[72px] lg:py-32">
          <Reveal className={`${WRAP} lg:grid lg:grid-cols-12 lg:items-center lg:gap-8`}>
            <Image src="/vera/raduetsya.webp" alt="Вера радуется" width={299} height={360} className="h-[160px] w-auto lg:order-2 lg:col-span-5 lg:h-[300px] lg:justify-self-center" />
            <div className="mt-6 lg:order-1 lg:col-span-7 lg:mt-0">
              <h2 className={H2}>{FINAL.title}</h2>
              <p className={`mt-3 max-w-[640px] text-brand-text ${TEXT}`}>{FINAL.lead}</p>
              <CtaButton place="final" className="mt-6 w-full lg:mt-8 lg:w-auto">{FINAL.cta}</CtaButton>
              <p className="mt-3 text-[15px] text-brand-muted">{FINAL.note}</p>
            </div>
          </Reveal>
        </section>
      </main>

      {/* 12. Подвал на шоколаде */}
      <footer className="bg-brand-text py-12 text-brand-bg lg:py-16">
        <div className={`${WRAP} flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between`}>
          <div>
            <Image src="/brand/psycont-wordmark-light.svg" alt="PsyCont" width={131} height={40} className="h-10 w-auto" />
            <p className="mt-3 text-[15px] text-[#D9CFC0]">{FOOTER.slogan}</p>
          </div>
          <div className="flex flex-col gap-2 text-[15px] lg:items-end">
            {CONTACT_EMAIL && <p className="text-[#D9CFC0]">{FOOTER.mailLabel} <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-bg underline-offset-4 hover:underline">{CONTACT_EMAIL}</a></p>}
            {(PRIVACY_URL || OFFER_URL) && (
              <p className="flex flex-wrap gap-x-4">
                {PRIVACY_URL && <a href={PRIVACY_URL} className="text-[#D9CFC0] underline-offset-4 hover:underline">{FOOTER.privacy}</a>}
                {OFFER_URL && <a href={OFFER_URL} className="text-[#D9CFC0] underline-offset-4 hover:underline">{FOOTER.offer}</a>}
              </p>
            )}
            <p className="text-[14px] text-[#BFB4A5]">© {year} PsyCont</p>
          </div>
        </div>
      </footer>
    </LandingShell>
  )
}
