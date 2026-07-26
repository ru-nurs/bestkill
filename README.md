# BestKILL Node Copy

Локальное Node-зеркало сайта `https://bestkill.ru/`.

## Запуск

```powershell
node server.js
```

Открой:

```text
http://localhost:3000
```

## Прогрев кэша

```powershell
node scripts/warm-cache.mjs
```

Сервер переписывает ссылки `bestkill.ru` на локальные маршруты, кэширует загруженные HTML/CSS/JS/изображения в `.mirror-cache` и проксирует AJAX-запросы через Node.
