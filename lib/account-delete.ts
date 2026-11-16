// Удаление аккаунта самим человеком (16.11, блок 1 запуска; /privacy обещает стереть данные и фото).
// Порядок: 1) фото в бакете user-photos/<id>/ (каскадом не стираются); если фото не удалились, аккаунт не трогаем,
// чтобы не остались файлы без хозяина; 2) событие account_delete без user_id (иначе каскад сотрет и его):
// только коды причин, число дней и материалов, без текстов; 3) auth.admin.deleteUser: все таблицы с user_id
// ссылаются на auth.users с on delete cascade (generated_posts, onboarding_profiles, voice_events, events,
// usage_log, счетчики, тарифы и прочие), строки уходят вместе с аккаунтом.
// Логика с зависимостями отдельно от роута, чтобы ее проверял тест без базы (scripts/test-account-delete.ts).

// коды короткие: в событии они идут одной строкой через запятую, а санитайзер пропускает значения до 40 знаков (все шесть = 40)
export const DELETE_REASONS = ['tekst', 'dorogo', 'vremya', 'pozzhe', 'neudob', 'drugoe'] as const
export type DeleteReason = typeof DELETE_REASONS[number]

export function cleanReasons(v: unknown): DeleteReason[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is DeleteReason => typeof x === 'string' && (DELETE_REASONS as readonly string[]).includes(x)))]
}

export interface DeleteDeps {
  listPhotos: (userId: string) => Promise<string[]>        // полные пути <id>/<файл>
  removePhotos: (paths: string[]) => Promise<void>          // бросает при ошибке
  stats: (userId: string) => Promise<{ days: number; materials: number }>
  logEvent: (props: Record<string, unknown>) => Promise<void> // без user_id, не бросает
  deleteUser: (userId: string) => Promise<void>             // бросает при ошибке
  // оплата (17.11): выключить автопродление и способы оплаты, стереть почту в платежах (платежи остаются для учета
  // дохода самозанятой, без связи с человеком). Бросает при ошибке: тогда аккаунт не трогаем
  cancelBilling?: (userId: string) => Promise<void>
}

export type DeleteResult = { ok: true; photos: number } | { ok: false; step: 'billing' | 'photos' | 'user' }

export async function deleteAccount(userId: string, reasons: DeleteReason[], deps: DeleteDeps): Promise<DeleteResult> {
  // 0) подписка: ни одного списания после удаления
  if (deps.cancelBilling) { try { await deps.cancelBilling(userId) } catch { return { ok: false, step: 'billing' } } }
  let photos: string[]
  try {
    // все файлы человека лежат в папке с его id; чужие пути сюда не попадут
    photos = (await deps.listPhotos(userId)).filter(p => p.startsWith(`${userId}/`))
    if (photos.length) await deps.removePhotos(photos)
    const left = (await deps.listPhotos(userId)).filter(p => p.startsWith(`${userId}/`))
    if (left.length) return { ok: false, step: 'photos' }
  } catch { return { ok: false, step: 'photos' } }

  const st = await deps.stats(userId).catch(() => ({ days: -1, materials: -1 }))
  await deps.logEvent({ reason: reasons.join(',') || 'net', days: st.days, materials: st.materials }).catch(() => {})

  try { await deps.deleteUser(userId) } catch { return { ok: false, step: 'user' } }
  return { ok: true, photos: photos.length }
}
