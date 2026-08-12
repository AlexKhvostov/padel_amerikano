<?php

declare(strict_types=1);

function appRoot(): string
{
    return dirname(__DIR__);
}

function defaultSettings(): array
{
    return [
        'courts_count' => 1,
        'format' => 24,
        'allow_extra_ball' => true,
        'allow_draw' => false,
    ];
}

/**
 * @param array<string, mixed>|null $settings
 * @return array{courts_count: int, format: int, allow_extra_ball: bool, allow_draw: bool}
 */
function normalizeTournamentSettings(?array $settings): array
{
    $base = defaultSettings();
    if (!is_array($settings)) {
        return $base;
    }

    $format = (int) ($settings['format'] ?? $base['format']);
    $base['format'] = $format === 16 ? 16 : 24;
    $base['courts_count'] = max(1, min(10, (int) ($settings['courts_count'] ?? $base['courts_count'])));
    $base['allow_extra_ball'] = (bool) ($settings['allow_extra_ball'] ?? $base['allow_extra_ball']);
    $base['allow_draw'] = (bool) ($settings['allow_draw'] ?? $base['allow_draw']);
    return $base;
}

function jsonResponse(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(string $message, int $status = 400, ?array $extra = null): void
{
    $payload = ['error' => $message];
    if ($extra !== null) {
        $payload = array_merge($payload, $extra);
    }
    jsonResponse($payload, $status);
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function clientIp(): string
{
    $remote = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $trustedProxies = array_filter(array_map(
        'trim',
        explode(',', function_exists('env') ? (env('TRUSTED_PROXIES', '') ?? '') : '')
    ));

    if (
        in_array($remote, $trustedProxies, true)
        && isset($_SERVER['HTTP_X_FORWARDED_FOR'])
    ) {
        $forwarded = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        if (filter_var($forwarded, FILTER_VALIDATE_IP)) {
            return $forwarded;
        }
    }
    return $remote;
}
