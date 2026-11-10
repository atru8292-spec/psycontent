// zh6 v2 (09.11): каталог форматов-шаблонов из материалов Арины (03-PROMPTY, 11-KAK-USTROENY-KARUSELI, 05-NAHODKI-TG,
// разбор 104 рилсов, IDEI-FORMATOV, разбор стока), описание для людей _знания/мозг-генератора/zh6/FORMATY.md.
// План тем ставит каждой теме формат из каталога (код проверяет смешивание, pravilaSmeshivaniya), промпт текста получает
// описание формата и разметку.
import data from './formaty.json'
import type { FormatCode } from '../text-guard'

export type Format6 = {
  code: string; name: string; for: string[]; hod: string[]; dlina: string; golos: string[]
  primer: string; isportit: string; istochnik: string; short: boolean; scene: boolean; talking_head: boolean
}
export const FORMATY: Format6[] = data as Format6[]
export const formatByCode = (c: string) => FORMATY.find(f => f.code === c)

// подходит ли формат голосу автора: «vse» всем; иронию требуют только форматы без бережных и спокойных пометок
export function goditsyaGolosu(f: Format6, voice: string[]): boolean {
  if (f.golos.includes('vse')) return true
  return f.golos.some(g => voice.includes(g))
}

// какой формат генерации (FormatCode) у формата каталога: по первому назначению
export function formatCodeOf(f: Format6): FormatCode {
  const t = f.for[0]
  if (t === 'carousel') return 'carousel'
  if (t === 'post') return 'post'
  if (t === 'stories') return 'stories'
  // zh6-prod 10.11: вид рилса виден экрану по коду (существующие коды REELS_FORMATS, миграция не нужна)
  if (bezGolosa(f)) return 'reels_bez_slov'
  if (f.scene) return 'reels_scenka'
  return 'reels_monolog'
}
export const tipOf = (f: Format6) => f.for[0]
// беззвучный рилс: только надпись и подпись
export const bezGolosa = (f: Format6) => f.code === 'reels_bez_slov' || f.code === 'reels_kabinet' || f.code === 'reels_ispoved'

// разметка ответа по типу формата (метки читает интерфейс)
export function razmetka(f: Format6): string {
  const t = tipOf(f)
  if (t === 'carousel') return 'Слайд 1: текст\nСлайд 2: текст\n...\nПодпись: одна-три короткие фразы под каруселью'
  if (t === 'post') return 'Только текст поста, абзацами (не одной стеной).'
  if (t === 'stories') return 'Экран 1:\nСнять: что снять, просто, без людей в кадре кроме автора\nНадпись: текст на экране, до 15 слов\nЭкран 2:\n...\nНа одном экране строка «Стикер: ...» (опрос, вопрос или шкала). В конце строка «Что делать с ответами: ...».'
  if (bezGolosa(f)) return 'Текст на экране: надпись (если надписей несколько, между ними отдельная строка [смена])\nПодпись: две-четыре короткие фразы под роликом: что-то, чего нет в надписи'
  if (f.scene) return 'Текст на экране: строка на первые секунды, до 8 слов\nРечь: реплики по одной на строку, у каждой в начале кто говорит («Я:», «Психолог:», «Клиент:», «Внутренний голос:» и т.п.)\nПодпись: одна-три короткие фразы под роликом'
  return 'Текст на экране: строка на первые секунды, до 8 слов\nРечь: текст речи сплошным текстом, как говорят вслух\nПодпись: одна-две короткие живые фразы под роликом, в голосе автора, без лекции и морали'
}

export function formatBlock(f: Format6): string {
  return [
    `Формат: ${f.name}.`,
    `Как устроен:\n${f.hod.map((h, i) => `${i + 1}. ${h}`).join('\n')}`,
    `Длина: ${f.dlina}`,
    `Как выглядит устройство (пример своими словами, не повторяй его тему и детали): ${f.primer}`,
    `Чем испортить: ${f.isportit}`,
    `Разметка ответа:\n${razmetka(f)}`,
  ].join('\n\n')
}
