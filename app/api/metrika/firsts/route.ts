// Для целей Яндекс Метрики «первый раз» (lib/metrika.ts goalFirst): было ли у человека это действие раньше.
// Только чтение своих данных, ответ только true/false, без текстов и чисел. Ошибка чтения = 500, клиент тогда
// цель не шлет (лучше потерять цель, чем отправить ее повторно).
// make: запускала создание (событие make_start); material: есть готовый материал (generated_posts);
// copy: брала текст (material_take, published_at или экспорт карусели считаются в аналитике отдельно, тут только копирование).
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/generation/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const db = getSupabaseAdmin()
    const [make, material, copy] = await Promise.all([
      db.from('events').select('id').eq('user_id', user.id).eq('event', 'make_start').limit(1),
      db.from('generated_posts').select('id').eq('user_id', user.id).limit(1),
      db.from('events').select('id').eq('user_id', user.id).eq('event', 'material_take').like('props->>how', 'copy%').limit(1),
    ])
    if (make.error || material.error || copy.error) return NextResponse.json({ error: 'read' }, { status: 500 })
    return NextResponse.json({ make: !!make.data?.length, material: !!material.data?.length, copy: !!copy.data?.length },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'read' }, { status: 500 })
  }
}
