# Oldera.uz Game Site

Автономный Node-сайт для проекта `oldera.uz`.

Сайт больше не проксирует чужой проект и не показывает чужие серверы, игроков, чат, форум или новости.

## Запуск

```powershell
node server.js
```

## Оплата и автовыдача

Сайт поддерживает ручной перевод на карту с автоматической выдачей после проверки:

1. Покупатель выбирает услугу и видит реквизиты.
2. После перевода он прикладывает чек.
3. Владелец открывает `/admin/orders` и нажимает «Подтвердить и выдать».
4. Сайт отправляет команду выдачи через Admin API или RCON.

### Render Environment

```text
PUBLIC_BASE_URL=https://oldera.uz
ADMIN_PIN=секрет_для_ручного_пополнения
PAYMENT_WEBHOOK_SECRET=секрет_для_ручного_подтверждения_платежей

# Ручной перевод на карту
PAYMENT_CARD_NUMBER=8600123412341234
PAYMENT_CARD_HOLDER=ИМЯ ПОЛУЧАТЕЛЯ
PAYMENT_CARD_TYPE=UZCARD
PAYMENT_SUPPORT_URL=https://t.me/username

# Постоянное хранение данных на Render
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=секретный_service_role_key

# Click
CLICK_SERVICE_ID=ваш_service_id
CLICK_MERCHANT_ID=ваш_merchant_id
CLICK_SECRET_KEY=ваш_secret_key

# Payme
PAYME_MERCHANT_ID=ваш_merchant_id
PAYME_SECRET_KEY=ваш_secret_key

# Выдача на сервер через API хостинга/плагина
ADMIN_API_URL=https://example.com/api/issue
ADMIN_API_KEY=секретный_токен

# или выдача через RCON
RCON_HOST=195.158.4.108
RCON_PORT=27047
RCON_PASSWORD=пароль_rcon

# Команды выдачи. {target} = SteamID или ник, {days} = срок, {login} = логин сайта
SERVICE_COMMANDS_JSON={"vip":"amx_addvip \"{target}\" {days}","admin":"amx_addadmin \"{target}\" \"abcdefghijklmnopqrstu\" \"{days}\"","immunity":"amx_addimmune \"{target}\" {days}","prefix":"amx_addprefix \"{target}\" \"{login}\" {days}"}
DEFAULT_SERVICE_COMMAND=amx_service_issue "{service}" "{target}" {days}

# Баны и платный разбан
BAN_API_URL=https://example.com/api/bans
BAN_API_KEY=секрет_бан_api
SERVER_WEBHOOK_SECRET=секрет_для_сервера
UNBAN_PRICE=30000
UNBAN_COMMAND_TEMPLATE=amx_unban "{target}"
```

## Связь с CS 1.6 сервером

Сайт уже умеет работать с сервером `195.158.4.108:27047` в таком режиме:

- `/api/server-live` возвращает карту, онлайн, игроков из RCON `status`, баны, активные услуги и группы администрации;
- `/stats` показывает живую статистику и обновляется автоматически;
- `/admins` показывает роли из профилей сайта и активных услуг, выданных через магазин;
- `/banlist` принимает реальные баны через webhook и обновляется автоматически.

Минимум для связи:

```text
RCON_HOST=195.158.4.108
RCON_PORT=27047
RCON_PASSWORD=ваш_rcon_password_из_server.cfg
SERVER_WEBHOOK_SECRET=любой_длинный_секрет
UNBAN_COMMAND_TEMPLATE=amx_unban "{target}"
```

Чтобы сервер или админ-панель отправляли бан на сайт:

```bash
curl -X POST https://oldera.uz/api/server/ban-event \
  -H "Content-Type: application/json" \
  -H "x-server-secret: SERVER_WEBHOOK_SECRET" \
  -d '{"player":"Nick","steamId":"STEAM_0:1:12345","reason":"Cheats","duration":"7 дней","bannedUntil":"2026-08-07T12:00:00.000Z","admin":"Admin"}'
```

Если на сервере стоит AMXBans/FreshBans или свой AMXX-плагин, его нужно настроить так, чтобы при бане он делал такой POST-запрос. Если у хостинга появится готовый API банов, вместо webhook можно указать `BAN_API_URL`.

### Callback URL

- Click callback: `https://oldera.uz/api/payments/click`
- Payme Merchant API: `https://oldera.uz/api/payments/payme`
- Webhook банов от сервера: `https://oldera.uz/api/server/ban-event`

Если API хостинга принимает другой формат, поменяйте `ADMIN_API_URL` на URL вашего обработчика. Сайт отправляет JSON с `action`, `server`, `order`, `ban` и готовой строкой `command`.

Открой:

```text
http://localhost:3000
```

## Проверка страниц

```powershell
npm run check
```

## Что внутри

- Бренд заменен на `OLDERA.UZ`.
- Основной сервер: `195.158.4.108:27047` (`Oldera Zombie Server`).
- Разделы сохранены: главная, магазин, баны, администраторы, правила, чат, статистика, поддержка.
- Списки игроков, администраторов, банов, форума и новостей очищены.
- Регистрация сразу авторизует пользователя и открывает личный кабинет `/account`.
- Вход, выход, заявки магазина и обращения работают через API сайта.
- Есть внутренний баланс пользователя и ручное пополнение админом через `ADMIN_PIN`.

## Что нужно для реальной покупки

Чтобы покупка на сайте автоматически выдавала привилегию на CS-сервер, нужно подключить:

- платежную систему;
- базу данных, например Supabase;
- доступ к серверу через RCON, AMXX-плагин, GameCMS API или другой механизм выдачи услуг.

## ADMIN_PIN

Для ручного пополнения баланса на странице `/balance` добавь переменную окружения на Render:

```text
ADMIN_PIN=любой_секретный_код
```

Этот же PIN открывает панель проверки переводов:

```text
https://oldera.uz/admin/orders
```

## Supabase

Выполни содержимое `supabase.sql` в Supabase SQL Editor, затем добавь
`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` в Render Environment. Ключ
`service_role` нельзя добавлять в браузерный код или GitHub.
