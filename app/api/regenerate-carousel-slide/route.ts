import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { buildProfileContext } from '@/lib/profile-context'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env variables')
  return createClient(url, key)
}

const SYSTEM_PROMPT = `Ты редактируешь ОДИН слайд карусели для психолога.
Нужно вернуть только улучшенный текст текущего слайда.

Правила:
- Без JSON
- Без кавычек и пояснений
- 1 слайд = 1 идея
- 10-40 слов
- Язык живой, конкретный, без шаблонов
- Учитывай позицию слайда в карусели (хук/развитие/инсайт/CTA).`

export async function POST(req: NextRequest) {
  try {
    const { userId, topic, pillar, slideNumber, totalSlides, currentSlideText, allSlides, model } = await req.json()

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (!slideNumber || !totalSlides) {
      return NextResponse.json({ error: 'slideNumber and totalSlides required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: profile } = await supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    const profileContext = buildProfileContext(profile || {})
    const contextSlides = Array.isArray(allSlides)
      ? allSlides
          .map((s: any, i: number) => `[Слайд ${i + 1}] ${typeof s?.text === 'string' ? s.text : ''}`)
          .join('\n')
      : ''

    const prompt = `${profileContext}

Тема: ${topic || 'Карусель для психолога'}
Рубрика: ${pillar || 'Карусель'}
Текущий слайд: ${slideNumber} из ${totalSlides}

ТЕКСТ ТЕКУЩЕГО СЛАЙДА:
${currentSlideText || ''}

ВЕСЬ КОНТЕКСТ КАРУСЕЛИ:
${contextSlides}

Перепиши только слайд ${slideNumber}, чтобы он лучше держал внимание и логично продолжал соседние слайды.`

    const text = await generateWithAI(SYSTEM_PROMPT, prompt, {
      model,
      max_tokens: 220,
      temperature: 0.7,
    })

    return NextResponse.json({ text: (text || '').trim() })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Не удалось перегенерировать слайд' },
      { status: 500 }
    )
  }
}
