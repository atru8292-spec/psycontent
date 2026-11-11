import { supabase } from '@/lib/supabase'

// Имя для писем входа (переезд базы, 10.11.2026). Письма собирает Supabase Auth и видит только данные аккаунта
// (auth.users.raw_user_meta_data), а не профиль onboarding_profiles. Поэтому после сохранения имени в профиле
// кладем первое слово имени в user_metadata.imya: шаблон письма пишет «{imya}, привет!», без имени «Привет!».
// Никогда не бросает и ничего не ждет от ответа: письмо без имени тоже нормальное.
export function firstName(full: string | null | undefined): string {
  const w = String(full || '').trim().split(/\s+/)[0] || ''
  return w.replace(/[<>{}"]/g, '').slice(0, 40)
}

export async function syncEmailName(full: string | null | undefined): Promise<void> {
  const imya = firstName(full)
  try {
    const { data } = await supabase.auth.getUser()
    if (!data?.user || (data.user.user_metadata?.imya || '') === imya) return
    await supabase.auth.updateUser({ data: { imya } })
  } catch {}
}
