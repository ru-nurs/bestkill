# Oldera.uz Game Site

Автономный Node-сайт для проекта `oldera.uz`.

Сайт больше не проксирует чужой проект и не показывает чужие серверы, игроков, чат, форум или новости.

## Запуск

```powershell
node server.js
```

## Оплата и автовыдача

Сайт готов к рабочей схеме: платежка подтверждает пополнение баланса, покупка списывает баланс и отправляет выдачу на сервер.

### Render Environment

```text
PUBLIC_BASE_URL=https://oldera.uz
ADMIN_PIN=секрет_для_ручного_пополнения
PAYMENT_WEBHOOK_SECRET=секрет_для_ручного_подтверждения_платежей

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
- Регистрация, вход, заявки магазина и обращения работают локально в тестовом режиме.
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
