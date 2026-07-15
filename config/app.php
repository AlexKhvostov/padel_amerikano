<?php

declare(strict_types=1);

function appRoot(): string
{
    return dirname(__DIR__);
}

function defaultSettings(): array
{
    return [
        'score_limit' => 16,
        'extra_point_on_tie' => true,
        'extra_point_always' => false,
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
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}
