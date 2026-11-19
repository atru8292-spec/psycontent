// zh13: проверка качества в базе (таблица zh13_kachestvo, миграция 20261119120000_zh13_kachestvo.sql). На каждый
// текст строка: формат, проблемы, начало подписи и первые слова, их доля за 7 дней по всем и у этого психолога,
// профиль ритма. Действия психолога (скопировал, поменял формат, сделал заново, отредактировал) докладываются туда же.
// Тревога: доля одинакового начала подписи за неделю больше 15% или любая проблема больше 20% (от 10 текстов за
// неделю), письмо на ALERT_TO не чаще раза в день (строка дня в zh13_trevogi, вставка первой защищает от двойного письма).
// Без миграции ничего не ломается: запись молча пропускается.
import type { SupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { errTag } from '@/lib/safe-error'
import { PROBLEMY, povtoryOborotov, type Proverka } from './proverka'
import { osnova } from './tekst'

const NEDELYA = 7 * 24 * 3600 * 1000
export const POROG_PODPISI = 0.15
export const POROG_PROBLEMY = 0.2
export const MIN_TEKSTOV = 10

type Stroka = { user_id: string; podpis_nachalo: string | null; pervye_slova: string | null; problemy: string[]; vid: string }

const dolyaSovp = (rows: Stroka[], pole: 'podpis_nachalo' | 'pervye_slova', v: string) => {
  const s = rows.filter(r => r[pole]); if (!v || !s.length) return 0
  return Math.round(s.filter(r => r[pole] === v).length / s.length * 1000) / 1000
}

type Q = { postId: string; userId: string; kod: string; vid: string; rezhim: string; opora: string; proverka: Proverka; cel?: string | null; huk?: string | null }

// строка проверки сразу, до ответа экрану: проблемы этого текста без долей за неделю
export async function vstavitKachestvo(db: SupabaseClient, o: Q): Promise<boolean> {
  try {
    const p = o.proverka
    const ins = await db.from('zh13_kachestvo').insert({
      post_id: o.postId, user_id: o.userId, format_kod: o.kod, vid: o.vid, rezhim: o.rezhim,
      podpis_nachalo: p.podpisNachalo || null, pervye_slova: p.pervyeSlova || null,
      opora: o.opora, problemy: p.problemy, detali: p.detali, ritm: p.ritm, blizost: p.blizost, cel: o.cel || null, huk: o.huk || null,
    })
    if (ins.error) { console.warn('zh13_kachestvo insert failed:', errTag(ins.error)); return false }
    return true
  } catch (e) {
    console.warn('zh13 kachestvo insert failed:', errTag(e))
    return false
  }
}

// после ответа: доли того же начала подписи и первых слов за 7 дней (по всем и у автора), повторы, тревога
export async function doschitatKachestvo(db: SupabaseClient, o: Q): Promise<void> {
  try {
    const ot = new Date(Date.now() - NEDELYA).toISOString()
    const nedelya = await db.from('zh13_kachestvo').select('post_id, user_id, podpis_nachalo, pervye_slova, problemy, vid').gte('created_at', ot).limit(5000)
    if (nedelya.error) { console.warn('zh13_kachestvo read failed:', errTag(nedelya.error)); return }
    // эта строка уже в выборке: доля «сколько из недели начинаются так же, считая этот текст»
    const vse = (nedelya.data || []) as (Stroka & { post_id: string })[]
    const svoi = vse.filter(r => r.user_id === o.userId)
    const p = o.proverka
    const dv = dolyaSovp(vse, 'podpis_nachalo', p.podpisNachalo)
    const da = dolyaSovp(svoi, 'podpis_nachalo', p.podpisNachalo)
    const pv = dolyaSovp(vse, 'pervye_slova', p.pervyeSlova)
    const pa = dolyaSovp(svoi, 'pervye_slova', p.pervyeSlova)
    const problemy = [...p.problemy]
    // повтор считаем, только когда есть с чем сравнить: от 5 текстов за неделю (у автора свои 5 для его доли)
    const hvataet = (rows: Stroka[], pole: 'podpis_nachalo' | 'pervye_slova') => rows.filter(r => r[pole]).length >= 5
    if (p.podpisNachalo && ((hvataet(vse, 'podpis_nachalo') && dv > POROG_PODPISI) || (hvataet(svoi, 'podpis_nachalo') && da > POROG_PODPISI))) problemy.push('povtor_podpisi')
    if (p.pervyeSlova && ((hvataet(vse, 'pervye_slova') && pv > POROG_PODPISI) || (hvataet(svoi, 'pervye_slova') && pa > POROG_PODPISI))) problemy.push('povtor_nachala')
    // повтор оборотов 4+ слов в текстах этого психолога за неделю (до 30 последних)
    const detali = { ...p.detali }
    const drugieId = svoi.filter(r => r.post_id !== o.postId).map(r => r.post_id).slice(0, 30)
    if (drugieId.length) {
      const [nash, drugie] = await Promise.all([
        db.from('generated_posts').select('content').eq('id', o.postId).eq('user_id', o.userId).maybeSingle(),
        db.from('generated_posts').select('content, format').in('id', drugieId).eq('user_id', o.userId),
      ])
      const t = osnova(String(nash.data?.content || ''), o.vid as any) || String(nash.data?.content || '')
      const povt = povtoryOborotov(t, (drugie.data || []).map((x: any) => String(x.content || '')))
      if (povt.length) { problemy.push('povtor_oborotov'); detali.povtorOborotov = povt.slice(0, 8) }
    }
    const u = await db.from('zh13_kachestvo').update({ dolya_podpisi_vse: dv, dolya_podpisi_avtor: da, dolya_nachala_vse: pv, dolya_nachala_avtor: pa, problemy, detali })
      .eq('post_id', o.postId).eq('user_id', o.userId)
    if (u.error) console.warn('zh13_kachestvo update failed:', errTag(u.error))
    await proveritTrevogu(db, vse.map(r => (r.post_id === o.postId ? { ...r, problemy } : r)))
  } catch (e) {
    console.warn('zh13 kachestvo failed:', errTag(e))
  }
}

// что за неделю выше порога; пусто, если текстов меньше MIN_TEKSTOV
export function vysheePoroga(rows: Stroka[]): string[] {
  if (rows.length < MIN_TEKSTOV) return []
  const out: string[] = []
  const s = rows.filter(r => r.podpis_nachalo)
  const cnt: Record<string, number> = {}
  for (const r of s) cnt[r.podpis_nachalo!] = (cnt[r.podpis_nachalo!] || 0) + 1
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]
  if (top && s.length >= MIN_TEKSTOV && top[1] / s.length > POROG_PODPISI) out.push(`Начало подписи «${top[0]}»: ${Math.round(top[1] / s.length * 100)}% подписей за неделю (порог 15%)`)
  const pr: Record<string, number> = {}
  for (const r of rows) for (const k of r.problemy || []) pr[k] = (pr[k] || 0) + 1
  for (const [k, v] of Object.entries(pr)) if (v / rows.length > POROG_PROBLEMY) out.push(`${PROBLEMY[k] || k}: ${Math.round(v / rows.length * 100)}% текстов за неделю (порог 20%)`)
  return out
}

