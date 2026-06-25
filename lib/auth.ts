import { createClient } from '@/utils/supabase/server'

// Возвращает проверенного пользователя из сессии в куках (или null, если не вошёл).
// Сервер сам узнаёт, кто делает запрос, — больше не доверяем userId из тела запроса.
export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
