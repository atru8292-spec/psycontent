import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Обменник входа. После OAuth (Google и др.) Supabase возвращает сюда ?code=...
// Мы обмениваем код на сессию и кладём её в куки, затем перенаправляем дальше.
// Для входа по email+паролю обменник не нужен (сессия ставится сразу на клиенте).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding/intro'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Что-то пошло не так с обменом — возвращаем на главную.
  return NextResponse.redirect(`${origin}/?error=auth`)
}
