'use client'

// Блоки анкеты 2 (19.11): «кто приходит» и выбор чипами с «Еще» и своим вариантом. Общие для экспресс-анкеты
// (app/onboarding/express) и правки профиля (app/dashboard/edit-profile), чтобы в обоих местах было одно и то же.
// Стиль чипов как в нынешней анкете. Размеры подобраны под 375×667: шаг целиком с кнопкой «Дальше» без прокрутки.

import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { GRUPPY, KTO, KOROTKO, POL_KOROTKO, type Klienty } from '@/lib/anketa'

export function chipCls(on: boolean, dim = false, size: 'sm' | 'md' = 'md') {
  const s = size === 'sm' ? 'min-h-[34px] px-2.5 text-[14px]' : 'min-h-[34px] px-3 py-[5px] text-[14px] leading-[18px]'
  return `${s} inline-flex items-center gap-1.5 rounded-full text-left cursor-pointer transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent text-brand-text font-semibold' : 'border border-brand-border text-brand-text bg-brand-card'} ${dim ? 'opacity-50' : ''}`
}

const toggle = (arr: string[], x: string) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x])

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 mb-1 text-[14px] leading-[18px] font-semibold text-brand-text">{children}</p>
}

// Шаг «Кто к тебе приходит»: направления карточками в две колонки (обязательно хотя бы одно), под ними
// возраст, пол и формат мелкими чипами (необязательно)
export function KtoPrihodit({ value, onChange }: { value: Klienty; onChange: (v: Klienty) => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Направления">
        {GRUPPY.map(g => {
          const on = value.groups.includes(g.kod)
          return (
            <button key={g.kod} type="button" aria-pressed={on} onClick={() => onChange({ ...value, groups: toggle(value.groups, g.kod) })}
              className={`min-h-[50px] rounded-2xl px-2.5 py-1.5 text-left cursor-pointer transition ${on ? 'bg-brand-soft border-[1.5px] border-brand-accent' : 'border border-brand-border bg-brand-card'}`}>
              <span className="block text-[14.5px] leading-5 font-semibold text-brand-text">{g.imya}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-brand-muted">
                <span className="min-w-0 truncate">{KOROTKO[g.kod] || g.podskazka}</span>
                {on && <Check aria-hidden="true" className="ml-auto w-3.5 h-3.5 shrink-0 text-brand-accent" />}
              </span>
            </button>
          )
        })}
      </div>
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
