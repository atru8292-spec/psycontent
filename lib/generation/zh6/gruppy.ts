// Карточки видов на «Сделать» (zh6): виды каталога formaty.json сведены в 4-5 понятных групп на формат.
// Общий файл для экрана и сервера: экран показывает карточки, сервер по id карточки берет ее виды
// (если подвид не выбран, генератор подбирает вид внутри карточки под тему). Новый вид каталога добавлять сюда.
export type VidTip = 'reels' | 'carousel' | 'post'
export type Gruppa = { id: string; codes: string[] }

export const GRUPPY: Record<VidTip, Gruppa[]> = {
  reels: [
    { id: 'kamera', codes: ['reels_golova', 'reels_poslanie', 'reels_istoriya', 'reels_malysh', 'reels_neudobnye_voprosy', 'reels_otkrytye_voprosy', 'reels_perevod', 'bytovoy_primer', 'popkultura', 'reels_doska', 'reels_rol', 'reels_gayd_naoborot'] },
    { id: 'scenka', codes: ['reels_scenka_ya_psiholog', 'reels_scenka_pervaya_sessiya', 'reels_scenka_do_posle', 'reels_scenka_dve_reakcii', 'reels_scenka_vnutr_golos', 'reels_scenka_predmet', 'reels_govoryu_slyshit'] },
    { id: 'nadpisi', codes: ['reels_bez_slov', 'reels_kabinet', 'reels_ispoved'] },
    { id: 'spisok', codes: ['reels_spisok'] },
    { id: 'otvet', codes: ['reels_otvet'] },
  ],
  carousel: [
    { id: 'spisok', codes: ['carousel_spisok_priznakov', 'carousel_nabor_imena'] },
    { id: 'istoriya', codes: ['carousel_istoriya_dialog', 'carousel_govoryu_slyshit'] },
    { id: 'mysl', codes: ['carousel_odna_mysl', 'carousel_golos_iznutri', 'carousel_odna_shema'] },
    { id: 'razbor', codes: ['carousel_perevod', 'carousel_spor', 'carousel_obzor'] },
  ],
  post: [
    { id: 'korotko', codes: ['post_udar', 'post_povod'] },
    { id: 'istoriya', codes: ['post_kabinet', 'post_ispoved'] },
    { id: 'otvet', codes: ['post_direkt'] },
    { id: 'spor', codes: ['post_spor'] },
  ],
}

// тип каталога для формата экрана (Telegram берет виды поста)
export const tipOf = (f: string): VidTip | null => (f === 'reels' ? 'reels' : f === 'carousel' ? 'carousel' : f === 'post' || f === 'post_tg' ? 'post' : null)
export const gruppaById = (tip: VidTip, id: string) => GRUPPY[tip].find(g => g.id === id)
// карточка вида по коду (для блока «как снять» над готовым текстом)
export function gruppaOf(code: string): { tip: VidTip; g: Gruppa } | null {
  for (const tip of Object.keys(GRUPPY) as VidTip[]) { const g = GRUPPY[tip].find(x => x.codes.includes(code)); if (g) return { tip, g } }
  return null
}
