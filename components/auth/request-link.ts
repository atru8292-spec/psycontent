import { supabase } from '@/lib/supabase'
import { linkResult, type LinkResult } from '@/lib/auth-texts'

// Запросить письмо со ссылкой: сброс пароля (recovery) или повтор подтверждения почты (signup).
// Одна функция для окна входа и страниц app/auth/*. Никогда не бросает: сбой сети это 'fail'.
// Ссылки в письмах собирает шаблон Supabase (адрес сайта + token_hash), redirectTo не нужен.
export async function requestLink(kind: 'recovery' | 'signup', email: string): Promise<LinkResult> {
  const addr = email.trim()
  if (!addr) return 'fail'
  try {
    const { error } = kind === 'recovery'
      ? await supabase.auth.resetPasswordForEmail(addr)
      : await supabase.auth.resend({ type: 'signup', email: addr })
    return linkResult(error)
  } catch {
    return 'fail'
  }
}
