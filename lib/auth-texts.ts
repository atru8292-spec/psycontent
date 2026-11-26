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

// Итог запроса письма. «sent» и для незнакомой почты: ответ не выдает, есть ли аккаунт.
export type LinkResult = 'sent' | 'rate' | 'fail'
export function linkResult(err: Pick<AuthError, 'code' | 'message' | 'status'> | null | undefined): LinkResult {
  if (!err) return 'sent'
  const k = authErrorKind(err)
  if (k === 'rate_limit') return 'rate'
  if ((err.status ?? 500) >= 500 || err.status === 0) return 'fail'
  return 'sent'
}
// Сбой проверки ссылки, при котором токен не потрачен: лимит или сеть. Тогда не пишем «ссылка устарела».
export function verifyRetryable(err: Pick<AuthError, 'code' | 'message' | 'status' | 'name'>): 'rate' | 'fail' | null {
  if (authErrorKind(err) === 'rate_limit') return 'rate'
  if ((err.status ?? 0) >= 500 || err.status === 0 || err.name === 'AuthRetryableFetchError') return 'fail'
  return null
}

export const MIN_PASSWORD = 6
// Повторно отправить письмо можно не раньше чем через минуту (у Supabase свой лимит, это мягкий барьер в интерфейсе)
export const RESEND_COOLDOWN_S = 60

export const T = {
  // окно входа
  registerTitle: 'Создай аккаунт',
  loginTitle: 'Войди в аккаунт',
  loginSubtitle: 'С возвращением',
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
  badCredentials: 'Почта или пароль не подходят. Проверь и попробуй еще раз.',
  checkEmailTitle: 'Осталось подтвердить почту',
  openMail: 'Открыть почту',
  checkEmail: (email: string) =>
    `Письмо ушло на ${email}. Открой его и нажми «Подтвердить почту», без этого войти не получится. Ссылка работает 1 час. Если письма нет через пару минут, загляни в спам. А если аккаунт на эту почту у тебя уже был, нового письма не будет. Тогда просто войди или нажми «Не помню пароль».`,
  notConfirmed: 'Почта пока не подтверждена. Найди письмо от PsyCont и нажми в нем ссылку. Если письма нет или ссылка устарела, можно получить новое.',
  resendConfirm: 'Прислать письмо еще раз',
  resentConfirm: (email: string) =>
    `Новое письмо ушло на ${email}. Ссылка работает 1 час. Если письма не видно, загляни в спам.`,
  rateLimit: 'Письмо недавно уже ушло. Подожди минуту и попробуй еще раз.',
  generic: 'Не получилось из-за сбоя в PsyCont. Попробуй еще раз через минуту.',
  // регистрация не прошла защиту от ботов (copywriter-psycont 16.11): без слова «бот» и без обвинения
  signupBlocked: 'Сейчас зарегистрироваться не получается. Подожди немного и попробуй снова, можно с другой сети.',
  // согласие на обработку данных при регистрации (152-ФЗ): галочка не стоит заранее, без нее аккаунт не создается
  needConsent: 'Чтобы создать аккаунт, поставь галочку согласия.',
  yandexNeedConsent: 'Ты входишь через Яндекс впервые. Поставь галочку ниже и нажми кнопку Яндекса еще раз.',
  resendIn: (s: number) => `Отправить еще раз можно через ${s} с`,

  // режим «Не помню пароль»
  forgotTitle: 'Восстановить доступ',
  forgotSubtitle: 'На почту придет ссылка, по ней задашь новый пароль',
  forgotEmailPlaceholder: 'Твоя почта',
  forgotSubmit: 'Прислать ссылку',
  forgotSending: 'Секунду...',
  forgotBack: 'Назад ко входу',
  forgotSentTitle: 'Проверь почту',
  forgotSent: 'Если на эту почту есть аккаунт, ссылка уже ушла туда. Она работает 1 час. Если письма нет через пару минут, загляни в спам.',
  forgotResend: 'Прислать ссылку еще раз',

  // страница «Новый пароль»
  newTitle: 'Придумай новый пароль',
  newSubtitle: 'Сохранишь, и сразу откроется кабинет',
  newPlaceholder: 'Новый пароль',
  newHint: 'Хотя бы 6 символов. Лучше такой, который ты не используешь на других сайтах.',
  newSubmit: 'Сохранить пароль',
  newSaving: 'Секунду...',
  newDoneTitle: 'Готово, пароль обновлен',
  newDoneButton: 'Открыть кабинет',
  newExpiredTitle: 'Ссылка уже не работает',
  newExpired: 'Она живет 1 час и открывается только один раз. Запроси новую, письмо придет на ту же почту.',
  newExpiredButton: 'Прислать новую ссылку',
  samePassword: 'Этот пароль у тебя уже стоит. Придумай другой.',
  saveFailed: 'Пароль не сохранился из-за сбоя в PsyCont. Попробуй еще раз через минуту.',
  loginWithPassword: 'Войти с паролем',
  checking: 'Ссылка проверяется...',
  showPassword: 'Показать пароль',
  hidePassword: 'Скрыть пароль',

  // страница подтверждения по ссылке из письма
  confirm: {
    signup: { title: 'Подтверди почту', text: 'Нажми кнопку, и дальше будет короткое знакомство и первый пост.', button: 'Подтвердить почту' },
    email_change: { title: 'Подтверди новую почту', text: 'После подтверждения вход и письма будут на этот адрес. Тексты, голос и настройки остаются на месте.', button: 'Подтвердить почту' },
    magiclink: { title: 'Вход в PsyCont', text: 'Нажми кнопку, и откроется твой кабинет.', button: 'Войти в PsyCont' },
  },
  confirming: 'Секунду...',
  linkExpiredTitle: 'Ссылка устарела',
  linkExpired: 'Ссылка из письма работает 1 час и только один раз. Может быть, почта уже подтверждена, тогда просто войди. Если нет, можно получить новое письмо.',
  linkExpiredResend: 'Прислать письмо заново',
  linkExpiredLogin: 'Войти',
} as const

// Веб-почта по домену адреса (26.11, активация): кнопка «Открыть почту» на экране «Осталось подтвердить почту»,
// чтобы не искать письмо самой. Неизвестный домен: кнопки нет.
const POCHTA: [RegExp, string][] = [
  [/^(gmail|googlemail)\.com$/, 'https://mail.google.com/'],
  [/^(mail|bk|list|inbox|internet)\.ru$/, 'https://e.mail.ru/inbox/'],
  [/^(yandex\.(ru|com|by|kz|ua)|ya\.ru)$/, 'https://mail.yandex.ru/'],
  [/^(rambler\.ru|lenta\.ru|ro\.ru|autorambler\.ru|myrambler\.ru)$/, 'https://mail.rambler.ru/'],
  [/^(icloud|me|mac)\.com$/, 'https://www.icloud.com/mail/'],
  [/^(outlook|hotmail|live|msn)\.com$/, 'https://outlook.live.com/mail/'],
]
export function webPochta(email: string): string | null {
  const d = String(email || '').split('@')[1]?.trim().toLowerCase() || ''
  return POCHTA.find(([re]) => re.test(d))?.[1] || null
}
