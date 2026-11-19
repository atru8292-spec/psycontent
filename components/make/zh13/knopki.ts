// Три кнопки экрана «Написать» по системе из аудита UI 19.11 (ui/MOCKUPS.html): высота 48, радиус 12, текст 16/600.
// Основная одна на экран (зеленая), вторичная белая с рамкой, текстовая без фона и без подчеркивания.
const BASE = 'h-12 rounded-xl text-[16px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:cursor-not-allowed'
export const BTN_P = `${BASE} px-6 bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-60`
export const BTN_S = `${BASE} px-5 border border-brand-border bg-brand-card text-brand-text hover:bg-brand-soft-2 disabled:opacity-40`
export const BTN_T = `${BASE} px-2 text-brand-accent hover:bg-brand-soft-2 disabled:opacity-40`
