-- 26.11.2026: бренд-паспорт убран из продукта (решение Арины), таблицы больше никто не читает.
-- ПРИМЕНЕНА 26.11 на db.psycont.ru вручную. Копия перед удалением (3 строки brand_passports, 0 черновиков):
-- psycont@141.133.187.249:~/kopii/brand_passport-pered-udaleniem-20261126.dump (pg_dump -Fc, права 600).
drop table if exists public.brand_passport_drafts;
drop table if exists public.brand_passports;
