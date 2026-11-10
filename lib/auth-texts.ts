// Тексты входа, сброса пароля и подтверждения почты (copywriter-psycont, 10.11.2026).
// Одно место для окна входа (components/AuthModal.tsx) и страниц app/auth/podtverdit, app/auth/novyy-parol.
// Сырые сообщения Supabase человеку не показываем никогда: любая ошибка идет через authErrorKind.

import type { AuthError } from '@supabase/supabase-js'

export type AuthErrorKind =
  | 'rate_limit'        // письмо недавно уже ушло, слишком часто
  | 'not_confirmed'     // вход до подтверждения почты
  | 'bad_credentials'   // почта или пароль не подходят
  | 'same_password'     // новый пароль совпадает со старым
  | 'weak_password'     // короче минимума
  | 'expired'           // ссылка из письма устарела или уже использована
  | 'other'

export function authErrorKind(err: Pick<AuthError, 'code' | 'message' | 'status'> | null | undefined): AuthErrorKind {
  if (!err) return 'other'
  const code = err.code || ''
  const msg = (err.message || '').toLowerCase()
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err.status === 429) return 'rate_limit'
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'not_confirmed'
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'bad_credentials'
  if (code === 'same_password' || msg.includes('should be different from the old password')) return 'same_password'
  if (code === 'weak_password') return 'weak_password'
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found'
    || msg.includes('expired') || (msg.includes('invalid') && msg.includes('token'))) return 'expired'
  return 'other'
}

export const MIN_PASSWORD = 6
// Повторно отправить письмо можно не раньше чем через минуту (у Supabase свой лимит, это мягкий барьер в интерфейсе)
export const RESEND_COOLDOWN_S = 60

export const T = {
  // окно входа
  registerTitle: 'Создай аккаунт',
  loginTitle: 'Войди в аккаунт',
  loginSubtitle: 'Рады снова тебя видеть',
  registerSubtitle: 'Бесплатно. Без карты.',
  divider: 'или по почте',
  emailPlaceholder: 'Почта',
  passwordPlaceholder: 'Пароль',
  loading: 'Секунду...',
  submitRegister: 'Создать аккаунт',
  submitLogin: 'Войти',
  haveAccount: 'Уже есть аккаунт?',
  noAccount: 'Нет аккаунта?',
  toLogin: 'Войти',
  toRegister: 'Зарегистрироваться',
  forgotLink: 'Не помню пароль',

  shortPassword: 'В пароле нужно хотя бы 6 символов',
  alreadyRegistered: 'На эту почту уже есть аккаунт. Попробуй войти.',
  badCredentials: 'Почта или пароль не подходят. Проверь и попробуй еще раз.',
  checkEmailTitle: 'Осталось подтвердить почту',
  checkEmail: (email: string) =>
    `Мы отправили письмо на ${email}, открой его и нажми «Подтвердить почту», без этого войти не получится. Ссылка работает 1 час. Если письма нет через пару минут, загляни в спам.`,
  notConfirmed: 'Почта пока не подтверждена. Найди наше письмо и нажми в нем ссылку. Если письма нет или ссылка устарела, пришлем новое.',
  resendConfirm: 'Прислать письмо еще раз',
  resentConfirm: (email: string) =>
    `Отправили новое письмо на ${email}. Ссылка работает 1 час. Если письма не видно, загляни в спам.`,
  rateLimit: 'Письмо недавно уже ушло. Подожди минуту и попробуй еще раз.',
  generic: 'Не получилось, сбой на нашей стороне. Попробуй еще раз через минуту.',
  resendIn: (s: number) => `Отправить еще раз можно через ${s} с`,

  // режим «Не помню пароль»
  forgotTitle: 'Вернем доступ',
  forgotSubtitle: 'Пришлем на почту ссылку, по ней задашь новый пароль',
  forgotEmailPlaceholder: 'Твоя почта',
  forgotSubmit: 'Прислать ссылку',
  forgotSending: 'Отправляем...',
  forgotBack: 'Назад ко входу',
  forgotSentTitle: 'Проверь почту',
  forgotSent: 'Если на эту почту есть аккаунт, мы уже отправили туда ссылку. Она работает 1 час. Если письма нет через пару минут, загляни в спам.',
  forgotResend: 'Прислать ссылку еще раз',

  // страница «Новый пароль»
  newTitle: 'Придумай новый пароль',
  newSubtitle: 'Сохранишь, и сразу откроется кабинет',
  newPlaceholder: 'Новый пароль',
  newHint: 'Хотя бы 6 символов. Лучше такой, который ты не используешь на других сайтах.',
  newSubmit: 'Сохранить пароль',
  newSaving: 'Сохраняем...',
  newDoneTitle: 'Готово, пароль обновлен',
  newDoneButton: 'Открыть кабинет',
  newExpiredTitle: 'Ссылка уже не работает',
  newExpired: 'Она живет 1 час и открывается только один раз. Запроси новую, письмо придет на ту же почту.',
  newExpiredButton: 'Прислать новую ссылку',
  samePassword: 'Этот пароль у тебя уже стоит. Придумай другой.',
  saveFailed: 'Пароль не сохранился, сбой на нашей стороне. Попробуй еще раз через минуту.',
  loginWithPassword: 'Войти с паролем',
  checking: 'Проверяем ссылку...',
  showPassword: 'Показать пароль',
  hidePassword: 'Скрыть пароль',

  // страница подтверждения по ссылке из письма
  confirm: {
    signup: { title: 'Подтверди почту', text: 'Нажми кнопку, и дальше будет короткое знакомство и первый пост.', button: 'Подтвердить почту' },
    email_change: { title: 'Подтверди новую почту', text: 'После подтверждения вход и письма будут на этот адрес. Тексты, голос и настройки остаются на месте.', button: 'Подтвердить почту' },
    magiclink: { title: 'Вход в PsyCont', text: 'Нажми кнопку, и откроется твой кабинет.', button: 'Войти в PsyCont' },
  },
  confirming: 'Подтверждаем...',
  linkExpiredTitle: 'Ссылка устарела',
  linkExpired: 'Ссылка из письма работает 1 час и только один раз. Может быть, почта уже подтверждена, тогда просто войди. Если нет, пришлем новое письмо.',
  linkExpiredResend: 'Прислать письмо заново',
  linkExpiredLogin: 'Войти',
} as const
