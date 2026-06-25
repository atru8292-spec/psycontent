import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

// Корневой middleware. Next.js видит его только в корне проекта.
// На каждом запросе обновляет сессию из куки и охраняет личные разделы.
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Работаем на всех страницах, кроме статики и картинок (их не нужно проверять).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
