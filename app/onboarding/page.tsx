// Старая длинная анкета на 26 вопросов удалена (решение 6 в 09-PUT-POLZOVATELYA.md, список LISHNEE-NA-SAYTE.md, пункт 1).
// Адрес оставлен перенаправлением: старые ссылки и серверные ответы с redirect: '/onboarding' ведут в пять вопросов с Верой.
import { redirect } from 'next/navigation'

export default function OldOnboardingRedirect() {
  redirect('/onboarding/express')
}
