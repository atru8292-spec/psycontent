// zh13: подбор формата под тему при «Подбери сам» (задача 19.11, часть 4). Короткий вызов до писателя: модель
// ранжирует 6 форматов, которые лучше всего подходят к теме или мысли, с одной строкой «почему». Формат нужно знать
// до текста (у каждого свои образцы и устройство), поэтому это отдельный дешевый вызов, а не тот же, что пишет текст.
// Код берет первый, который держит смесь (smes.ts); следующие три идут в «Подойдет еще». Сбой: пустое ранжирование,
// код подбирает по кругу.
import { callJson } from '../ai'
import { FORMATY, type Format13 } from './formaty'

export type Rang = { kod: string; pochemu: string }

export async function ranzhirovat(o: {
  tema: string | null; mysl: string | null; situaciya: string | null; formaty: Format13[]; timeoutMs: number; userId?: string; knownNames: string[]
}): Promise<Rang[]> {
  const spisok = o.formaty.map(f => `${f.kod}: ${f.imya} (${f.korotko})`).join('\n')
  const user = [
    o.mysl ? `Мысль психолога: «${o.mysl}».` : `Тема: ${String(o.tema || '').replace(/[«»]/g, '')}.${o.situaciya ? ` Ситуация: ${o.situaciya}.` : ''}`,
    `Форматы:\n${spisok}`,
    'Выбери 6 форматов, в которых эта тема или мысль раскроется лучше всего, от лучшего к худшему. У каждого одна короткая причина до 10 слов про эту тему (например «тут есть живой диалог с клиентом»).',
    'Ответ только JSON: {"formaty":[{"kod":"...","pochemu":"..."}]}',
  ].join('\n\n')
  try {
    const r = await callJson<{ formaty?: { kod?: string; pochemu?: string }[] }>({ system: 'Ты психолог, который ведет блог и знает, какие форматы рилсов и постов как заходят. Отвечаешь только JSON.', user, effort: 'low', verbosity: 'low', maxTokens: 900, timeoutMs: o.timeoutMs, userId: o.userId, operation: 'generate_post_zh13_podbor', knownNames: o.knownNames })
    const kody = new Set(o.formaty.map(f => f.kod))
    const out: Rang[] = []
    for (const x of r?.formaty || []) {
      const kod = String(x?.kod || '').trim().toLowerCase()
      if (kody.has(kod) && !out.some(y => y.kod === kod)) out.push({ kod, pochemu: String(x?.pochemu || '').trim().replace(/[ёЁ]/g, m => (m === 'ё' ? 'е' : 'Е')).replace(/\s+[—–]\s+/g, ', ').slice(0, 120) })
    }
    return out.slice(0, 6)
  } catch {
    return []
  }
}
export const vseFormaty = () => FORMATY
