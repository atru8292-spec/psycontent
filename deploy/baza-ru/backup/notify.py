#!/usr/bin/env python3
# Письмо о сбое бэкапа через SMTP.bz: python3 notify.py "Тема" "Текст".
# Доступы SMTP берутся из /opt/supabase/.env (те же, что у писем входа), адрес получателя ALERT_TO из backup.env.
# Секреты не печатает. Код выхода 0, если письмо принято сервером SMTP.
import smtplib, ssl, sys
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, formatdate


def read_env(path):
    d = {}
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            d[k] = v.strip().strip('"\'')
    return d


env = read_env('/opt/supabase/.env')
cfg = read_env('/opt/supabase/backup/backup.env')
subject, body = sys.argv[1], sys.argv[2]

msg = EmailMessage()
msg['Subject'] = subject
msg['From'] = formataddr(('PsyCont, сервер базы', env.get('SMTP_ADMIN_EMAIL', 'noreply@psycont.ru')))
msg['To'] = cfg.get('ALERT_TO', 'atru8292@gmail.com')
msg['Date'] = formatdate(localtime=True)
msg['Message-ID'] = make_msgid(domain='psycont.ru')
msg.set_content(body)

with smtplib.SMTP(env['SMTP_HOST'], int(env.get('SMTP_PORT', '587')), timeout=30) as s:
    s.ehlo()
    s.starttls(context=ssl.create_default_context())
    s.ehlo()
    s.login(env['SMTP_USER'], env['SMTP_PASS'])
    s.send_message(msg)
print('письмо отправлено')
