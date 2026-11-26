// Паспорт бренда убран 26.11.2026 (решение Арины): новый генератор его не читает, в старых он шел в промпт кусками
// на 500-1000 знаков. Старые ссылки и закладки ведут в «Настройки». Таблицы brand_passports и brand_passport_drafts
// в базе удалены 26.11 (миграция 20261126120000_udalit_pasport.sql).
import { redirect } from 'next/navigation'

export default function BrandPassportGone() {
  redirect('/dashboard/settings')
}
