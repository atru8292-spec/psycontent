// Предпросмотр экрана результата рилса (ReelsScript в FormatPane) только для разработки, в проде 404.
// Секция ?s=elena|zahar|bezslov|stary, без параметра все подряд. Для скриншотов без входа и без базы.
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Preview from './Preview'

export const dynamic = 'force-dynamic'

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Suspense><Preview /></Suspense>
}
