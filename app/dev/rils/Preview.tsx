'use client'
// Клиентская часть /dev/rils (только разработка): настоящий FormatPane с ReelsScript на образцах рилсов
import { useSearchParams } from 'next/navigation'
import FormatPane, { type PaneItem } from '@/components/make/FormatPane'

const OBRAZCY: Record<string, { code: string; vid?: string; formatName?: string; text: string }> = {
  elena: {
    code: 'reels_scenka', vid: 'reels_scenka_dve_reakcii', formatName: 'Сценка: две реакции на одно',
    text: `Текст на экране: Вы отказали. Мама уже плохая мать.
Речь:
Я: Мам, я в воскресенье не приеду.
Мама: Конечно. Я же плохая мать, зачем ко мне приезжать.
Я, обычная реакция: Мам, ну при чем тут плохая мать? Я просто дома побыть хочу.
Я, после роликов про бережное общение: Мам, мне очень жаль, что ты так себя чувствуешь. Я благодарна тебе за все. Блядь, ладно, приеду.
Я: Мам, я в воскресенье не приеду.
Подпись: Собиралась отдохнуть дома. Теперь еду доказывать, что мама хорошая.`,
  },
  zahar: {
    code: 'reels_monolog', vid: 'reels_golova',
    text: `Текст на экране: «Успокойся». Охуенный способ помочь.
Речь: «Да успокойся ты уже». А ты до этой фразы вообще говорил спокойно. Ты попросил ее убрать телефон, потому что рассказываешь, как прошел день, а она третий раз спрашивает: «Что?» Ты повторил.
Подпись: Особенно прекрасно это «сразу завелся», когда ты уже несколько раз попросил об одном и том же.`,
  },
  bezslov: {
    code: 'reels_bez_slov', vid: 'reels_bez_slov', formatName: 'Беззвучный рилс, одна надпись',
    text: `Текст на экране: Коллега третий раз перебил тебя, и ты опять промолчал.
Дома она спросила: «Ты будешь ужинать?»
И ты заорал: «Можно меня хоть здесь не трогать?!»

Подпись: Ты сдерживался весь день и теперь считаешь, что дома имеешь право выпустить все, что накопилось.`,
  },
  stary: {
    code: 'reels_scenka',
    text: `Кадр: кухня, вечер, ты у окна
Текст на экране: Когда мама звонит в десятый раз
А (раздраженно): Мам, я на работе.
Б: Я только спросить, ты поела?
Экран 2: Она правда только спросить
Рисую: стрелка от тревоги к звонку
Подпись: Знакомо?`,
  },
}

export default function Preview() {
  const s = useSearchParams().get('s')
  const keys = s && OBRAZCY[s] ? [s] : Object.keys(OBRAZCY)
  return (
    <main className="min-h-[100dvh] bg-brand-bg px-4 pt-4 pb-8 max-w-2xl mx-auto space-y-10">
      {keys.map(k => {
        const o = OBRAZCY[k]
        const item: PaneItem = { format: 'reels', code: o.code, postId: null, text: o.text, baseline: o.text, publishedAt: null, formatName: o.formatName, vid: o.vid }
        return <section key={k} data-s={k}><FormatPane item={item} onChange={() => {}} onPublished={() => {}} onMore={() => {}} /></section>
      })}
    </main>
  )
}
