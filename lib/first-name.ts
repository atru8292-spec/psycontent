// Имя для писем входа: одно слово из букв (можно дефис и апостроф), до 30 знаков, с заглавной буквы.
// То же правило проверяет триггер базы psycont_imya_guard на auth.users (миграция 20261111100000_auth_imya_guard):
// клиенту верить нельзя (signUp сам задает user_metadata), поэтому решает база, а здесь только чтобы не расходиться.
// Пустая строка значит «имени нет», письмо начнется с «Привет!». Без импорта клиента Supabase: годится и для сервера.
export const IMYA_RE = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'-]{0,29}$/

export function firstName(full: string | null | undefined): string {
  const words = String(full || '').trim().split(/\s+/).filter(Boolean)
  const w = words.find(x => IMYA_RE.test(x)) || ''
  return w ? w[0].toUpperCase() + w.slice(1) : ''
}
