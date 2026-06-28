// ───────────────────────────────────────────────────────────────────────────
// Корректный разбор SSE-потока от OpenAI.
//
// Зачем: ответ приходит сетевыми кусками (Uint8Array). Один кусок может разрезать
// как двухбайтовый кириллический символ, так и саму строку `data: {...}`. Старый
// код декодировал каждый кусок отдельно (без { stream: true }) и сразу бил по '\n'
// — из-за этого на стыках кусков символы и целые дельты терялись, а текст паспорта
// приходил битым уже в базу.
//
// Здесь: TextDecoder со { stream: true } (держит недобитый символ до следующего
// куска) + буфер незаконченной строки (отдаём только полные строки, остаток
// переносим дальше). На выходе — payload каждого события `data:` (строкой),
// [DONE] и пустые строки отфильтрованы.
// ───────────────────────────────────────────────────────────────────────────

export async function* iterateSSEData(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''

  const drain = function* (flush: boolean): Generator<string> {
    // Пока есть законченные строки — выдаём их. Незаконченный хвост оставляем в buffer.
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      const payload = lineToData(line)
      if (payload !== null) yield payload
    }
    if (flush && buffer.length) {
      const payload = lineToData(buffer)
      buffer = ''
      if (payload !== null) yield payload
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    yield* drain(false)
  }
  // финальный flush: добираем остаток декодера и последнюю строку без '\n'
  buffer += decoder.decode()
  yield* drain(true)
}

function lineToData(line: string): string | null {
  const t = line.trim()
  if (!t.startsWith('data:')) return null
  const data = t.slice(5).trim()
  if (!data || data === '[DONE]') return null
  return data
}
