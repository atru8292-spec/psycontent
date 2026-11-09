// zh6-prod: страница предпросмотра только для разработки (в проде 404). Показывает настоящие компоненты экрана
// («Сделать»: Composer с форматом из плана, результат FormatPane с ReelsScript и сторис) на материалах живой проверки
// _знания/мозг-генератора/zh6/prod-check/rezultaty.json (scripts/zh6/prod-check.ts). Для скриншотов без входа в аккаунт.
import { notFound } from 'next/navigation'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Suspense } from 'react'
import Preview from './Preview'

export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound()
  const f = join(process.cwd(), '_знания', 'мозг-генератора', 'zh6', 'prod-check', 'rezultaty.json')
  const data = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
  if (!data) return <p className="p-6">Нет данных: запусти scripts/zh6/prod-check.ts</p>
  return <Suspense><Preview data={data} /></Suspense>
}
