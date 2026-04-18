import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWithAI } from '@/lib/openrouter'
import { buildProfileContext } from '@/lib/profile-context'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { userId, batch = 1 } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    const [profileRes, passportRes, existingPlanRes] = await Promise.all([
      supabaseAdmin.from('onboarding_profiles').select('*').eq('user_id', userId).single(),
      supabaseAdmin.from('brand_passports').select('content').eq('user_id', userId).single(),
      supabaseAdmin.from('content_plans').select('plan').eq('user_id', userId).single()
    ])

    const profile = profileRes.data
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const passport = passportRes.data?.content || ''
    const existingPlan = existingPlanRes.data?.plan || []
    
    // Определяем какие дни генерируем
    const startDay = (batch - 1) * 10 + 1
    const endDay = batch * 10

    const systemPrompt = `Ты контент-стратег для психологов. Создай план на дни ${startDay}-${endDay}.

РУБРИКИ (распредели равномерно):
- Психообразование — объясни что болит и почему
- Истории — случаи из практики  
- Личное — рефлексия, путь в профессию
- Практика — техники и упражнения
- Позиционирование — как я работаю

ФОРМАТЫ: post, carousel, reels, stories (чередуй)

ХУКИ — цепляющие, НЕ банальные:
✓ "Если вы когда-нибудь извинялись за то что расстроились..."
✓ "Чем больше стараетесь не тревожиться — тем сильнее тревога"
✗ НЕ используй: "Как справиться с...", "5 признаков...", "А вы знали?"

Верни ТОЛЬКО JSON массив из 10 объектов:
[{"day":${startDay},"pillar":"Психообразование","topic":"тема","format":"post","hook":"цепляющий хук","tip":"подсказка"}]`

    const userPrompt = `Психолог: ${profile.name || 'Психолог'}
Ниша: ${profile.niche || 'общая практика'}
Подходы: ${Array.isArray(profile.approaches) ? profile.approaches.slice(0, 3).join(', ') : 'интегративный'}
Аудитория: ${profile.target_audience || 'взрослые'}
Боли клиентов: ${profile.client_pain_phrases || 'тревога, отношения, самооценка'}
Тон: ${profile.tone_of_voice || 'тёплый, профессиональный'}
Обращение: ${profile.appeal || 'на вы'}
${profile.video_attitude === 'не снимаю' ? 'НЕ использовать reels — заменить на post/carousel/stories' : ''}

${passport ? `Из паспорта: ${passport.substring(0, 400)}` : ''}

Создай дни ${startDay}-${endDay}. Верни только JSON массив из 10 объектов.`

    const result = await generateWithAI(systemPrompt, userPrompt)

    // Parse JSON
    let newDays
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No JSON array found')
      newDays = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error('AI не вернул валидный JSON')
    }

    if (!Array.isArray(newDays) || newDays.length < 5) {
      throw new Error(`AI вернул ${newDays?.length || 0} дней вместо 10`)
    }

    // Нормализуем
    newDays = newDays.map((item: any, index: number) => ({
      day: item.day || startDay + index,
      pillar: item.pillar || 'Психообразование',
      topic: item.topic || 'Тема поста',
      format: ['post', 'carousel', 'reels', 'stories'].includes(item.format) ? item.format : 'post',
      hook: item.hook || '',
      tip: item.tip || '',
      done: false,
    }))

    // Объединяем с существующим планом
    let fullPlan: any[]
    if (batch === 1) {
      // Первый batch — начинаем заново
      fullPlan = newDays
    } else {
      // Добавляем к существующему
      fullPlan = [...existingPlan.filter((d: any) => d.day < startDay), ...newDays]
    }

    // Сохраняем
    await supabaseAdmin
      .from('content_plans')
      .upsert({
        user_id: userId,
        plan: fullPlan,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    return NextResponse.json({ 
      plan: fullPlan,
      batch,
      complete: batch >= 3
    })

  } catch (error: any) {
    console.error('Content plan error:', error)
    return NextResponse.json({ error: error.message || 'Ошибка генерации' }, { status: 500 })
  }
}
