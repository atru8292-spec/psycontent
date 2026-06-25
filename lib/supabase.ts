import { createBrowserClient } from '@supabase/ssr'

// Браузерный клиент Supabase: сессия входа хранится в защищённых куках,
// а не в localStorage. Это позволяет серверу (middleware и API-роутам)
// самому проверять пользователя, не доверяя userId из запроса.
// Интерфейс тот же (supabase.auth.*, supabase.from(...)), экраны не меняются.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
