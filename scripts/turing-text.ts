// Только то, что зритель слышит или читает: без надписи на экране, подписи, ролей и подсказок к съемке.
// Общее для turing.ts, stylo.ts и compare.ts.
export function plainText(text: string): string {
  const out: string[] = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (/^Подпись\s*:/u.test(line)) break
    if (/^(Текст на экране|Крупно на экране|Персонажи|Рисую|Итог на схеме|Кадр)\s*:/u.test(line)) continue
    out.push(line.replace(/^(Речь|Экран\s*\d+)\s*:\s*/u, ''))
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
