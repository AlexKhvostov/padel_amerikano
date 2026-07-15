<?php

declare(strict_types=1);

/**
 * Загрузка переменных из .env в корне проекта.
 */
function loadEnv(string $rootDir): array
{
    $path = $rootDir . DIRECTORY_SEPARATOR . '.env';
    if (!is_readable($path)) {
        throw new RuntimeException('Файл .env не найден. Скопируйте config/.env.example в .env');
    }

    $env = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        throw new RuntimeException('Не удалось прочитать .env');
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (!str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $env[trim($key)] = trim($value, " \t\"'");
    }

    return $env;
}

function env(string $key, ?string $default = null): ?string
{
    static $cache = null;
    if ($cache === null) {
        $cache = loadEnv(dirname(__DIR__));
    }
    return $cache[$key] ?? $default;
}
