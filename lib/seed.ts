// Свое число и свой порядок у каждого психолога (27.11, Арина: «боюсь, что в шаблон для всех скатится»). Выбор
// «по кругу» от числа текстов психолога или от дня года совпадал у всех новых психологов в один и тот же ход:
// одна и та же ситуация темы, образцы, живой кусок, тема дня. Семя от id психолога (и темы) разводит их.
// Без зависимостей: модуль берут и сервер (генератор zh13), и экраны (тема дня).

// FNV-1a: одинаковая строка всегда дает одно число
export function seedIz(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// перемешивание с семенем (mulberry32 + Фишер-Йетс): у одного психолога порядок всегда один, у разных разный
export function peremeshat<T>(arr: readonly T[], seed: number): T[] {
  let a = seed >>> 0
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// сдвиг для выбора по кругу: небольшое число, чтобы n + sdvig не уходило в большие числа
export const sdvigIz = (s: string) => (s ? seedIz(s) % 997 : 0)
