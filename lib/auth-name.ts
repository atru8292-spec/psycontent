import { supabase } from '@/lib/supabase'
import { firstName } from '@/lib/first-name'

// Имя для писем входа (переезд базы, 10.11.2026). Письма собирает Supabase Auth и видит только данные аккаунта
// (auth.users.raw_user_meta_data), а не профиль onboarding_profiles. Поэтому после сохранения имени в профиле
// кладем имя в user_metadata.imya: шаблон письма пишет «{imya}, привет!», без имени «Привет!».
// Что попадет в письмо, решает триггер базы psycont_imya_guard (только одно слово из букв), не этот код.
// Никогда не бросает: письмо без имени тоже нормальное. Сравнение по локальной сессии, без лишнего запроса.
export { firstName }

export async function syncEmailName(full: string | null | undefined): Promise<void> {
  const imya = firstName(full)
  if (!imya) return
  try {
    const { data } = await supabase.auth.getSession()
    const user = data?.session?.user
    if (!user || (user.user_metadata?.imya || '') === imya) return
    await supabase.auth.updateUser({ data: { imya } })
  } catch {}
}
