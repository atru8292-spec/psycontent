// Маленькие хуки для замеров на клиенте: событие один раз при показе экрана или блока.
import { useEffect, useRef } from 'react'
import { track, type TrackProps } from '@/lib/track'
import type { Feature } from './events'

export function useTrackOnce(event: string, props?: TrackProps, enabled = true) {
  const done = useRef(false)
  useEffect(() => {
    if (!enabled || done.current) return
    done.current = true
    track(event, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}

export const useFeatureOpen = (feature: Feature, enabled = true) => useTrackOnce('feature_open', { feature }, enabled)
