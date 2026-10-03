// Какие текстовые модели OpenAI доступны нашему ключу. Бесплатно, ключ не печатается.
// Запуск: npx tsx --env-file=.env.local scripts/list-models.ts
async function main() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('Нет OPENAI_API_KEY в .env.local')
  const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`OpenAI ${r.status}`)
  const d: any = await r.json()
  const ids: string[] = (d.data || []).map((m: any) => String(m.id))
    .filter((id: string) => /^(gpt|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id))
    .sort()
  console.log(ids.join('\n'))
}
main().catch(e => { console.error(e.message || e); process.exit(1) })
