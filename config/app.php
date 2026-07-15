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
    ];
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
