<?php
declare(strict_types=1);

return [
    'base_url' => 'https://oldera.uz',

    // Main website MySQL database from HOSTIN.UZ panel.
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'MYSQL_DATABASE_HERE',
        'user' => 'MYSQL_USER_HERE',
        'pass' => 'MYSQL_PASSWORD_HERE',
        'charset' => 'utf8mb4',
    ],

    // Admin panel PIN: /admin/orders
    'admin_pin' => 'CHANGE_ME_LONG_PIN',

    // Manual card payment details shown in the shop.
    'payment' => [
        'card_number' => '4413597604946507',
        'card_holder' => 'Bahodirov Bobur',
        'card_type' => 'UZCARD',
        'support_url' => 'https://t.me/olderauz_Admin',
    ],

    // Counter-Strike 1.6 RCON.
    'rcon' => [
        'host' => '195.158.4.108',
        'port' => 27047,
        'password' => 'RCON_PASSWORD_HERE',
    ],

    // Commands used after admin confirms a manual payment.
    // {target}, {login}, {nickname}, {steamId}, {service}, {days}, {price}
    'service_commands' => [
        'vip' => 'amx_addadmin "{target}" "bt" "" "steamid"',
        'admin' => 'amx_addadmin "{target}" "bcdefijtu" "" "steamid"',
        'immunity' => 'amx_addadmin "{target}" "abt" "" "steamid"',
    ],
    'unban_command_template' => 'amx_unban "{target}"',

    // Optional FreshBans / AMXBans MySQL database.
    // Leave enabled=false until the plugin/database works.
    'amxbans' => [
        'enabled' => true,
        'host' => '195.158.4.108',
        'port' => 3306,
        'name' => 'gs325',
        'user' => 'gs325',
        'pass' => 'AMXBANS_PASSWORD_HERE',
        'prefix' => 'amx_',
    ],
];

