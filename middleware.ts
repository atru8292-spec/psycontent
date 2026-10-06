import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

// Корневой middleware. Next.js видит его только в корне проекта.
// На каждом запросе обновляет сессию из куки и охраняет личные разделы.
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Работаем на всех страницах, кроме статики, картинок и файлов для ботов (robots.txt, sitemap.xml, llms.txt):
  // боты приходят без куки, им не нужна проверка сессии, и эти адреса всегда отвечают 200.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
