<?php
declare(strict_types=1);

const APP_NAME = 'OLDERA.UZ';
const APP_DOMAIN = 'oldera.uz';
const SESSION_COOKIE = 'oldera_session';
const SESSION_TTL = 2592000;

error_reporting(E_ALL);
ini_set('display_errors', '0');

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.example.php';
}
$config = require $configPath;

function h(mixed $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function app_config(?string $key = null): mixed {
    global $config;
    return $key === null ? $config : ($config[$key] ?? null);
}

function pdo_from(array $db): PDO {
    $host = $db['host'] ?? 'localhost';
    $port = (int)($db['port'] ?? 3306);
    $name = $db['name'] ?? '';
    $charset = $db['charset'] ?? 'utf8mb4';
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";
    return new PDO($dsn, (string)($db['user'] ?? ''), (string)($db['pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $pdo = pdo_from(app_config('db'));
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_state (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    return $pdo;
}

function empty_db(): array {
    return [
        'users' => [],
        'sessions' => [],
        'orders' => [],
        'tickets' => [],
        'topups' => [],
        'payments' => [],
        'bans' => [],
        'messages' => [],
        'friendships' => [],
        'notifications' => [],
        'wallPosts' => [],
    ];
}

function normalize_db(array $db): array {
    $base = empty_db();
    foreach ($base as $key => $value) {
        if (!isset($db[$key]) || !is_array($db[$key])) $db[$key] = $value;
    }
    foreach ($db['users'] as &$user) {
        if (!isset($user['profile']) || !is_array($user['profile'])) $user['profile'] = [];
    }
    return $db;
}

function read_db(): array {
    $stmt = db()->prepare('SELECT data FROM app_state WHERE id = ? LIMIT 1');
    $stmt->execute(['oldera']);
    $row = $stmt->fetch();
    if (!$row) return empty_db();
    $decoded = json_decode((string)$row['data'], true);
    return normalize_db(is_array($decoded) ? $decoded : []);
}

function write_db(array $db): void {
    $payload = json_encode(normalize_db($db), JSON_UNESCAPED_UNICODE);
    $stmt = db()->prepare('INSERT INTO app_state (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)');
    $stmt->execute(['oldera', $payload]);
}

function request_data(): array {
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== false) {
        $data = json_decode(file_get_contents('php://input') ?: '{}', true);
        return is_array($data) ? $data : [];
    }
    return $_POST ?: $_GET;
}

function now_iso(): string {
    return gmdate('Y-m-d\TH:i:s\Z');
}

function uuid(): string {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function token_hash(string $token): string {
    return hash('sha256', $token);
}

function find_user(array $db, string $login): ?array {
    foreach ($db['users'] as $user) {
        if (strcasecmp((string)($user['login'] ?? ''), $login) === 0) return $user;
    }
    return null;
}

function public_user(array $user): array {
    return [
        'login' => $user['login'] ?? '',
        'email' => $user['email'] ?? '',
        'balance' => (int)($user['balance'] ?? 0),
        'role' => $user['role'] ?? 'Пользователь',
        'createdAt' => $user['createdAt'] ?? '',
        'profile' => $user['profile'] ?? [],
    ];
}

function create_session(array &$db, array $user): string {
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $expires = time() + SESSION_TTL;
    $db['sessions'] = array_values(array_filter($db['sessions'], fn($s) => strtotime($s['expiresAt'] ?? '') > time()));
    $db['sessions'][] = [
        'id' => token_hash($token),
        'userLogin' => $user['login'],
        'createdAt' => now_iso(),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expires),
    ];
    return $token;
}

function set_session_cookie(string $token): void {
    setcookie(SESSION_COOKIE, $token, [
        'expires' => time() + SESSION_TTL,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clear_session_cookie(): void {
    setcookie(SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function current_user(array $db): ?array {
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!$token) return null;
    $hash = token_hash((string)$token);
    foreach ($db['sessions'] as $session) {
        if (($session['id'] ?? '') === $hash && strtotime($session['expiresAt'] ?? '') > time()) {
            return find_user($db, (string)$session['userLogin']);
        }
    }
    return null;
}

function update_user(array &$db, string $login, callable $fn): ?array {
    foreach ($db['users'] as &$user) {
        if (strcasecmp((string)$user['login'], $login) === 0) {
            $fn($user);
            return $user;
        }
    }
    return null;
}

function add_notification(array &$db, string $login, string $text, string $type = 'info'): void {
    $db['notifications'][] = [
        'id' => uuid(),
        'login' => $login,
        'text' => $text,
        'type' => $type,
        'createdAt' => now_iso(),
        'read' => false,
    ];
}

function services(): array {
    return [
        ['id' => 'vip', 'name' => 'VIP', 'image' => '/assets/shop-service.png', 'tariffs' => [['7 дней', 15000], ['30 дней', 45000], ['60 дней', 80000]]],
        ['id' => 'admin', 'name' => 'Admin', 'image' => '/assets/shop-service.png', 'tariffs' => [['7 дней', 30000], ['30 дней', 90000]]],
        ['id' => 'immunity', 'name' => 'Иммунитет', 'image' => '/assets/shop-service.png', 'tariffs' => [['7 дней', 20000], ['30 дней', 65000], ['60 дней', 115000]]],
        ['id' => 'skin_joker', 'name' => 'Скин «Joker»', 'image' => '/assets/skins/joker.webp', 'tariffs' => [['30 дней', 40000], ['Навсегда', 160000]]],
        ['id' => 'skin_deadpool', 'name' => 'Скин «Deadpool»', 'image' => '/assets/skins/deadpool.webp', 'tariffs' => [['30 дней', 45000], ['Навсегда', 170000]]],
        ['id' => 'skin_snegovik', 'name' => 'Скин «Snegovik»', 'image' => '/assets/skins/snegovik.webp', 'tariffs' => [['30 дней', 35000], ['Навсегда', 150000]]],
        ['id' => 'skin_neo', 'name' => 'Скин «Neo»', 'image' => '/assets/skins/neo.webp', 'tariffs' => [['30 дней', 35000], ['Навсегда', 150000]]],
        ['id' => 'skin_crysis', 'name' => 'Скин «Crysis»', 'image' => '/assets/skins/crysis.webp', 'tariffs' => [['30 дней', 35000], ['Навсегда', 150000]]],
        ['id' => 'skin_scream', 'name' => 'Скин «Scream»', 'image' => '/assets/skins/scream.webp', 'tariffs' => [['30 дней', 35000], ['Навсегда', 150000]]],
        ['id' => 'skin_shadow', 'name' => 'Скин «Shadow»', 'image' => '/assets/skins/shadow.webp', 'tariffs' => [['30 дней', 35000], ['Навсегда', 150000]]],
    ];
}

function find_service(string $id): ?array {
    foreach (services() as $service) {
        if ($service['id'] === $id) return $service;
    }
    return null;
}

function find_tariff(array $service, mixed $value): ?array {
    if (is_numeric($value) && isset($service['tariffs'][(int)$value])) return $service['tariffs'][(int)$value];
    foreach ($service['tariffs'] as $tariff) {
        if ($tariff[0] === $value) return $tariff;
    }
    return null;
}

function money(int|float $value): string {
    return number_format((float)$value, 0, '.', ' ') . ' сум';
}

function days_from_tariff(string $tariff): int {
    preg_match('/\d+/', $tariff, $m);
    return isset($m[0]) ? (int)$m[0] : 0;
}

function render_template(string $template, array $values): string {
    return preg_replace_callback('/\{(\w+)\}/', fn($m) => (string)($values[$m[1]] ?? ''), $template);
}

function issue_command(array $order): string {
    $commands = app_config('service_commands') ?: [];
    $template = $commands[$order['service'] ?? ''] ?? '';
    if (!$template) return '';
    $target = $order['steamId'] ?: ($order['nickname'] ?: $order['login']);
    return render_template($template, [
        'target' => $target,
        'login' => $order['login'] ?? '',
        'nickname' => $order['nickname'] ?? '',
        'steamId' => $order['steamId'] ?? '',
        'service' => $order['service'] ?? '',
        'days' => days_from_tariff((string)($order['tariffName'] ?? '')),
        'price' => $order['price'] ?? 0,
    ]);
}

function rcon_command(string $command): array {
    $rcon = app_config('rcon') ?: [];
    $host = (string)($rcon['host'] ?? '');
    $port = (int)($rcon['port'] ?? 27015);
    $password = (string)($rcon['password'] ?? '');
    if (!$host || !$password || !$command) return ['ok' => false, 'message' => 'RCON is not configured'];

    $socket = @stream_socket_client("udp://{$host}:{$port}", $errno, $errstr, 3, STREAM_CLIENT_CONNECT);
    if (!$socket) return ['ok' => false, 'message' => "RCON socket error: {$errstr}"];
    stream_set_timeout($socket, 3);
    fwrite($socket, "\xFF\xFF\xFF\xFFchallenge rcon\n");
    $challengePacket = fread($socket, 4096);
    if (!$challengePacket || !preg_match('/challenge rcon\s+(-?\d+)/', $challengePacket, $m)) {
        fclose($socket);
        return ['ok' => false, 'message' => 'RCON challenge was not returned'];
    }
    fwrite($socket, "\xFF\xFF\xFF\xFFrcon {$m[1]} \"{$password}\" {$command}\n");
    usleep(350000);
    $response = '';
    while (!feof($socket)) {
        $chunk = fread($socket, 4096);
        if ($chunk === '' || $chunk === false) break;
        $response .= preg_replace('/^\xFF{4}/', '', $chunk);
        $meta = stream_get_meta_data($socket);
        if (!empty($meta['timed_out'])) break;
    }
    fclose($socket);
    $message = trim($response) ?: 'RCON command sent';
    return ['ok' => !preg_match('/bad rcon_password|invalid password/i', $message), 'message' => $message];
}

function server_status(): array {
    $result = rcon_command('status');
    $status = ['name' => 'Oldera Zombie Server', 'address' => '195.158.4.108:27047', 'map' => 'Не определено', 'players' => 0, 'maxPlayers' => 32, 'online' => $result['ok'], 'rcon' => $result['ok']];
    $raw = $result['message'] ?? '';
    if (preg_match('/map\s*:\s*([^\s]+)/i', $raw, $m)) $status['map'] = $m[1];
    if (preg_match('/players\s*:\s*(\d+)\s+active\s+\((\d+)\s+max\)/i', $raw, $m)) {
        $status['players'] = (int)$m[1];
        $status['maxPlayers'] = (int)$m[2];
    }
    return $status;
}

function amxbans_pdo(): ?PDO {
    $cfg = app_config('amxbans') ?: [];
    if (empty($cfg['enabled'])) return null;
    try {
        return pdo_from([
            'host' => $cfg['host'] ?? '',
            'port' => $cfg['port'] ?? 3306,
            'name' => $cfg['name'] ?? '',
            'user' => $cfg['user'] ?? '',
            'pass' => $cfg['pass'] ?? '',
            'charset' => 'utf8mb4',
        ]);
    } catch (Throwable) {
        return null;
    }
}

function table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
    $stmt->execute([$table]);
    return (bool)$stmt->fetch();
}

function get_bans(array $db): array {
    $items = $db['bans'];
    $pdo = amxbans_pdo();
    $prefix = (string)((app_config('amxbans')['prefix'] ?? 'amx_'));
    if ($pdo && table_exists($pdo, "{$prefix}bans")) {
        $rows = $pdo->query("SELECT * FROM `{$prefix}bans` ORDER BY `bid` DESC LIMIT 250")->fetchAll();
        foreach ($rows as $row) {
            $created = (int)($row['ban_created'] ?? 0);
            $length = (int)($row['ban_length'] ?? 0);
            $until = $length > 0 && $created > 0 ? gmdate('Y-m-d\TH:i:s\Z', $created + $length * 60) : '';
            $items[] = [
                'id' => 'amxbans:' . ($row['bid'] ?? uniqid()),
                'player' => $row['player_nick'] ?? 'Unknown',
                'steamId' => $row['player_id'] ?? '',
                'ip' => $row['player_ip'] ?? '',
                'reason' => $row['ban_reason'] ?? 'Не указана',
                'admin' => $row['admin_nick'] ?? 'Unknown',
                'duration' => $length > 0 ? "{$length} min" : 'permanent',
                'remaining' => $until ? max(0, (int)ceil((strtotime($until) - time()) / 60)) . ' min' : 'permanent',
                'createdAt' => $created ? gmdate('Y-m-d\TH:i:s\Z', $created) : now_iso(),
            ];
        }
    }
    return $items;
}

function api(string $path): void {
    $db = read_db();
    if ($path === '/api/integration/status') {
        $amx = ['configured' => !empty(app_config('amxbans')['enabled']), 'connected' => false, 'tables' => []];
        if ($pdo = amxbans_pdo()) {
            $prefix = (string)(app_config('amxbans')['prefix'] ?? 'amx_');
            $amx['connected'] = true;
            $amx['tables'] = [
                'bans' => table_exists($pdo, "{$prefix}bans"),
                'amxadmins' => table_exists($pdo, "{$prefix}amxadmins"),
                'admins' => table_exists($pdo, "{$prefix}admins"),
            ];
        }
        json_response(['ok' => true, 'persistence' => 'mysql', 'mainDb' => ['connected' => true, 'users' => count($db['users']), 'orders' => count($db['orders'])], 'rcon' => server_status()['rcon'], 'amxbans' => $amx]);
    }
    if ($path === '/api/server-live') {
        json_response(['ok' => true, 'status' => server_status(), 'bans' => get_bans($db), 'entitlements' => array_values(array_filter($db['orders'], fn($o) => str_starts_with((string)($o['status'] ?? ''), 'paid')))]);
    }
    if ($path === '/api/register' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = request_data();
        $login = trim((string)($data['login'] ?? ''));
        $email = strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');
        if ($login === '' || $email === '' || $password === '' || $password !== (string)($data['password2'] ?? '')) json_response(['ok' => false, 'message' => 'Проверьте поля регистрации'], 400);
        if (strlen($login) < 3 || strlen($password) < 6) json_response(['ok' => false, 'message' => 'Логин от 3 символов, пароль от 6 символов'], 400);
        foreach ($db['users'] as $u) {
            if (strcasecmp((string)$u['login'], $login) === 0 || strcasecmp((string)$u['email'], $email) === 0) json_response(['ok' => false, 'message' => 'Такой логин или email уже есть'], 409);
        }
        $user = ['id' => uuid(), 'login' => $login, 'email' => $email, 'password' => password_hash($password, PASSWORD_DEFAULT), 'balance' => 0, 'role' => 'Пользователь', 'profile' => ['displayName' => $login, 'firstName' => '', 'birthDate' => '', 'serverNick' => '', 'discord' => '', 'bio' => '', 'avatarData' => ''], 'createdAt' => now_iso()];
        $db['users'][] = $user;
        add_notification($db, $login, 'Добро пожаловать на ' . APP_NAME . '!', 'welcome');
        $token = create_session($db, $user);
        write_db($db);
        set_session_cookie($token);
        json_response(['ok' => true, 'message' => 'Аккаунт создан. Открываем личный кабинет...', 'redirect' => '/account', 'user' => public_user($user)], 201);
    }
    if ($path === '/api/login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = request_data();
        $login = trim((string)($data['login'] ?? ''));
        $user = find_user($db, $login);
        if (!$user || !password_verify((string)($data['password'] ?? ''), (string)$user['password'])) json_response(['ok' => false, 'message' => 'Неверный логин или пароль'], 401);
        $token = create_session($db, $user);
        write_db($db);
        set_session_cookie($token);
        json_response(['ok' => true, 'message' => 'Вы вошли', 'redirect' => '/account', 'user' => public_user($user)]);
    }
    if ($path === '/api/logout') {
        clear_session_cookie();
        json_response(['ok' => true]);
    }
    if ($path === '/api/me') {
        $user = current_user($db);
        if (!$user) json_response(['ok' => false, 'message' => 'Требуется авторизация'], 401);
        json_response(['ok' => true, 'user' => public_user($user), 'orders' => array_values(array_filter($db['orders'], fn($o) => strcasecmp((string)$o['login'], (string)$user['login']) === 0))]);
    }
    if ($path === '/api/order' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $user = current_user($db);
        if (!$user) json_response(['ok' => false, 'message' => 'Сначала войдите на сайт'], 401);
        $data = request_data();
        $service = find_service((string)($data['service'] ?? ''));
        if (!$service) json_response(['ok' => false, 'message' => 'Услуга не найдена'], 400);
        $tariff = find_tariff($service, $data['tariff'] ?? 0);
        if (!$tariff) json_response(['ok' => false, 'message' => 'Тариф не найден'], 400);
        $order = ['id' => uuid(), 'login' => $user['login'], 'service' => $service['id'], 'serviceName' => $service['name'], 'tariffName' => $tariff[0], 'price' => $tariff[1], 'nickname' => trim((string)($data['nickname'] ?? '')), 'steamId' => trim((string)($data['steamId'] ?? '')), 'payerName' => trim((string)($data['payerName'] ?? '')), 'transactionId' => trim((string)($data['transactionId'] ?? '')), 'status' => 'pending-payment-review', 'createdAt' => now_iso()];
        $db['orders'][] = $order;
        write_db($db);
        json_response(['ok' => true, 'orderId' => $order['id'], 'message' => 'Заказ создан. Админ проверит перевод и нажмёт подтверждение.']);
    }
    if ($path === '/api/admin/orders') {
        $data = request_data();
        $pin = (string)($data['pin'] ?? ($_SERVER['HTTP_X_ADMIN_PIN'] ?? ''));
        if (!hash_equals((string)app_config('admin_pin'), $pin)) json_response(['ok' => false, 'message' => 'Неверный PIN'], 403);
        json_response(['ok' => true, 'orders' => array_reverse($db['orders'])]);
    }
    if ($path === '/api/admin/order-action' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = request_data();
        if (!hash_equals((string)app_config('admin_pin'), (string)($data['pin'] ?? ''))) json_response(['ok' => false, 'message' => 'Неверный PIN'], 403);
        $orderId = (string)($data['orderId'] ?? '');
        $action = (string)($data['action'] ?? '');
        foreach ($db['orders'] as &$order) {
            if (($order['id'] ?? '') === $orderId) {
                if ($action === 'reject') {
                    $order['status'] = 'rejected';
                    write_db($db);
                    json_response(['ok' => true, 'message' => 'Заказ отклонён']);
                }
                $command = issue_command($order);
                $delivery = rcon_command($command);
                $order['delivery'] = $delivery + ['command' => $command, 'at' => now_iso()];
                $order['status'] = $delivery['ok'] ? 'paid-issued' : 'paid-pending-server-integration';
                write_db($db);
                json_response(['ok' => true, 'message' => $delivery['ok'] ? 'Платёж подтверждён, услуга выдана.' : 'Платёж подтверждён, но RCON не выдал услугу.', 'delivery' => $delivery]);
            }
        }
        json_response(['ok' => false, 'message' => 'Заказ не найден'], 404);
    }
    json_response(['ok' => false, 'message' => 'API route not found'], 404);
}

function page_shell(string $title, string $content, string $path = '/'): string {
    $nav = [['/', 'Главная'], ['/store', 'Магазин'], ['/rules_public', 'Правила']];
    $navHtml = '';
    foreach ($nav as [$href, $label]) $navHtml .= '<a class="' . ($href === $path ? 'active' : '') . '" href="' . h($href) . '">' . h($label) . '</a>';
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . h($title) . ' - ' . APP_NAME . '</title><link rel="stylesheet" href="/style.css"><style>' . styles() . '</style></head><body><nav class="top">' . $navHtml . '<button id="login-open">Войти на сайт</button></nav><div class="crumb">Главная страница</div><main class="layout"><aside class="side"><img class="logo" src="/assets/oldera-logo.png" alt="OLDERA.UZ"><a>★ Подписка</a><a>♣ Кланы</a><a class="grad">▣ Розыгрыш</a><a>↧ Скачать CS 1.6 от Проекта</a><section><h3>Авторизация</h3><button id="side-login">Войти на сайт</button><button id="side-register">Зарегистрироваться</button></section></aside><section class="content">' . $content . '</section></main>' . modals() . '<script>' . scripts() . '</script></body></html>';
}

function styles(): string {
    return "body{margin:0;background:#07111e url('/assets/oldera-bg.png') center top/cover fixed;color:#d8e2f1;font-family:Arial,sans-serif}.top{height:86px;background:#202128;display:flex;align-items:center;gap:0;padding:0 24px}.top a{color:#dbe7ff;text-decoration:none;font-weight:800;padding:34px 28px}.top a.active,.top a:hover{background:linear-gradient(135deg,#b35dc5,#f23478);color:#fff}.top button{margin-left:auto;background:#111722;border:1px solid #f01828;color:#fff;padding:12px 22px;font-weight:800}.crumb{background:#31343b;padding:18px 26px;color:#aeb7c8}.layout{display:grid;grid-template-columns:330px 1fr;gap:28px;padding:32px}.side{background:#0d1724dd;padding:22px;border-right:1px solid #243448}.logo{width:100%;max-width:285px;margin:20px auto 28px;display:block}.side a,.side button{display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:17px 20px;background:#101a2b;border:1px solid #223149;border-radius:8px;color:#eef5ff;text-align:center;font-weight:800;text-decoration:none}.side .grad{background:linear-gradient(90deg,#fa3da0,#ff8a24)}.side section{margin-top:20px;background:#0d1724;border-radius:8px;padding:20px}.side h3{font-size:24px;color:#dbe7ff}.content{min-width:0}.panel{background:#0b1524f2;border:1px solid #243448;border-radius:8px;padding:28px;margin-bottom:28px;box-shadow:0 16px 45px #0008}.servers{width:100%;border-collapse:collapse;background:#0b1422}.servers th,.servers td{border:1px solid #2b394d;padding:15px;text-align:left}.servers th{font-size:20px;color:#eaf2ff}.bar{height:30px;background:#761724;border:1px solid #f13b4d;border-radius:4px;overflow:hidden}.bar span{display:block;height:100%;background:repeating-linear-gradient(45deg,#4ee6d3,#4ee6d3 6px,#70f2df 6px,#70f2df 12px)}.hero{height:320px;background:linear-gradient(90deg,#050608,#050608a0),url('/assets/support-banner.png') center/cover;border:0;display:flex;flex-direction:column;justify-content:center}.hero h1{font-size:44px;color:#fff;background:#222936cc;display:inline-block;padding:10px 16px;border-radius:8px}.hero p{background:#222936cc;padding:10px 14px;border-radius:8px}.store-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}.card{background:#0b1524;border:1px solid #2a3a50;border-radius:8px;overflow:hidden}.card img{width:100%;height:170px;object-fit:cover}.card div{padding:20px}.price{display:inline-block;background:#142235;border:1px solid #31445e;padding:10px 14px;border-radius:5px;font-size:22px;font-weight:900}.primary,button{background:#ef1b2d;color:#fff;border:0;border-radius:4px;padding:13px 20px;font-weight:900;cursor:pointer}input,select,textarea{width:100%;box-sizing:border-box;background:#101a2b;border:1px solid #31445e;color:#fff;padding:13px;margin:7px 0 14px}.modal{position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:10}.modal.show{display:flex}.dialog{width:min(460px,92vw);background:#111c2c;border:1px solid #31445e;border-radius:8px;padding:28px}.close{float:right;background:transparent;font-size:28px;padding:0}.result.success{color:#9effad}.result.error{color:#ff8190}@media(max-width:850px){.layout{display:block;padding:0}.side{border:0}.top{overflow:auto}.content{padding:16px}.servers{font-size:14px}.servers th,.servers td{padding:10px}.hero h1{font-size:32px}}";
}

function modals(): string {
    return '<div id="auth-modal" class="modal"><div class="dialog"><button class="close" data-close>×</button><h2>Авторизация</h2><form id="login-form"><input name="login" placeholder="Логин" required><input name="password" type="password" placeholder="Пароль" required><button class="primary">Войти</button><p class="result"></p></form><a href="#" id="to-register">Регистрация</a></div></div><div id="reg-modal" class="modal"><div class="dialog"><button class="close" data-close>×</button><h2>Регистрация</h2><form id="register-form"><input name="login" placeholder="Логин" required><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Пароль" required><input name="password2" type="password" placeholder="Повтор пароля" required><button class="primary">Создать аккаунт</button><p class="result"></p></form></div></div>';
}

function scripts(): string {
    return "const qs=s=>document.querySelector(s);const qsa=s=>[...document.querySelectorAll(s)];function openM(id){qs(id).classList.add('show')}function closeM(){qsa('.modal').forEach(m=>m.classList.remove('show'))}qsa('[data-close]').forEach(b=>b.onclick=closeM);['#login-open','#side-login'].forEach(s=>qs(s)&&(qs(s).onclick=()=>openM('#auth-modal')));qs('#side-register')&&(qs('#side-register').onclick=()=>openM('#reg-modal'));qs('#to-register')&&(qs('#to-register').onclick=e=>{e.preventDefault();closeM();openM('#reg-modal')});async function post(url,form){let r=await fetch(url,{method:'POST',body:new FormData(form)});return r.json()}qs('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();let d=await post('/api/login',e.target);let p=e.target.querySelector('.result');p.className='result '+(d.ok?'success':'error');p.textContent=d.message;if(d.ok)location.href=d.redirect||'/account'});qs('#register-form')?.addEventListener('submit',async e=>{e.preventDefault();let d=await post('/api/register',e.target);let p=e.target.querySelector('.result');p.className='result '+(d.ok?'success':'error');p.textContent=d.message;if(d.ok)location.href=d.redirect||'/account'});";
}

function home_page(): string {
    $status = server_status();
    $percent = max(0, min(100, $status['maxPlayers'] ? round($status['players'] / $status['maxPlayers'] * 100) : 0));
    return page_shell('Главная', '<section class="panel"><table class="servers"><thead><tr><th>Название сервера</th><th>Карта</th><th>Игроков</th><th>IP-адрес</th><th>Действия</th></tr></thead><tbody><tr><td>Oldera Zombie Server</td><td>' . h($status['map']) . '</td><td>' . h($status['players']) . '/' . h($status['maxPlayers']) . '</td><td><b>195.158.4.108:27047</b></td><td>♟ ⊘ ☑</td></tr><tr><td colspan="5"><div class="bar"><span style="width:' . $percent . '%"></span></div></td></tr></tbody></table></section><section class="panel hero"><h1>Есть вопрос? Обратитесь к администрации.</h1><p>Если у Вас имеются вопросы, Вы можете открыть тикет в разделе поддержки и своевременно получить ответ администрации.</p><a class="primary" href="/support">Подробнее</a></section>', '/');
}

function store_page(): string {
    $cards = '';
    foreach (services() as $service) {
        $cards .= '<article class="card"><img src="' . h($service['image']) . '" alt=""><div><h2>' . h($service['name']) . '</h2><span class="price">от ' . money((int)$service['tariffs'][0][1]) . '</span><ul><li>Для Zombie сервера</li><li>Выбор срока в магазине</li><li>Автовыдача после подтверждения</li></ul><button onclick="location.href=\'/store#order\'">Купить</button></div></article>';
    }
    $options = '';
    foreach (services() as $service) $options .= '<option value="' . h($service['id']) . '">' . h($service['name']) . '</option>';
    $pay = app_config('payment');
    $form = '<section id="order" class="panel"><h2>Оформить заказ</h2><p>Перевод на карту: <b>' . h($pay['card_type']) . ' ' . h($pay['card_number']) . '</b>, получатель: <b>' . h($pay['card_holder']) . '</b></p><form id="order-form"><select name="service">' . $options . '</select><select name="tariff"><option value="0">Первый тариф</option><option value="1">Второй тариф</option></select><input name="nickname" placeholder="Ник на сервере"><input name="steamId" placeholder="SteamID"><input name="payerName" placeholder="Имя отправителя"><input name="transactionId" placeholder="ID/время перевода"><button class="primary">Я перевёл - отправить</button><p class="result"></p></form><script>qs(\"#order-form\")?.addEventListener(\"submit\",async e=>{e.preventDefault();let d=await post(\"/api/order\",e.target);let p=e.target.querySelector(\".result\");p.className=\"result \"+(d.ok?\"success\":\"error\");p.textContent=d.message})</script></section>';
    return page_shell('Магазин', '<section class="store-grid">' . $cards . '</section>' . $form, '/store');
}

function account_page(): string {
    $db = read_db();
    $user = current_user($db);
    if (!$user) return page_shell('Аккаунт', '<section class="panel"><h1>Нужно войти</h1><button onclick="openM(\'#auth-modal\')">Войти</button></section>', '/account');
    $orders = array_values(array_filter($db['orders'], fn($o) => strcasecmp((string)$o['login'], (string)$user['login']) === 0));
    $rows = '';
    foreach (array_reverse($orders) as $o) $rows .= '<tr><td>' . h($o['serviceName']) . '</td><td>' . h($o['tariffName']) . '</td><td>' . h($o['status']) . '</td></tr>';
    return page_shell('Аккаунт', '<section class="panel"><h1>' . h($user['profile']['displayName'] ?? $user['login']) . '</h1><p>Группа: <b>' . h($user['role']) . '</b></p><p>Баланс: <b>' . money((int)$user['balance']) . '</b></p></section><section class="panel"><h2>Услуги</h2><table class="servers"><tbody>' . ($rows ?: '<tr><td>Услуг пока нет</td></tr>') . '</tbody></table></section>', '/account');
}

function admin_orders_page(): string {
    return page_shell('Админ заказы', '<section class="panel"><h1>Проверка переводов</h1><input id="pin" placeholder="ADMIN_PIN"><button id="load">Загрузить</button><div id="orders"></div></section><script>qs(\"#load\").onclick=async()=>{let fd=new FormData();fd.append(\"pin\",qs(\"#pin\").value);let d=await fetch(\"/api/admin/orders\",{method:\"POST\",body:fd}).then(r=>r.json());if(!d.ok){qs(\"#orders\").textContent=d.message;return}qs(\"#orders\").innerHTML=d.orders.map(o=>`<div class=\"panel\"><b>${o.serviceName}</b> ${o.tariffName} ${o.price} сум<br>${o.login} ${o.nickname||\"\"} ${o.steamId||\"\"}<br>Статус: ${o.status}<br><button data-a=\"confirm\" data-id=\"${o.id}\">Подтвердить и выдать</button><button data-a=\"reject\" data-id=\"${o.id}\">Отклонить</button></div>`).join(\"\")};document.addEventListener(\"click\",async e=>{let b=e.target.closest(\"[data-a]\");if(!b)return;let fd=new FormData();fd.append(\"pin\",qs(\"#pin\").value);fd.append(\"orderId\",b.dataset.id);fd.append(\"action\",b.dataset.a);let d=await fetch(\"/api/admin/order-action\",{method:\"POST\",body:fd}).then(r=>r.json());alert(d.message);qs(\"#load\").click()})</script>', '/admin/orders');
}

function simple_page(string $title, string $body, string $path): string {
    return page_shell($title, '<section class="panel">' . $body . '</section>', $path);
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rtrim($path, '/') ?: '/';

try {
    if (str_starts_with($path, '/api/')) api($path);
    if ($path === '/') echo home_page();
    elseif ($path === '/store') echo store_page();
    elseif ($path === '/account') echo account_page();
    elseif ($path === '/admin/orders') echo admin_orders_page();
    elseif ($path === '/banlist' || $path === '/bans') {
        $rows = '';
        foreach (get_bans(read_db()) as $ban) $rows .= '<tr><td>' . h($ban['player']) . '<br><small>' . h($ban['steamId'] ?? $ban['ip'] ?? '') . '</small></td><td>' . h($ban['reason']) . '</td><td>' . h($ban['duration']) . '</td><td>' . h($ban['remaining']) . '</td></tr>';
        echo simple_page('Баны', '<h1>Список банов</h1><table class="servers"><thead><tr><th>Игрок</th><th>Причина</th><th>Срок</th><th>Осталось</th></tr></thead><tbody>' . ($rows ?: '<tr><td colspan="4">Активных банов пока нет</td></tr>') . '</tbody></table>', $path);
    } elseif ($path === '/stats') {
        $s = server_status();
        echo simple_page('Статистика', '<h1>Статистика сервера</h1><p>Карта: <b>' . h($s['map']) . '</b></p><p>Онлайн: <b>' . h($s['players']) . '/' . h($s['maxPlayers']) . '</b></p>', '/stats');
    } elseif ($path === '/rules_public' || $path === '/pages/rules') echo simple_page('Правила', '<h1>Правила сервера</h1><h2>Общие</h2><p>Запрещены читы, реклама, оскорбления, обход банов и помеха игре.</p><h2>VIP/Admin</h2><p>Запрещено злоупотреблять правами. Администрация может снять услугу при нарушениях.</p>', '/rules_public');
    elseif ($path === '/admins') echo simple_page('Администраторы', '<h1>Администраторы</h1><p>Список будет заполняться из купленных услуг и FreshBans/AMXBans.</p>', '/admins');
    elseif ($path === '/support') echo simple_page('Поддержка', '<h1>Поддержка</h1><p>Пишите администрации: <a href="' . h(app_config('payment')['support_url']) . '">' . h(app_config('payment')['support_url']) . '</a></p>', '/support');
    elseif ($path === '/chat') echo simple_page('Чат', '<h1>Чат</h1><p>Сообщений пока нет.</p>', '/chat');
    else { http_response_code(404); echo simple_page('404', '<h1>404</h1><p>Страница не найдена.</p>', $path); }
} catch (Throwable $e) {
    if (str_starts_with($path, '/api/')) json_response(['ok' => false, 'message' => 'Внутренняя ошибка: ' . $e->getMessage()], 500);
    http_response_code(500);
    echo 'Внутренняя ошибка: ' . h($e->getMessage());
}

