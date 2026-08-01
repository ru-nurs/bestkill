<?php
declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

$host = '195.158.4.108';
$port = 27047;
$timeout = 3;

echo "OLDERA.UZ PHP RCON/UDP test\n";
echo "Target: {$host}:{$port}\n";
echo "PHP: " . PHP_VERSION . "\n\n";

echo "Functions:\n";
echo "- fsockopen: " . (function_exists('fsockopen') ? 'yes' : 'no') . "\n";
echo "- stream_socket_client: " . (function_exists('stream_socket_client') ? 'yes' : 'no') . "\n";
echo "- socket_create: " . (function_exists('socket_create') ? 'yes' : 'no') . "\n";
echo "- disabled_functions: " . (ini_get('disable_functions') ?: '-') . "\n\n";

$errno = 0;
$errstr = '';
$socket = @stream_socket_client(
    "udp://{$host}:{$port}",
    $errno,
    $errstr,
    $timeout,
    STREAM_CLIENT_CONNECT
);

if (!$socket) {
    echo "UDP open: FAIL\n";
    echo "Error: {$errno} {$errstr}\n";
    exit;
}

stream_set_timeout($socket, $timeout);
echo "UDP open: OK\n";

$packet = "\xFF\xFF\xFF\xFFchallenge rcon\n";
$written = @fwrite($socket, $packet);
echo "Challenge write bytes: " . var_export($written, true) . "\n";

$response = @fread($socket, 4096);
$meta = stream_get_meta_data($socket);
fclose($socket);

if ($response === false || $response === '') {
    echo "Challenge response: EMPTY/FAIL\n";
    echo "Timed out: " . (!empty($meta['timed_out']) ? 'yes' : 'no') . "\n";
    echo "\nResult: PHP can open UDP, but response from game server was not received.\n";
    echo "Possible reasons: outbound UDP blocked by hosting, firewall, or RCON protocol filtered.\n";
    exit;
}

$text = trim(preg_replace('/^\xFF{4}/', '', $response));
echo "Challenge response: OK\n";
echo "Raw length: " . strlen($response) . "\n";
echo "Text: {$text}\n\n";

if (stripos($text, 'challenge rcon') !== false) {
    echo "Result: UDP RCON challenge works from this hosting.\n";
} else {
    echo "Result: UDP answered, but response is not an RCON challenge.\n";
}

