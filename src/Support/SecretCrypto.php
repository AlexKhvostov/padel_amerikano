<?php

declare(strict_types=1);

final class SecretCrypto
{
    public static function encrypt(string $plain): string
    {
        $key = self::key();
        $iv = random_bytes(16);
        $cipher = openssl_encrypt($plain, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        if ($cipher === false) {
            throw new RuntimeException('Не удалось зашифровать секрет');
        }
        return base64_encode($iv . $cipher);
    }

    public static function decrypt(?string $payload): ?string
    {
        if ($payload === null || $payload === '') {
            return null;
        }
        $raw = base64_decode($payload, true);
        if ($raw === false || strlen($raw) < 17) {
            return null;
        }
        $iv = substr($raw, 0, 16);
        $cipher = substr($raw, 16);
        $plain = openssl_decrypt($cipher, 'AES-256-CBC', self::key(), OPENSSL_RAW_DATA, $iv);
        return $plain === false || $plain === '' ? null : $plain;
    }

    private static function key(): string
    {
        $secret = function_exists('env') ? (string) (env('APP_SECRET') ?? '') : '';
        if (strlen($secret) < 16) {
            throw new RuntimeException('APP_SECRET должен быть задан для восстановления кода');
        }
        return hash('sha256', $secret, true);
    }
}
