// Проверка Яндекс Метрики без браузера (17.11): какая цель на каком событии, без согласия ничего, /admin закрыт,
// «первые» цели один раз, cookie целей входа через Яндекс. npx tsx scripts/test-metrika.ts
import assert from 'node:assert/strict'

const store: Record<string, string> = {}
const ss: Record<string, string> = {}
const calls: unknown[][] = []
let cookie = ''
let firstsAnswer: Record<string, boolean> | null = { make: false, material: false, copy: false }
const g = globalThis as any
g.window = g
g.location = { hostname: 'psycont.ru', pathname: '/', href: 'https://psycont.ru/', search: '', reload() { g.__reloaded = true } }
g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } }
g.sessionStorage = { getItem: (k: string) => ss[k] ?? null, setItem: (k: string, v: string) => { ss[k] = v }, removeItem: (k: string) => { delete ss[k] } }
g.document = {
  referrer: '', head: { appendChild() {} }, querySelector: () => null, createElement: () => ({}),
  get cookie() { return cookie }, set cookie(v: string) { if (/Max-Age=0/.test(v)) cookie = '' },
}
g.fetch = async () => ({ ok: !!firstsAnswer, json: async () => firstsAnswer })

async function main() {
  const M = await import('../lib/metrika')
  const go = (path: string) => { g.location.pathname = path; g.location.href = 'https://psycont.ru' + path }
  const goals = () => calls.filter(c => c[1] === 'reachGoal').map(c => c[2])

  // без согласия ничего не грузится и цели не уходят
  assert.equal(M.loadMetrika(), false)
  M.goal('land_cta'); M.goalsFromTrack('land_cta_click', { place: 'hero' })
  assert.equal(g.ym, undefined, 'до согласия ym нет')

  // отказ: тоже ничего
  M.setConsent('no'); assert.equal(M.loadMetrika(), false)

  // /admin и /api закрыты даже с согласием
  M.setConsent('yes')
  for (const p of ['/admin', '/admin/oplata', '/api/health', '/dev/x']) { go(p); assert.equal(M.loadMetrika(), false, p) }
  assert.equal(M.metrikaPathAllowed('/administrator'), true)

  // согласие на лендинге: init с UTM
  go('/'); g.location.search = '?utm_source=vk'; g.location.href = 'https://psycont.ru/?utm_source=vk'
  M.rememberLandingUrl()
  assert.equal(M.loadMetrika(), true)
  const ym = g.ym
  g.ym = (...a: unknown[]) => { calls.push(a); return ym(...a) }
  assert.equal((ym.a[0] as any[])[1], 'init')
  assert.equal((ym.a[0] as any[])[2].url, 'https://psycont.ru/?utm_source=vk')
  assert.equal((ym.a[0] as any[])[2].webvisor, true)

  // цели из событий внутренней аналитики
  const cases: [string, Record<string, any> | undefined, string[]][] = [
    ['land_cta_click', { place: 'hero', plan: 'free' }, ['land_cta']],
    ['land_cta_click', { place: 'pricing', plan: 'calm' }, ['land_cta', 'plan_click']],
    ['onb_step_done', { step: 1 }, ['onb_step_1']], ['onb_step_done', { step: 2 }, ['onb_step_2']],
    ['onb_step_done', { step: 3 }, ['onb_step_3']], ['onb_step_done', { step: 4 }, ['onb_step_4']],
    ['onb_step_done', { step: 5 }, ['onb_step_5']], ['onb_skip', { step: 5 }, ['onb_step_5']],
    ['onb_step_done', { step: 6 }, []],
    ['onb_done', undefined, ['onb_done']],
    ['paywall_view', { where: 'limit' }, ['paywall_view']],
    ['plan_click', { plan: 'calm' }, ['plan_click']],
    ['auth_link_ok', { kind: 'signup' }, ['signup_done']],
    ['auth_link_ok', { kind: 'recovery' }, []],
    ['make_start', undefined, []],
  ]
  for (const [ev, props, want] of cases) {
    const n = calls.length
    M.goalsFromTrack(ev, props)
    assert.deepEqual(goals().slice(goals().length - (calls.length - n)), want, `${ev} ${JSON.stringify(props)}`)
  }

  // UTM-коды в целях регистрации, ничего лишнего
  cookie = 'psy_src=' + encodeURIComponent('src:vk|medium:cpc|campaign:nov|ref:other')
  M.goal('signup_submit')
  assert.deepEqual(calls.at(-1), [M.METRIKA_ID, 'reachGoal', 'signup_submit', { src: 'vk', medium: 'cpc', campaign: 'nov' }])
  M.goal('onb_done'); assert.equal(calls.at(-1)!.length, 4); assert.equal(calls.at(-1)![3], undefined, 'у остальных целей параметров нет')

  // вход через Яндекс: цели из cookie, cookie стирается
  cookie = 'psy_goal=login_yandex%2Csignup_done'
  let n = calls.length; M.goalsFromCookie()
  assert.deepEqual(calls.slice(n).map(c => c[2]), ['login_yandex', 'signup_done']); assert.equal(cookie, '')
  cookie = 'psy_goal=evil_goal'; n = calls.length; M.goalsFromCookie(); assert.equal(calls.length, n, 'чужие идентификаторы не уходят')

  // «первые» цели: один раз; если в базе уже было, не шлем
  go('/dashboard/make'); M.metrikaRoute()
  assert.deepEqual(calls.at(-1)!.slice(1, 3), ['hit', 'https://psycont.ru/dashboard/make'])
  n = calls.length
  await M.goalFirst('make'); await M.goalFirst('make'); await M.goalFirst('material')
  M.goalsFromTrack('material_take', { how: 'copy' }); await new Promise(r => setTimeout(r, 10))
  M.goalsFromTrack('material_take', { how: 'copy_caption' }); await new Promise(r => setTimeout(r, 10))
  M.goalsFromTrack('material_take', { how: 'published' })
  assert.deepEqual(calls.slice(n).map(c => c[2]), ['make_first_click', 'first_material', 'first_copy'])

  // хит при переходе, и уход в /admin без перезагрузки: страница перезагружается без Метрики
  go('/dashboard/settings'); M.metrikaRoute(); assert.equal(calls.at(-1)![1], 'hit')
  go('/admin'); M.goal('plan_click'); assert.notEqual(calls.at(-1)![2], 'plan_click', 'в /admin цели не уходят')
  M.metrikaRoute(); assert.equal(g.__reloaded, true)

  // оплата: цель после подтверждения сервером, один раз на платеж
  go('/dashboard/oplata/itog'); g.location.search = '?p=0f8fad5b-d9cb-469f-a165-70867728950e'
  n = calls.length
  M.goalsFromTrack('feature_open', { feature: 'pay_itog_checking' })
  M.goalsFromTrack('feature_open', { feature: 'pay_itog_done' }); M.goalsFromTrack('feature_open', { feature: 'pay_itog_done' })
  assert.deepEqual(calls.slice(n).map(c => c[2]), ['pay_success'])
  g.location.search = ''

  // токены из адресов входа в Метрику не уходят, метки остаются
  assert.equal(M.cleanUrl('https://psycont.ru/auth/podtverdit?token_hash=abc&type=signup#access_token=x'), 'https://psycont.ru/auth/podtverdit')
  assert.equal(M.cleanUrl('https://psycont.ru/?utm_source=vk&email=a@b.ru&yclid=5'), 'https://psycont.ru/?utm_source=vk&yclid=5')
  go('/auth/novyy-parol'); g.location.href = 'https://psycont.ru/auth/novyy-parol?code=secret'; M.metrikaRoute()
  assert.equal(calls.at(-1)![2], 'https://psycont.ru/auth/novyy-parol')

  // идентификаторы целей ровно как в Метрике
  assert.deepEqual([...M.GOALS].sort(), ['first_copy', 'first_material', 'land_cta', 'land_signup_open', 'login_yandex', 'make_first_click',
    'onb_done', 'onb_step_1', 'onb_step_2', 'onb_step_3', 'onb_step_4', 'onb_step_5', 'pay_success', 'paywall_view', 'plan_click',
    'signup_done', 'signup_submit'])
  console.log('test-metrika: все проверки прошли')
}

main().catch(e => { console.error(e); process.exit(1) })
