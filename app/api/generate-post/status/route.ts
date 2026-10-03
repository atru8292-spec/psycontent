// Статус фоновой проверки поста новой цепочки. Фронт опрашивает, пока status = checking,
// и подменяет текст, если правка что-то изменила.
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Нет id' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('generated_posts')
    .select('content, draft_content, pipeline_status, check_result')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })

  const status = data.pipeline_status || 'ready'
  return NextResponse.json({
    status,
    post: data.content,
    changed: status === 'ready' && !!data.draft_content && data.draft_content !== data.content,
    genericPhrase: status === 'ready' ? genericPhrase(data.check_result, String(data.content || '')) : null,
  })
}

// Самая безликая фраза поста для просьбы «скажи по-своему»: из находок проверки про голос,
// иначе из штампов. Только если она осталась в тексте после правки.
function genericPhrase(check: any, content: string): string | null {
  const checks: any[] = Array.isArray(check?.checks) ? check.checks : []
  const quotes = ['golos', 'golos_slabo', 'shtampy', 'pravki']
    .flatMap(id => checks.filter(c => c?.id === id && c?.problem).flatMap(c => (Array.isArray(c.quotes) ? c.quotes : [])))
    .map((q: unknown) => String(q || '').trim())
    .filter(q => q.length >= 12 && q.length <= 160 && content.includes(q))
  return quotes[0] || null
}
