# Перенос OLDERA.UZ на HOSTIN.UZ / hosting.uz

Сайт `oldera.uz` является Node.js приложением. Для полного переноса нужен хостинг, который умеет запускать Node.js 20+ приложения с постоянным процессом.

Обычный PHP/HTML файловый хостинг не подойдет для этого проекта, потому что сайту нужны:

- Node.js сервер `server.js`;
- переменные окружения;
- подключение к PostgreSQL `MAIN_DB`;
- RCON к CS 1.6 серверу;
- API для регистрации, входа, заказов, админ-панели и банов.

## Что спросить у поддержки HOSTIN.UZ

Напиши им:

```text
Здравствуйте. Нужно перенести сайт oldera.uz. Проект написан на Node.js.
Нужны Node.js 20+, npm install, запуск команды npm start, переменные окружения и порт из env PORT.
На тарифе "Веб-сайты" это поддерживается или нужен VDS/VPS?
```

Если ответят, что Node.js не поддерживается, сайт надо переносить на VDS/VPS, а не в раздел "Веб-сайты".

## Если Node.js поддерживается

Настройки приложения:

```text
Node.js version: 20 или выше
Install command: npm install --omit=dev
Start command: npm start
App entry: server.js
Port: брать из переменной PORT
Root directory: папка проекта
```

## Переменные окружения

Скопируй значения из Render Environment в HOSTIN.UZ. Минимальный набор:

```text
PUBLIC_BASE_URL=https://oldera.uz
MAIN_DB=postgresql://...

ADMIN_PIN=...

PAYMENT_CARD_HOLDER=...
PAYMENT_CARD_NUMBER=...
PAYMENT_CARD_TYPE=UZCARD
PAYMENT_SUPPORT_URL=https://t.me/olderauz_Admin

RCON_HOST=195.158.4.108
RCON_PORT=27047
RCON_PASSWORD=...

SERVICE_COMMANDS_JSON=...
UNBAN_COMMAND_TEMPLATE=amx_unban "{target}"

AMXBANS_DB_HOST=195.158.4.108
AMXBANS_DB_PORT=3306
AMXBANS_DB_USER=gs325
AMXBANS_DB_PASSWORD=...
AMXBANS_DB_NAME=gs325
AMXBANS_TABLE_PREFIX=amx_
```

Если какие-то переменные оплаты Click/Payme не используются, их можно не переносить.

## Файлы для загрузки

Загружать нужно:

```text
server.js
package.json
package-lock.json
public/
scripts/
```

Не нужно загружать:

```text
.git/
node_modules/
data/
.mirror-cache/
server-configs/
```

`node_modules` должен установиться командой `npm install --omit=dev` уже на хостинге.

## DNS

Когда Node-приложение на HOSTIN.UZ запущено и проверено по временному адресу:

1. В DNS домена `oldera.uz` поменять `A` запись `@` на IP хостинга:

```text
90.156.195.107
```

2. Для `www` поставить либо `CNAME` на `oldera.uz`, либо `A` на тот же IP:

```text
90.156.195.107
```

3. Дождаться обновления DNS и SSL.

## Проверка после запуска

Открыть:

```text
https://oldera.uz/api/integration/status
```

Должно быть:

```text
persistence: postgresql
mainDb.connected: true
rcon: true
```

Потом проверить:

```text
https://oldera.uz/api/server-live
https://oldera.uz/account
https://oldera.uz/admin/orders
```

