'use client'

// Сводка /api/me, которую layout кабинета тянет один раз: страницы берут флаг нового мозга отсюда,
// а не делают второй такой же запрос (и не мелькают старым экраном, пока он идет).
import { createContext, useContext } from 'react'

// typing: поле ввода в фокусе (таб-бар уехал); липкие панели прячутся вместе с ним
// refresh: перечитать сводку (остаток материалов) после генерации
export type DashboardMe = { me: any; loaded: boolean; typing?: boolean; refresh?: () => void }

export const DashboardMeContext = createContext<DashboardMe>({ me: null, loaded: false })

export function useDashboardMe() {
  return useContext(DashboardMeContext)
}
