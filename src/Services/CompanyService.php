<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/Auth/Token.php';
require_once dirname(__DIR__) . '/Services/LoginGuard.php';
require_once dirname(__DIR__, 2) . '/config/database.php';
require_once dirname(__DIR__, 2) . '/config/app.php';

final class CompanyService
{
    public static function publicList(
        string $query = '',
        int $page = 1,
        ?array $companyIds = null,
        ?string $activityStatus = null
    ): array
    {
        $query = trim($query);
        $page = max(1, $page);
        $perPage = 10;
        $offset = ($page - 1) * $perPage;
        $like = '%' . $query . '%';
        $allowedStatuses = ['active', 'collecting', 'abandoned', 'idle'];
        if (!in_array($activityStatus, $allowedStatuses, true)) {
            $activityStatus = null;
        }
        $activitySql = "(CASE
            WHEN EXISTS (
                SELECT 1
                FROM tournaments active_t
                WHERE active_t.company_id = c.id
                  AND active_t.status = 'active'
                  AND GREATEST(
                      active_t.updated_at,
                      COALESCE((
                          SELECT MAX(active_r.created_at)
                          FROM rounds active_r
                          WHERE active_r.tournament_id = active_t.id
                      ), active_t.updated_at),
                      COALESCE((
                          SELECT MAX(active_ms.updated_at)
                          FROM rounds active_sr
                          JOIN matches active_m ON active_m.round_id = active_sr.id
                          JOIN match_scores active_ms ON active_ms.match_id = active_m.id
                          WHERE active_sr.tournament_id = active_t.id
                      ), active_t.updated_at)
                  ) >= CURRENT_TIMESTAMP - INTERVAL 15 MINUTE
            ) THEN 'active'
            WHEN EXISTS (
                SELECT 1 FROM tournaments abandoned_t
                WHERE abandoned_t.company_id = c.id AND abandoned_t.status = 'active'
            ) THEN 'abandoned'
            WHEN EXISTS (
                SELECT 1 FROM tournaments draft_t
                WHERE draft_t.company_id = c.id
                  AND draft_t.status = 'draft'
                  AND draft_t.updated_at >= CURRENT_TIMESTAMP - INTERVAL 1 HOUR
            ) THEN 'collecting'
            ELSE 'idle'
        END)";
        if ($companyIds !== null) {
            $companyIds = array_values(array_unique(array_filter(
                array_map('intval', $companyIds),
                static fn (int $id): bool => $id > 0
            )));
            $companyIds = array_slice($companyIds, 0, 100);
            if ($companyIds === []) {
                return [
                    'companies' => [],
                    'pagination' => [
                        'page' => 1,
                        'per_page' => $perPage,
                        'total' => 0,
                        'total_pages' => 1,
                    ],
                ];
            }
        }

        $where = 'c.deleted_at IS NULL AND c.name LIKE ?';
        $whereParams = [$like];
        if ($companyIds !== null) {
            $placeholders = implode(',', array_fill(0, count($companyIds), '?'));
            $where .= " AND c.id IN ($placeholders)";
            array_push($whereParams, ...$companyIds);
        }
        if ($activityStatus !== null) {
            $where .= " AND $activitySql = ?";
            $whereParams[] = $activityStatus;
        }

        $countStmt = db()->prepare(
            "SELECT COUNT(*) FROM companies c WHERE $where"
        );
        $countStmt->execute($whereParams);
        $total = (int) $countStmt->fetchColumn();

        $orderSql = 'updated_at DESC, c.id DESC';
        $orderParams = [];
        if ($companyIds !== null) {
            $orderPlaceholders = implode(',', array_fill(0, count($companyIds), '?'));
            $orderSql = "FIELD(c.id, $orderPlaceholders)";
            $orderParams = $companyIds;
        }

        $stmt = db()->prepare(
            "SELECT c.id, c.name, c.view_slug, c.created_at,
                    (SELECT COUNT(*) FROM players p
                     WHERE p.company_id = c.id AND p.is_active = 1) AS participants,
                    (SELECT COUNT(*) FROM tournaments t
                     WHERE t.company_id = c.id) AS tournaments_count,
                    (SELECT COUNT(*)
                     FROM tournaments t
                     JOIN rounds r ON r.tournament_id = t.id
                     JOIN matches m ON m.round_id = r.id
                     WHERE t.company_id = c.id) AS total_matches,
                    (SELECT COUNT(*)
                     FROM tournaments t
                     JOIN rounds r ON r.tournament_id = t.id
                     JOIN matches m ON m.round_id = r.id
                     JOIN match_scores ms ON ms.match_id = m.id AND ms.is_finished = 1
                     WHERE t.company_id = c.id) AS played_matches,
                    $activitySql AS activity_status,
                    GREATEST(
                        c.created_at,
                        COALESCE((SELECT MAX(p2.created_at) FROM players p2
                                  WHERE p2.company_id = c.id), c.created_at),
                        COALESCE((SELECT MAX(t2.updated_at) FROM tournaments t2
                                  WHERE t2.company_id = c.id), c.created_at),
                        COALESCE((
                            SELECT MAX(ms2.updated_at)
                            FROM tournaments t3
                            JOIN rounds r2 ON r2.tournament_id = t3.id
                            JOIN matches m2 ON m2.round_id = r2.id
                            JOIN match_scores ms2 ON ms2.match_id = m2.id
                            WHERE t3.company_id = c.id
                        ), c.created_at)
                    ) AS updated_at
             FROM companies c
             WHERE $where
             ORDER BY $orderSql
             LIMIT $perPage OFFSET $offset"
        );
        $stmt->execute([...$whereParams, ...$orderParams]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            foreach ([
                'id',
                'participants',
                'tournaments_count',
                'total_matches',
                'played_matches',
            ] as $key) {
                $row[$key] = (int) $row[$key];
            }
        }

