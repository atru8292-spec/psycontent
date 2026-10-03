// События, из которых сервис учится голосу психолога (08-GOLOS-I-OBUCHENIE.md).
// Клиент сообщает, что произошло; сервер сам решает, что это значит, и пишет в voice_events.
import { NextRequest, NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'
import { recordEvent, classifyCopy, changeRatio, maybeRebuildVoice } from '@/lib/generation/learning'

const NOT_LIKE_REASONS = ['слишком умно', 'слишком сладко', 'не мои слова', 'длинно', 'не та тема']
const str = (v: unknown, n = 8000) => (typeof v === 'string' ? v.slice(0, n) : '')

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  const postId = typeof body?.postId === 'string' ? body.postId : null

  // postId, если есть, должен быть постом этого психолога
  if (postId) {
    const own = await db.from('generated_posts').select('id').eq('id', postId).eq('user_id', user.id).maybeSingle()
    if (!own.data) return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })
  }

  let rebuild = false
  switch (body?.action) {
    case 'copy': {
      // Скопировала: без правок, только заполнила [добавь], или правила
      const generated = str(body.generated), copied = str(body.copied)
      if (!generated || !copied) break
      const kind = classifyCopy(generated, copied)
      if (kind === 'edit') {
        await recordEvent(db, user.id, { kind: 'edit_pair', postId, before: generated, after: copied, data: { change_ratio: changeRatio(generated, copied) } })
        if (postId) await db.from('generated_posts').update({ content: copied }).eq('id', postId).eq('user_id', user.id)
        rebuild = true
      } else {
        await recordEvent(db, user.id, { kind: 'copied_clean', postId, data: { placeholders: kind === 'placeholders_only' } })
      }
      break
    }
    case 'mine':
    case 'not_like': {
      const reasons = Array.isArray(body.reasons) ? body.reasons.filter((r: unknown) => typeof r === 'string' && NOT_LIKE_REASONS.includes(r)) : []
      const note = str(body.note, 300).trim()
      const all = note ? [...reasons, note] : reasons
      await recordEvent(db, user.id, { kind: body.action, postId, data: { reasons: all } })
      if (postId) await db.from('generated_posts').update({ feedback: { verdict: body.action, reasons: all } }).eq('id', postId).eq('user_id', user.id)
      break
    }
    case 'hook_pick':
      await recordEvent(db, user.id, { kind: 'hook_pick', postId, before: str(body.before, 400), after: str(body.after, 400), data: { hook_type: str(body.hookType, 40) } })
      break
    case 'rephrase': {
      const before = str(body.before, 400).trim(), after = str(body.after, 1000).trim()
      if (before && after && before !== after) {
        await recordEvent(db, user.id, { kind: 'rephrase', postId, before, after })
        rebuild = true
      }
      break
    }
    case 'repeat_phrases': {
      const text = str(body.text, 600).trim()
      if (text) { await recordEvent(db, user.id, { kind: 'repeat_phrases', after: text }); rebuild = true }
      break
    }
    case 'speech': {
      // Объяснение своими словами на экране голоса (надиктованное уже записано при расшифровке)
      const text = str(body.text, 6000).trim()
      if (text.length >= 60) { await recordEvent(db, user.id, { kind: 'speech', after: text, data: { typed: body.typed === true } }); rebuild = true }
      break
    }
    default:
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  }

  if (rebuild) {
    after(async () => {
      try { await maybeRebuildVoice(db, user.id) } catch (e: any) { console.warn('voice rebuild:', e?.message) }
    })
  }
  return NextResponse.json({ ok: true })
}
