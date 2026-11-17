// Общие классы кнопок кабинета.
// Правило: действие не оформляется текстом-ссылкой. Ссылка остается только
// внутри обычного предложения («Подробнее о данных», оферта) и «Назад» с шевроном.

// Тихая кнопка второго уровня: рамка, белая карточка, акцентный текст.
export const QUIET_BTN =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl border border-brand-border bg-brand-card text-[14px] font-semibold text-brand-accent hover:bg-brand-soft-2 focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

// Маленькая версия для тесных мест (шапка блока «Описание», строка статуса).
// Видимая высота 36 px; зона нажатия 44 за счет невидимого ::after на 4 px во все стороны
// (в Tailwind 4 вариант after: сам ставит content). Рядом оставлять зазор от 8 px.
export const QUIET_BTN_SM =
  'relative after:absolute after:-inset-1 inline-flex items-center justify-center gap-1.5 min-h-9 px-3 rounded-xl border border-brand-border bg-brand-card text-[13px] font-semibold text-brand-accent hover:bg-brand-soft-2 focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

// Нейтральная тихая кнопка (не акцентная): для действий, которые не надо
// подсвечивать, например «Удалить аккаунт».
export const QUIET_BTN_MUTED = QUIET_BTN.replace('text-brand-accent', 'text-brand-text-secondary')

export const QUIET_BTN_SM_MUTED = QUIET_BTN_SM.replace('text-brand-accent', 'text-brand-text-secondary')
