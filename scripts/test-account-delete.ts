// Тест удаления аккаунта (16.11) без базы: порядок шагов, фото до аккаунта, чужие пути не трогаем,
// при сбое фото аккаунт не удаляется, событие без текстов. npx tsx scripts/test-account-delete.ts
import assert from 'node:assert/strict'
import { deleteAccount, cleanReasons, type DeleteDeps } from '../lib/account-delete'

const ID = '11111111-2222-3333-4444-555555555555'
function make(opts: { photos?: string[]; removeFails?: boolean; userFails?: boolean; keepAfter?: boolean } = {}) {
  const log: string[] = []
  let files = [...(opts.photos || [])]
  const deps: DeleteDeps = {
    listPhotos: async () => { log.push('list'); return files },
    removePhotos: async (p) => { log.push('remove:' + p.join('|')); if (opts.removeFails) throw new Error('x'); if (!opts.keepAfter) files = files.filter(f => !p.includes(f)) },
    stats: async () => ({ days: 3, materials: 7 }),
    logEvent: async (props) => { log.push('event:' + JSON.stringify(props)) },
    deleteUser: async () => { log.push('user'); if (opts.userFails) throw new Error('y') },
  }
  return { deps, log }
}

;(async () => {
  // 1. обычный путь: фото, событие, аккаунт, по порядку
  let t = make({ photos: [`${ID}/photo-1.jpg`, `${ID}/avatar-2.png`, `другой/photo.jpg`] })
  let r = await deleteAccount(ID, ['dorogo', 'neudob'], t.deps)
  assert.deepEqual(r, { ok: true, photos: 2 })
  assert.equal(t.log[1], `remove:${ID}/photo-1.jpg|${ID}/avatar-2.png`, 'чужой путь не удаляется')
  assert.ok(t.log.findIndex(x => x.startsWith('event')) < t.log.indexOf('user'))
  assert.equal(t.log.at(-1), 'user')
  assert.ok(t.log.some(x => x === 'event:{"reason":"dorogo,neudob","days":3,"materials":7}'))

  // 2. без фото и без причин
  t = make(); r = await deleteAccount(ID, [], t.deps)
  assert.deepEqual(r, { ok: true, photos: 0 }); assert.ok(t.log.some(x => x.includes('"reason":"net"')))

  // 3. фото не удалились: аккаунт не трогаем
  t = make({ photos: [`${ID}/a.jpg`], removeFails: true }); r = await deleteAccount(ID, [], t.deps)
  assert.deepEqual(r, { ok: false, step: 'photos' }); assert.ok(!t.log.includes('user'))
  t = make({ photos: [`${ID}/a.jpg`], keepAfter: true }); r = await deleteAccount(ID, [], t.deps)
  assert.deepEqual(r, { ok: false, step: 'photos' }); assert.ok(!t.log.includes('user'), 'фото остались, а аккаунт удален')

  // 4. аккаунт не удалился
  t = make({ userFails: true }); r = await deleteAccount(ID, [], t.deps)
  assert.deepEqual(r, { ok: false, step: 'user' })

  // 4б. оплата: гасится первой; если не вышло, аккаунт и фото не трогаем
  { const t = make({ photos: [`${ID}/a.jpg`] }); const order: string[] = []
    t.deps.cancelBilling = async () => { order.push('billing') }
    const orig = t.deps.listPhotos; t.deps.listPhotos = async (u) => { order.push('photos'); return orig(u) }
    assert.deepEqual(await deleteAccount(ID, [], t.deps), { ok: true, photos: 1 }); assert.equal(order[0], 'billing') }
  { const t = make({ photos: [`${ID}/a.jpg`] }); t.deps.cancelBilling = async () => { throw new Error('db') }
    assert.deepEqual(await deleteAccount(ID, [], t.deps), { ok: false, step: 'billing' }); assert.ok(!t.log.includes('user') && !t.log.some(x => x.startsWith('remove'))) }

  // 5. причины только из словаря
  assert.deepEqual(cleanReasons(['dorogo', 'dorogo', 'Мария Иванова', 5, 'drugoe']), ['dorogo', 'drugoe'])
  assert.deepEqual(cleanReasons('dorogo'), [])
  assert.ok(['tekst', 'dorogo', 'vremya', 'pozzhe', 'neudob', 'drugoe'].join(',').length <= 40, 'все причины влезают в 40 знаков санитайзера')
  console.log('test-account-delete: ок')
})()