        return [
            'companies' => $rows,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public static function search(string $query): array
    {
        $stmt = db()->prepare(
            'SELECT id, name
             FROM companies
             WHERE deleted_at IS NULL AND name LIKE ?
             ORDER BY name LIMIT 20'
        );
        $stmt->execute(['%' . $query . '%']);
        return $stmt->fetchAll();
    }

    public static function create(string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            jsonError('Укажите название компании');
        }
        if (mb_strlen($name) > 100) {
            jsonError('Название компании слишком длинное');
        }

        $plainPassword = (string) random_int(1000, 999999);
        $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
        $viewToken = bin2hex(random_bytes(32));
        $viewSlug = rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
        $settings = json_encode(defaultSettings(), JSON_UNESCAPED_UNICODE);

        try {
            $stmt = db()->prepare(
                'INSERT INTO companies
                    (name, password, view_token, view_slug, settings)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $hash, $viewToken, $viewSlug, $settings]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Компания с таким названием уже существует');
            }
            throw $e;
        }

        $id = (int) db()->lastInsertId();
        $token = Token::create($id);

        return [
            'id' => $id,
            'name' => $name,
            'password' => $plainPassword,
            'view_token' => $viewToken,
            'view_slug' => $viewSlug,
            'role' => 'admin',
            'token' => $token,
            'settings' => defaultSettings(),
        ];
    }

    public static function login(string $name, string $password): array
    {
        $name = trim($name);
        LoginGuard::assertAllowed($name);

        $stmt = db()->prepare(
            'SELECT * FROM companies WHERE deleted_at IS NULL AND name = ? LIMIT 1'
        );
        $stmt->execute([$name]);
        $company = $stmt->fetch();

        if (!$company || !password_verify($password, $company['password'])) {
            LoginGuard::recordFailure($name);
            jsonError('Неверное название компании или пароль', 401);
        }

        LoginGuard::recordSuccess($name);
        $settings = json_decode($company['settings'], true) ?: defaultSettings();

        return [
            'id' => (int) $company['id'],
            'name' => $company['name'],
            'password' => $password,
            'view_token' => $company['view_token'],
            'view_slug' => $company['view_slug'],
            'role' => 'admin',
            'token' => Token::create((int) $company['id']),
            'settings' => $settings,
        ];
    }

    public static function get(int $companyId): array
    {
        $stmt = db()->prepare(
            'SELECT id, name, view_token, view_slug, settings, created_at
             FROM companies WHERE id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$companyId]);
        $company = $stmt->fetch();
        if (!$company) {
            jsonError('Компания не найдена', 404);
        }
        $company['id'] = (int) $company['id'];
        $company['settings'] = json_decode($company['settings'], true) ?: defaultSettings();
        $company['tournament_started'] = self::isTournamentStarted($companyId);
        return $company;
    }

    public static function loginViewer(string $viewKey): array
    {
        $isSlug = preg_match('/^[A-Za-z0-9_-]{12}$/', $viewKey) === 1;
        $isLegacyToken = preg_match('/^[a-f0-9]{64}$/', $viewKey) === 1;
        if (!$isSlug && !$isLegacyToken) {
            jsonError('Ссылка просмотра недействительна', 404);
        }

        $stmt = db()->prepare(
            $isSlug
                ? 'SELECT id, name, view_token, settings
                   FROM companies WHERE view_slug = ? AND deleted_at IS NULL LIMIT 1'
                : 'SELECT id, name, view_token, settings
                   FROM companies WHERE view_token = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$viewKey]);
        $company = $stmt->fetch();
        if (!$company) {
            jsonError('Ссылка просмотра недействительна', 404);
        }

        $settings = json_decode($company['settings'], true) ?: defaultSettings();
        unset($settings['access_code']);

        return [
            'id' => (int) $company['id'],
            'name' => $company['name'],
            'role' => 'viewer',
            'token' => $company['view_token'],
            'settings' => $settings,
        ];
    }

    public static function updateSettings(int $companyId, array $input): array
    {
        $tournamentId = self::currentTournamentId($companyId);
        $stmt = db()->prepare('SELECT COUNT(*) FROM rounds WHERE tournament_id = ?');
        $stmt->execute([$tournamentId]);
        if ((int) $stmt->fetchColumn() > 0) {
            jsonError('Турнир начат. Изменение настроек недоступно');
        }

        $settings = defaultSettings();
        if (isset($input['courts_count'])) {
            $courts = max(1, min(10, (int) $input['courts_count']));
            $settings['courts_count'] = $courts;
        }

        $stmt = db()->prepare('UPDATE tournaments SET settings = ? WHERE id = ?');
        $stmt->execute([json_encode($settings, JSON_UNESCAPED_UNICODE), $tournamentId]);

        return $settings;
    }

    public static function rename(int $companyId, string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            jsonError('Укажите название компании');
        }
        if (mb_strlen($name) > 100) {
            jsonError('Название компании слишком длинное');
        }

        try {
            $stmt = db()->prepare(
                'UPDATE companies
                 SET name = ?
                 WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$name, $companyId]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Компания с таким названием уже существует');
            }
            throw $e;
        }

        if ($stmt->rowCount() !== 1) {
            $check = db()->prepare(
                'SELECT COUNT(*) FROM companies
                 WHERE id = ? AND name = ? AND deleted_at IS NULL'
            );
            $check->execute([$companyId, $name]);
            if ((int) $check->fetchColumn() !== 1) {
                jsonError('Компания не найдена', 404);
            }
        }

        return ['name' => $name];
    }

    public static function changePassword(
        int $companyId,
        string $currentPassword,
        string $newPassword
    ): void {
        if (!preg_match('/^\d{4,8}$/', $newPassword)) {
            jsonError('Новый код должен содержать от 4 до 8 цифр');
        }

        $stmt = db()->prepare(
            'SELECT password FROM companies WHERE id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$companyId]);
        $hash = $stmt->fetchColumn();
        if ($hash === false) {
            jsonError('Компания не найдена', 404);
        }
        if (!password_verify($currentPassword, (string) $hash)) {
            jsonError('Текущий код указан неверно');
        }
        if (password_verify($newPassword, (string) $hash)) {
            jsonError('Новый код должен отличаться от текущего');
        }

        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = db()->prepare('UPDATE companies SET password = ? WHERE id = ?');
        $stmt->execute([$newHash, $companyId]);
    }

    public static function reset(int $companyId): void
    {
        $tournamentId = self::currentTournamentId($companyId);
        $stmt = db()->prepare("SELECT status FROM tournaments WHERE id = ?");
        $stmt->execute([$tournamentId]);
        if ($stmt->fetchColumn() === 'completed') {
            jsonError('Завершённый турнир нельзя сбросить');
        }
        db()->prepare('DELETE FROM rounds WHERE tournament_id = ?')->execute([$tournamentId]);
        db()->prepare(
            "UPDATE tournaments SET status = 'draft', started_at = NULL, completed_at = NULL
             WHERE id = ?"
        )->execute([$tournamentId]);
    }

    public static function delete(int $companyId): void
    {
        $stmt = db()->prepare(
            'UPDATE companies SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$companyId]);
        if ($stmt->rowCount() !== 1) {
            jsonError('Компания не найдена', 404);
        }
    }

    public static function isTournamentStarted(int $companyId): bool
    {
        $stmt = db()->prepare(
            "SELECT COUNT(*) FROM tournaments
             WHERE company_id = ? AND status = 'active'"
        );
        $stmt->execute([$companyId]);
        return (int) $stmt->fetchColumn() > 0;
    }

    public static function assertAccess(int $companyId, bool $write = false): string
    {
        $authId = Token::fromRequest();
        if ($authId === $companyId) {
            $stmt = db()->prepare(
                'SELECT COUNT(*) FROM companies WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$companyId]);
            if ((int) $stmt->fetchColumn() === 1) {
                return 'admin';
            }
        }

        if (!$write) {
            $viewToken = Token::rawFromRequest();
            $stmt = db()->prepare(
                'SELECT COUNT(*) FROM companies
                 WHERE id = ? AND view_token = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$companyId, $viewToken]);
            if ((int) $stmt->fetchColumn() === 1) {
                return 'viewer';
            }
        }

        jsonError(
            $write ? 'Изменения доступны только администратору' : 'Доступ запрещён',
            403
        );
    }

    public static function settings(int $companyId): array
    {
        $company = self::get($companyId);
        return $company['settings'];
    }

    private static function currentTournamentId(int $companyId): int
    {
        $stmt = db()->prepare(
            "SELECT id FROM tournaments WHERE company_id = ?
             ORDER BY FIELD(status, 'active', 'draft', 'completed'), created_at DESC LIMIT 1"
        );
        $stmt->execute([$companyId]);
        $id = $stmt->fetchColumn();
        if ($id === false) {
            jsonError('В компании пока нет турниров', 404);
        }
        return (int) $id;
    }
}
