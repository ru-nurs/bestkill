<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    echo '<h1>OLDERA.UZ PHP install</h1>';
    echo '<p style="color:red">Файл config.php не найден.</p>';
    echo '<p>Скопируйте <code>config.example.php</code> в <code>config.php</code> и впишите MySQL/RCON данные.</p>';
    exit;
}

$config = require $configPath;

function ok(string $text): void { echo '<p style="color:green">✓ ' . htmlspecialchars($text) . '</p>'; }
function fail(string $text): void { echo '<p style="color:red">✗ ' . htmlspecialchars($text) . '</p>'; }

echo '<h1>OLDERA.UZ PHP install</h1>';
echo '<p>PHP: ' . htmlspecialchars(PHP_VERSION) . '</p>';

try {
    $db = $config['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        (int)$db['port'],
        $db['name'],
        $db['charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_state (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    ok('MySQL подключен, таблица app_state готова.');
} catch (Throwable $e) {
    fail('MySQL ошибка: ' . $e->getMessage());
}

$rcon = $config['rcon'] ?? [];
$host = (string)($rcon['host'] ?? '');
$port = (int)($rcon['port'] ?? 27015);
if ($host) {
    $socket = @stream_socket_client("udp://{$host}:{$port}", $errno, $errstr, 3, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        fail("RCON UDP socket error: {$errstr}");
    } else {
        stream_set_timeout($socket, 3);
        fwrite($socket, "\xFF\xFF\xFF\xFFchallenge rcon\n");
        $response = fread($socket, 4096);
        fclose($socket);
        if ($response && preg_match('/challenge rcon\s+(-?\d+)/', $response)) {
            ok('RCON UDP challenge работает.');
        } else {
            fail('RCON UDP открыт, но challenge не вернулся.');
        }
    }
}

echo '<hr>';
echo '<p>Если оба пункта зелёные, откройте <a href="/">главную страницу</a>.</p>';
echo '<p>После проверки можно удалить install.php с хостинга.</p>';

