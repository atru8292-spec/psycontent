'use client'

// Блоки анкеты 2 (19.11): «с чем работаешь» (группы с темами), «кто приходит» и выбор чипами с «Еще» и своим вариантом. Общие для экспресс-анкеты
// (app/onboarding/express) и правки профиля (app/dashboard/edit-profile), чтобы в обоих местах было одно и то же.
// Стиль чипов как в нынешней анкете. Размеры под 375×667; на длинном списке групп кнопка «Дальше» прилипает к низу.

import { useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { GRUPPY, KTO, POL_KOROTKO, vybratGruppu, vybratTemu, type Klienty } from '@/lib/anketa'

export function chipCls(on: boolean, dim = false, size: 'sm' | 'md' = 'md') {
  const s = size === 'sm' ? 'min-h-[34px] px-2.5 text-[14px]' : 'min-h-[34px] px-3 py-1.5 text-[14px] leading-[18px]'
  return `${s} inline-flex items-center gap-1.5 rounded-full text-left cursor-pointer transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text bg-brand-card'} ${dim ? 'opacity-50' : ''}`
}

const toggle = (arr: string[], x: string) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x])

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 mb-1 text-[14px] leading-[18px] font-semibold text-brand-text">{children}</p>
}

// Шаг «С чем работаешь»: группы списком карточек. Тап по карточке отмечает группу и все ее темы, стрелка
// раскрывает темы чипами (снять или вернуть галочку). По умолчанию все свернуто. Своя тема внизу, необязательна.
export function SChemRabotaesh({ groups, topics, onChange, own, onOwn }: {
  groups: string[]; topics: string[]; onChange: (v: { groups: string[]; topics: string[] }) => void
  own: string; onOwn: (v: string) => void
}) {
  const [open, setOpen] = useState<string[]>([])
  return (
    <div>
      <ul className="flex flex-col gap-1.5" aria-label="С чем работаешь">
        {GRUPPY.map(g => {
          const on = groups.includes(g.kod)
          const vse = g.temy.map(t => t.tema)
          const n = vse.filter(t => topics.includes(t)).length
          const raskryta = open.includes(g.kod)
          return (
            <li key={g.kod} className={`rounded-2xl transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent' : 'border border-brand-border bg-brand-card'}`}>
              <div className="flex items-stretch">
                <button type="button" aria-pressed={on} onClick={() => onChange(vybratGruppu(groups, topics, g.kod))}
                  className="flex-1 min-w-0 min-h-[50px] pl-2.5 pr-1 py-1.5 flex items-center gap-2.5 text-left cursor-pointer">
                  <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${on ? 'bg-brand-accent' : 'border-[1.5px] border-brand-border bg-brand-card'}`}>
                    {on && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-5 font-semibold text-brand-text">{g.imya}</span>
                    <span className="block text-[13px] leading-[17px] text-brand-muted truncate">{on ? `выбрано ${n} из ${vse.length}` : g.podskazka}</span>
                  </span>
                </button>
                <button type="button" aria-expanded={raskryta} aria-label={`${raskryta ? 'Свернуть' : 'Раскрыть'} темы: ${g.imya}`}
                  onClick={() => setOpen(raskryta ? open.filter(k => k !== g.kod) : [...open, g.kod])}
                  className="w-11 shrink-0 flex items-center justify-center rounded-r-2xl text-brand-muted cursor-pointer">
                  <ChevronDown className={`w-5 h-5 transition-transform ${raskryta ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {raskryta && (
                <div className="px-2.5 pb-2.5 flex flex-wrap gap-1.5">
                  {vse.map(t => {
                    const v = topics.includes(t)
                    return (
                      <button key={t} type="button" aria-pressed={v} onClick={() => onChange(vybratTemu(groups, topics, t))} className={chipCls(v, false, 'sm')}>
                        {v ? <Check className="w-4 h-4 shrink-0 text-brand-accent" /> : <Plus className="w-4 h-4 shrink-0 text-brand-muted" />}<span className="min-w-0">{t}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <input value={own} onChange={e => onOwn(e.target.value)} aria-label="Своя тема" placeholder="Своя тема, если нет в списке" maxLength={120}
        className="mt-2 h-12 w-full rounded-2xl bg-brand-card border-[1.5px] border-brand-border px-4 text-[16px] text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-[3px] focus:ring-brand-soft" />
    </div>
  )
}

// Шаг «Кто к тебе приходит»: возраст, пол и формат мелкими чипами, все необязательно
export function KtoPrihodit({ value, onChange }: { value: Klienty; onChange: (v: Klienty) => void }) {
  return (
    <div>
      <Label>Возраст</Label>
      <div className="flex flex-wrap gap-1.5">
        {KTO.vozrast.map(x => (
          <button key={x} type="button" aria-pressed={value.age.includes(x)} onClick={() => onChange({ ...value, age: toggle(value.age, x) })} className={chipCls(value.age.includes(x), false, 'sm')}>{x}</button>
        ))}
      </div>
      <Label>Пол</Label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Пол">
        {KTO.pol.map(x => (
          <button key={x} type="button" role="radio" aria-checked={value.gender === x} onClick={() => onChange({ ...value, gender: value.gender === x ? null : x })} className={chipCls(value.gender === x, false, 'sm')}>{POL_KOROTKO[x] || x}</button>
        ))}
      </div>
      <Label>Формат</Label>
      <div className="flex flex-wrap gap-1.5">
        {KTO.format.map(x => (
          <button key={x} type="button" aria-pressed={value.format.includes(x)} onClick={() => onChange({ ...value, format: toggle(value.format, x) })} className={chipCls(value.format.includes(x), false, 'sm')}>{x}</button>
        ))}
      </div>
    </div>
  )
}

// Чипы на выбор: первые `first` видны сразу, остальные под «Еще» (раскрыто сразу, если выбран кто-то из скрытых).
// max: сколько можно отметить вместе со своим вариантом; onLimit зовется при попытке отметить сверх.
export function PickChips({ options, selected, onChange, max, first = 8, onLimit, own, onOwn, ownPlaceholder, ownLabel }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; max?: number; first?: number; onLimit?: () => void
  own: string; onOwn: (v: string) => void; ownPlaceholder: string; ownLabel: string
}) {
  const hiddenPicked = selected.some(x => options.indexOf(x) >= first)
  const [all, setAll] = useState(hiddenPicked)
  const shown = all || hiddenPicked ? options : options.slice(0, first)
  const count = selected.length + (own.trim() ? 1 : 0)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(x => {
          const on = selected.includes(x)
          const full = !on && !!max && count >= max
          return (
            <button key={x} type="button" aria-pressed={on} onClick={() => { if (full) { onLimit?.(); return } onChange(toggle(selected, x)) }} className={chipCls(on, full)}>
              {on ? <Check className="w-4 h-4 shrink-0 text-brand-accent" /> : <Plus className="w-4 h-4 shrink-0 text-brand-muted" />}<span className="min-w-0">{x}</span>
            </button>
          )
        })}
        {!all && !hiddenPicked && options.length > first && (
          <button type="button" aria-expanded={false} onClick={() => setAll(true)} className={chipCls(false)}>Еще {options.length - first}</button>
        )}
      </div>
      <input value={own} onChange={e => onOwn(e.target.value)} aria-label={ownLabel} placeholder={ownPlaceholder} maxLength={120}
        className="mt-2 h-12 w-full rounded-2xl bg-brand-card border-[1.5px] border-brand-border px-4 text-[16px] text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-accent focus:ring-[3px] focus:ring-brand-soft" />
    </div>
  )
}
