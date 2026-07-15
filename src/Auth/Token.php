<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/env.php';

final class Token
{
    public static function create(int $companyId): string
    {
        $payload = json_encode([
            'company_id' => $companyId,
            'exp' => time() + 60 * 60 * 24 * 30,
        ], JSON_THROW_ON_ERROR);

        $encoded = self::base64UrlEncode($payload);
        $signature = hash_hmac('sha256', $encoded, env('APP_SECRET', 'dev-secret'));

        return $encoded . '.' . $signature;
    }

    public static function verify(?string $token): ?int
    {
        if (!$token || !str_contains($token, '.')) {
            return null;
        }

        [$encoded, $signature] = explode('.', $token, 2);
        $expected = hash_hmac('sha256', $encoded, env('APP_SECRET', 'dev-secret'));
        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $payload = json_decode(self::base64UrlDecode($encoded), true);
        if (!is_array($payload) || !isset($payload['company_id'], $payload['exp'])) {
            return null;
        }
        if ((int) $payload['exp'] < time()) {
            return null;
        }

        return (int) $payload['company_id'];
    }

    public static function fromRequest(): ?int
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return self::verify(substr($header, 7));
        }
        return null;
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/')) ?: '';
    }
}
