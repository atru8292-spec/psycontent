import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { publicOrigin } from '@/lib/origin'

// Обменник входа. После OAuth (Google и др.) Supabase возвращает сюда ?code=...
// Мы обмениваем код на сессию и кладём её в куки, затем перенаправляем дальше.
// Для входа по email+паролю обменник не нужен (сессия ставится сразу на клиенте).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = publicOrigin(request)
  const code = searchParams.get('code')
  // next только свой путь: «/...», но не «//...» и без обратной косой (иначе next=@evil.com или //evil.com
  // увели бы на чужой домен после входа, ревью 10.11)
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\')
    ? rawNext : '/onboarding/intro'

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
