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
            db()->query('SELECT tournament_id FROM rounds LIMIT 0');
            db()->query('SELECT id, updated_at FROM tournaments LIMIT 0');
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

    if ($method === 'GET' && $uri === '/companies/public') {
        $companyIds = null;
        if (array_key_exists('ids', $_GET)) {
            $rawIds = is_string($_GET['ids']) ? explode(',', $_GET['ids']) : [];
            $companyIds = array_slice(array_values(array_unique(array_filter(
                array_map('intval', $rawIds),
                static fn (int $id): bool => $id > 0
            ))), 0, 100);
        }
        jsonResponse(CompanyService::publicList(
            (string) ($_GET['q'] ?? ''),
            (int) ($_GET['page'] ?? 1),
            $companyIds,
            isset($_GET['status']) ? (string) $_GET['status'] : null
        ));
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

    if (preg_match('#^/companies/(\d+)/password$#', $uri, $m) && $method === 'PUT') {
        $id = (int) $m[1];
        CompanyService::assertAccess($id, true);
        $body = readJsonBody();
        CompanyService::changePassword(
            $id,
            (string) ($body['current_password'] ?? ''),
            (string) ($body['new_password'] ?? '')
        );
        jsonResponse(['ok' => true]);
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

    if (preg_match('#^/companies/(\d+)/tournaments$#', $uri, $m)) {
        $companyId = (int) $m[1];
        if ($method === 'GET') {
            jsonResponse(TournamentService::listForCompany($companyId));
        }
        if ($method === 'POST') {
            jsonResponse(TournamentService::create($companyId, readJsonBody()), 201);
        }
    }

    if (preg_match('#^/tournaments/(\d+)$#', $uri, $m)) {
        $tournamentId = (int) $m[1];
        if ($method === 'GET') {
            jsonResponse(TournamentService::get($tournamentId));
        }
        if ($method === 'PUT') {
            jsonResponse(TournamentService::updateSettings($tournamentId, readJsonBody()));
        }
        if ($method === 'DELETE') {
            TournamentService::remove($tournamentId);
            jsonResponse(['ok' => true]);
        }
    }

    if (preg_match('#^/tournaments/(\d+)/players$#', $uri, $m)) {
        $tournamentId = (int) $m[1];
        if ($method === 'GET') {
            jsonResponse(TournamentService::players($tournamentId));
        }
        if ($method === 'PUT') {
            $body = readJsonBody();
            jsonResponse(TournamentService::updatePlayers(
                $tournamentId,
                is_array($body['player_ids'] ?? null) ? $body['player_ids'] : []
            ));
        }
    }

    if (preg_match('#^/tournaments/(\d+)/rounds$#', $uri, $m)) {
        if ($method === 'GET') {
            jsonResponse(RoundService::list((int) $m[1]));
        }
        if ($method === 'POST') {
            jsonResponse(RoundService::createNext((int) $m[1]), 201);
        }
    }

    if (preg_match('#^/tournaments/(\d+)/schedule$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RoundService::fullSchedule((int) $m[1]));
    }

    if (preg_match('#^/tournaments/(\d+)/rating$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RatingService::getTournament((int) $m[1]));
    }

    if (preg_match('#^/tournaments/(\d+)/reset$#', $uri, $m) && $method === 'DELETE') {
        TournamentService::reset((int) $m[1]);
        jsonResponse(['ok' => true]);
    }

    if (preg_match('#^/players/(\d+)$#', $uri, $m) && $method === 'PUT') {
        jsonResponse(PlayerService::update((int) $m[1], readJsonBody()));
    }

    if (preg_match('#^/players/(\d+)/stats$#', $uri, $m) && $method === 'GET') {
        jsonResponse(PlayerService::stats((int) $m[1]));
    }

    if (preg_match('#^/players/(\d+)/activate$#', $uri, $m) && $method === 'PUT') {
        jsonResponse(PlayerService::activate((int) $m[1]));
    }

    if (preg_match('#^/players/(\d+)$#', $uri, $m) && $method === 'DELETE') {
        PlayerService::delete((int) $m[1]);
        jsonResponse(['ok' => true]);
    }

    if (preg_match('#^/companies/(\d+)/rounds$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RoundService::list(TournamentService::currentIdForCompany((int) $m[1])));
    }

    if (preg_match('#^/companies/(\d+)/schedule$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RoundService::fullSchedule(TournamentService::currentIdForCompany((int) $m[1])));
    }

    if (preg_match('#^/companies/(\d+)/rounds$#', $uri, $m) && $method === 'POST') {
        jsonResponse(RoundService::createNext(TournamentService::currentIdForCompany((int) $m[1])), 201);
    }

    if (preg_match('#^/matches/(\d+)/score$#', $uri, $m) && $method === 'PUT') {
        jsonResponse(ScoreService::save((int) $m[1], readJsonBody()));
    }

    if (preg_match('#^/companies/(\d+)/rating$#', $uri, $m) && $method === 'GET') {
        jsonResponse(RatingService::getCompany((int) $m[1]));
    }

    jsonError('Маршрут не найден', 404);
}
