'use client'

// Данные «стола» на «Написать» (вариант А, макеты A1, A3, A5, A9): тема на сегодня, план тем на ближайшие дни,
// ритм месяца и тексты, которые еще не в блоге. Все читается клиентом Supabase, только свои строки (RLS по user_id
// плюс явный .eq('user_id')). Тексты постов в аналитику не уходят, тут только показ.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { topicsFor } from '@/lib/first-topic'
import { NOT_MATERIAL_FORMAT, toMakeFormat, planFormat, type MakeFormat } from './formats'
import type { TopicPick } from './Composer'

export const RHYTHM_GOAL = 4
const IN_WORK_DAYS = 14

// День плана тем (content_plans.plan): «день 1..30» без дат, отметка done ставится в «Темах»
export type PlanDay = { day: number; topic: string; format?: string; done?: boolean; format_kod?: string; zadacha?: string; reakciya?: string; tip?: string }
export type PlanView = { total: number; prev: PlanDay | null; today: PlanDay | null; next: PlanDay[] }
// Одна мысль в «Еще не в блоге»: строки одной группы (group_id) или одна строка без группы
export type InWorkItem = { key: string; title: string; formats: MakeFormat[]; ids: string[]; createdAt: string; firstId: string }
export type Rhythm = { written: number; inBlog: number }

const code = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v) ? v : undefined)

// Тема дня из плана в выбор «На сегодня»: формат и задача дня уходят в генерацию, как из «Тем»
export function planDayToPick(d: PlanDay): TopicPick {
  const f = planFormat(d.format)
  const fkod = code(d.format_kod)
  const rol = code(d.zadacha)
  const reakciya = code(d.reakciya)
  const sit = fkod && typeof d.tip === 'string' ? d.tip.trim().slice(0, 300) : ''
  const hasPlan = !!(fkod || rol || reakciya)
  return {
    text: d.topic,
    format: f,
    day: d.day,
    ...(hasPlan ? { plan: { formatKod: fkod, forFormat: f, rol, reakciya, ...(sit ? { situaciya: sit } : {}) } } : {}),
  }
}

export function planView(raw: unknown): PlanView | null {
  const days: PlanDay[] = (Array.isArray(raw) ? raw : [])
    .filter((x: any) => x && typeof x.topic === 'string' && typeof x.day === 'number')
    .sort((a: any, b: any) => a.day - b.day)
  if (!days.length) return null
  const todayIdx = days.findIndex(d => !d.done)
  const today = todayIdx >= 0 ? days[todayIdx] : null
  const before = todayIdx >= 0 ? days.slice(0, todayIdx) : days
  const prev = [...before].reverse().find(d => d.done) || null
  const next = todayIdx >= 0 ? days.slice(todayIdx + 1).filter(d => !d.done).slice(0, 2) : []
  return { total: days.length, prev, today, next }
}

function groupInWork(rows: any[]): InWorkItem[] {
  const map = new Map<string, InWorkItem>()
  for (const r of rows) {
    const key = r.group_id || r.id
    const f = toMakeFormat(String(r.format || 'post'))
    const cur = map.get(key)
    if (cur) {
      if (!cur.formats.includes(f)) cur.formats.push(f)
      cur.ids.push(r.id)
      continue
    }
    const title = String(r.thought || r.topic || '').replace(/\s+/g, ' ').trim() || 'Без темы'
    map.set(key, { key, title, formats: [f], ids: [r.id], createdAt: r.created_at, firstId: r.id })
  }
  return [...map.values()]
}

export function useDesk() {
  const [firstTime, setFirstTime] = useState(false)
  const [topics, setTopics] = useState<TopicPick[]>([])
  const [plan, setPlan] = useState<PlanView | null | undefined>(undefined)
  const [rhythm, setRhythm] = useState<Rhythm | null>(null)
  const [inWork, setInWork] = useState<InWorkItem[] | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let on = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !on) return
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const since = new Date(now.getTime() - IN_WORK_DAYS * 86400000).toISOString()
      const [prof, planRes, count, written, inBlog, work] = await Promise.all([
        supabase.from('onboarding_profiles').select('client_pain_phrases, one_niche, niches').eq('user_id', user.id).maybeSingle(),
        supabase.from('content_plans').select('plan').eq('user_id', user.id).maybeSingle(),
        supabase.from('generated_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('format', 'eq', NOT_MATERIAL_FORMAT),
        // ритм: написано по created_at, в блоге по published_at; хуки не текст (formats.ts isMaterialFormat)
        supabase.from('generated_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', monthStart).not('format', 'eq', NOT_MATERIAL_FORMAT),
        supabase.from('generated_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('published_at', monthStart).not('format', 'eq', NOT_MATERIAL_FORMAT),
        supabase.from('generated_posts').select('id, group_id, format, topic, created_at, thought:core->>thought').eq('user_id', user.id)
          .is('published_at', null).gte('created_at', since).not('format', 'eq', NOT_MATERIAL_FORMAT)
          .order('created_at', { ascending: false }).limit(60),
      ])
      if (!on) return
      setFirstTime(!count.error && (count.count || 0) === 0)
      const pv = planView(planRes.data?.plan)
      setPlan(planRes.error ? null : pv)
      // план это «день 1..30» без дат: ближайшие несделанные дни по порядку, дальше темы ниши (тема дня первой) и фразы клиентов
      const planDays: PlanDay[] = (Array.isArray(planRes.data?.plan) ? planRes.data!.plan : [])
        .filter((x: any) => x && !x.done && typeof x.topic === 'string' && typeof x.day === 'number')
        .sort((a: any, b: any) => a.day - b.day)
      const picks = planDays.map(planDayToPick)
      const niche = prof.data?.one_niche || (Array.isArray(prof.data?.niches) ? prof.data.niches[0] : '')
      const rest = topicsFor({ niche, pain: prof.data?.client_pain_phrases }).filter(t => !picks.some(p => p.text === t)).map(t => ({ text: t }))
      setTopics([...picks, ...rest].slice(0, 12))
      setRhythm(written.error || inBlog.error ? null : { written: written.count || 0, inBlog: inBlog.count || 0 })
      setInWork(work.error ? null : groupInWork(Array.isArray(work.data) ? work.data : []))
    })()
    return () => { on = false }
  }, [tick])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { firstTime, topics, plan, rhythm, inWork, reload }
}
