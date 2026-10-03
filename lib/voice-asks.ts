// Лестница просьб про голос (08-GOLOS-I-OBUCHENIE.md): не больше одной просьбы за день,
// только после готового поста, после «Позже» пауза в 3 поста, сделанное больше не просим.
// Состояние в localStorage: это удобство одного браузера, на данные голоса не влияет.

export type AskKey = 'rephrase' | 'archetype' | 'repeat' | 'blog'

type AskState = { done: AskKey[]; dismissedAt: number | null; lastShownDay: string | null; lastShownKey: AskKey | null }

const KEY = 'psycont_voice_asks'
const today = () => new Date().toISOString().slice(0, 10)

export function readAsks(): AskState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { done: [], dismissedAt: null, lastShownDay: null, lastShownKey: null, ...JSON.parse(raw) }
  } catch {}
  return { done: [], dismissedAt: null, lastShownDay: null, lastShownKey: null }
}

function write(s: AskState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

// Какую просьбу показать после этого поста. null: сегодня уже просили или пауза.
export function pickAsk(opts: {
  postCount: number
  hasGenericPhrase: boolean
  archetypeIncomplete: boolean
  ownSamples: number
}): AskKey | null {
  const s = readAsks()
  const fits: Record<AskKey, boolean> = {
    rephrase: opts.postCount >= 1 && opts.hasGenericPhrase,
    archetype: opts.postCount >= 2 && opts.archetypeIncomplete,
    repeat: opts.postCount >= 3,
    blog: opts.postCount >= 4 && opts.ownSamples < 2,
  }
  const open = (k: AskKey) => !s.done.includes(k) && fits[k]
  if (s.lastShownDay === today()) {
    // сегодня уже просили: та же просьба до конца дня, если она еще к месту; новой не будет
    return s.lastShownKey && open(s.lastShownKey) ? s.lastShownKey : null
  }
  if (s.dismissedAt != null && opts.postCount - s.dismissedAt < 3) return null
  const order: AskKey[] = ['rephrase', 'archetype', 'repeat', 'blog']
  return order.find(open) ?? null
}

export function markShown(key: AskKey) {
  const s = readAsks()
  if (s.lastShownDay === today() && s.lastShownKey === key) return
  write({ ...s, lastShownDay: today(), lastShownKey: key })
}

export function markDone(key: AskKey) {
  const s = readAsks()
  write({ ...s, done: Array.from(new Set([...s.done, key])) })
}

export function markDismissed(postCount: number) {
  const s = readAsks()
  write({ ...s, dismissedAt: postCount, lastShownDay: today(), lastShownKey: null })
}