const denSegodnya = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.ADMIN_TZ || 'Asia/Barnaul' }).format(new Date())

async function proveritTrevogu(db: SupabaseClient, rows: Stroka[]): Promise<void> {
  const chto = vysheePoroga(rows)
  if (!chto.length) return
  const to = String(process.env.ALERT_TO || '').trim()
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS
  if (!to || !host || !user || !pass) return
  // строка дня: вторая вставка за день падает на первичном ключе, второе письмо не уходит
  const den = denSegodnya()
  const ins = await db.from('zh13_trevogi').insert({ den, chto })
  if (ins.error) return
  try {
    const port = Number(process.env.SMTP_PORT || 465)
    const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })
    await t.sendMail({
      from: process.env.SMTP_FROM || 'PsyCont <noreply@psycont.ru>',
      to,
      subject: 'PsyCont: качество текстов zh13 выше порога',
      text: [`За последние 7 дней (${rows.length} текстов zh13):`, '', ...chto.map(x => `- ${x}`), '', 'Подробно: https://psycont.ru/admin/kachestvo', '', 'Письмо приходит не чаще раза в день.'].join('\n'),
    })
  } catch (e) {
    console.warn('zh13 alert mail failed:', errTag(e))
    await db.from('zh13_trevogi').delete().eq('den', den)
  }
}

export const DEYSTVIYA = ['copy', 'copy_podpis', 'format', 'zanovo', 'edit'] as const
export type Deystvie = (typeof DEYSTVIYA)[number]

// действие психолога с текстом: счетчик в deystviya (читаем и пишем, строка своя по user_id)
export async function zapisatDeystvie(db: SupabaseClient, userId: string, postId: string, d: Deystvie): Promise<boolean> {
  const r = await db.from('zh13_kachestvo').select('deystviya').eq('post_id', postId).eq('user_id', userId).maybeSingle()
  if (r.error || !r.data) return false
  const cur = (r.data.deystviya && typeof r.data.deystviya === 'object' ? r.data.deystviya : {}) as Record<string, number>
  const next = { ...cur, [d]: (Number(cur[d]) || 0) + 1 }
  const u = await db.from('zh13_kachestvo').update({ deystviya: next }).eq('post_id', postId).eq('user_id', userId)
  return !u.error
}
