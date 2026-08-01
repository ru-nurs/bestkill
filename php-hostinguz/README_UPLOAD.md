# OLDERA.UZ PHP версия для HOSTIN.UZ

Эта папка предназначена для обычного shared-хостинга HOSTIN.UZ, где есть PHP + MySQL, но нет Node.js.

## Что загрузить

Загрузить содержимое папки `php-hostinguz` в:

```text
/home/ws141/sites/oldera.uz/
```

В корне сайта должны лежать:

```text
index.php
install.php
config.example.php
.htaccess
assets/
```

## Настройка config.php

1. Скопировать:

```text
config.example.php -> config.php
```

2. В `config.php` заменить:

```text
MYSQL_DATABASE_HERE
MYSQL_USER_HERE
MYSQL_PASSWORD_HERE
RCON_PASSWORD_HERE
AMXBANS_PASSWORD_HERE
CHANGE_ME_LONG_PIN
```

MySQL базу нужно создать в панели HOSTIN.UZ в разделе `БД`.

## Проверка

Открыть:

```text
http://oldera.uz/install.php
```

Должно быть:

```text
MySQL подключен, таблица app_state готова.
RCON UDP challenge работает.
```

Потом открыть:

```text
http://oldera.uz/
http://oldera.uz/store
http://oldera.uz/account
http://oldera.uz/admin/orders
```

## После установки

Удалить с хостинга:

```text
install.php
README_UPLOAD.md
```

