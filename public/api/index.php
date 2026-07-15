<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/app.php';
require_once dirname(__DIR__, 2) . '/config/database.php';
require_once dirname(__DIR__, 2) . '/src/Services/CompanyService.php';
require_once dirname(__DIR__, 2) . '/src/Services/PlayerService.php';
require_once dirname(__DIR__, 2) . '/src/Services/RoundService.php';
require_once dirname(__DIR__, 2) . '/src/Services/ScoreService.php';
require_once dirname(__DIR__, 2) . '/src/Services/RatingService.php';
require_once dirname(__DIR__, 2) . '/src/Services/TournamentService.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '';
$uri = preg_replace('#^/api#', '', $uri) ?: '/';

try {
    route($method, $uri);
} catch (Throwable $e) {
    $debug = env('APP_DEBUG', 'false') === 'true';
    jsonError(
        $debug ? $e->getMessage() : 'Внутренняя ошибка сервера',
        500,
        $debug ? ['trace' => $e->getTraceAsString()] : null
    );
}

function route(string $method, string $uri): void
{
    if ($method === 'GET' && $uri === '/health') {
        $dbOk = false;
        try {
            db()->query('SELECT 1');
            $dbOk = true;
        } catch (Throwable) {
            $dbOk = false;
        }
        jsonResponse([
            'status' => $dbOk ? 'ok' : 'degraded',
            'db' => $dbOk,
            'php' => PHP_VERSION,
        ], $dbOk ? 200 : 503);
    }

    if ($method === 'GET' && $uri === '/companies/search') {
        $q = trim($_GET['q'] ?? $_GET['name'] ?? '');
        if ($q === '') {
            jsonResponse(['companies' => []]);
        }
        jsonResponse(['companies' => CompanyService::search($q)]);
    }

    if ($method === 'GET' && $uri === '/tournaments') {
        $date = isset($_GET['date']) && $_GET['date'] !== '' ? (string) $_GET['date'] : null;
        jsonResponse(TournamentService::publicList($date));
    }

    if ($method === 'POST' && $uri === '/companies') {
        $body = readJsonBody();
        jsonResponse(CompanyService::create($body['name'] ?? ''), 201);
    }

    if ($method === 'POST' && $uri === '/companies/login') {
        $body = readJsonBody();
        jsonResponse(CompanyService::login($body['name'] ?? '', $body['password'] ?? ''));
    }

    if (
        preg_match('#^/viewer/([A-Za-z0-9_-]{12}|[a-f0-9]{64})$#', $uri, $m)
        && $method === 'GET'
    ) {
        jsonResponse(CompanyService::loginViewer($m[1]));
    }

    if (preg_match('#^/companies/(\d+)$#', $uri, $m) && $method === 'GET') {
        $id = (int) $m[1];
        $role = CompanyService::assertAccess($id);
        $company = CompanyService::get($id);
        if ($role === 'viewer') {
            unset($company['view_token'], $company['view_slug']);
        }
        jsonResponse($company);
    }

    if (preg_match('#^/companies/(\d+)$#', $uri, $m) && $method === 'DELETE') {
        $id = (int) $m[1];
        CompanyService::assertAccess($id, true);
        CompanyService::delete($id);
        jsonResponse(['ok' => true]);
    }

    if (preg_match('#^/companies/(\d+)$#', $uri, $m) && $method === 'PUT') {
        $id = (int) $m[1];
        CompanyService::assertAccess($id, true);
        $body = readJsonBody();
        jsonResponse(CompanyService::rename($id, (string) ($body['name'] ?? '')));
    }

    if (preg_match('#^/companies/(\d+)/settings$#', $uri, $m) && $method === 'PUT') {
        $id = (int) $m[1];
        CompanyService::assertAccess($id, true);
        $settings = CompanyService::updateSettings($id, readJsonBody());
        jsonResponse(['settings' => $settings]);
    }

    if (preg_match('#^/companies/(\d+)/reset$#', $uri, $m) && $method === 'DELETE') {
        $id = (int) $m[1];
        CompanyService::assertAccess($id, true);
        CompanyService::reset($id);
        jsonResponse(['ok' => true]);
    }

    if (preg_match('#^/companies/(\d+)/players$#', $uri, $m) && $method === 'GET') {
        jsonResponse(PlayerService::list((int) $m[1]));
    }

    if (preg_match('#^/companies/(\d+)/players$#', $uri, $m) && $method === 'POST') {
        jsonResponse(PlayerService::create((int) $m[1], readJsonBody()), 201);
    }

    if (preg_match('#^/players/(\d+)$#', $uri, $m) && $method === 'PUT') {
        jsonResponse(PlayerService::update((int) $m[1], readJsonBody()));
    }

    if (preg_match('#^/players/(\d+)$#', $uri, $m) && $method === 'DELETE') {
        PlayerService::delete((int) $m[1]);
        jsonResponse(['ok' => true]);
    }

    if (preg_match('#^/companies/(\d+)/rounds$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RoundService::list((int) $m[1]));
    }

    if (preg_match('#^/companies/(\d+)/schedule$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RoundService::fullSchedule((int) $m[1]));
    }

    if (preg_match('#^/companies/(\d+)/rounds$#', $uri, $m) && $method === 'POST') {
        jsonResponse(RoundService::createNext((int) $m[1]), 201);
    }

    if (preg_match('#^/matches/(\d+)/score$#', $uri, $m) && $method === 'PUT') {
        jsonResponse(ScoreService::save((int) $m[1], readJsonBody()));
    }

    if (preg_match('#^/companies/(\d+)/rating$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RatingService::get((int) $m[1]));
    }

    jsonError('Маршрут не найден', 404);
}
