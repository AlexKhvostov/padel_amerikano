<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/database.php';
require_once __DIR__ . '/CompanyService.php';

final class TournamentService
{
    public static function publicList(?string $date = null): array
    {
        if ($date !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            jsonError('Некорректная дата');
        }

        $sql = "SELECT
                    t.id,
                    t.company_id,
                    t.name,
                    c.name AS company_name,
                    c.view_slug,
                    DATE_FORMAT(t.created_at, '%Y-%m-%d') AS created_date,
                    DATE_FORMAT(t.created_at, '%H:%i') AS created_time,
                    DATE_FORMAT(t.started_at, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(t.started_at, '%H:%i') AS start_time,
                    DATE_FORMAT(
                        GREATEST(
                            t.created_at,
                            COALESCE(MAX(r.created_at), t.created_at),
                            COALESCE(MAX(ms.updated_at), t.created_at)
                        ),
                        '%Y-%m-%dT%H:%i:%s'
                    ) AS updated_at,
                    COUNT(DISTINCT tp.player_id) AS participants,
                    COUNT(DISTINCT m.id) AS total_matches,
                    COUNT(DISTINCT CASE WHEN ms.is_finished = 1 THEN m.id END) AS played_matches,
                    CASE WHEN t.status = 'draft' THEN 'planned' ELSE t.status END AS status
                FROM tournaments t
                JOIN companies c ON c.id = t.company_id
                LEFT JOIN tournament_players tp
                    ON tp.tournament_id = t.id AND tp.is_active = 1
                LEFT JOIN rounds r ON r.tournament_id = t.id
                LEFT JOIN matches m ON m.round_id = r.id
                LEFT JOIN match_scores ms ON ms.match_id = m.id
                WHERE c.deleted_at IS NULL
                GROUP BY t.id, t.company_id, t.name, c.name, c.view_slug,
                         t.created_at, t.started_at, t.status";

        $params = [];
        if ($date !== null) {
            $sql .= ' HAVING created_date = ?';
            $params[] = $date;
        }
        $sql .= " ORDER BY FIELD(t.status, 'active', 'draft', 'completed'), t.created_at DESC LIMIT 200";

        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['company_id'] = (int) $row['company_id'];
            $row['participants'] = (int) $row['participants'];
            $row['total_matches'] = (int) $row['total_matches'];
            $row['played_matches'] = (int) $row['played_matches'];
        }

        return ['tournaments' => $rows];
    }

    public static function listForCompany(int $companyId): array
    {
        CompanyService::assertAccess($companyId);
        $stmt = db()->prepare(
            "SELECT t.id, t.company_id, t.name, t.status, t.settings,
                    t.started_at, t.completed_at, t.created_at, t.updated_at,
                    COUNT(DISTINCT tp.player_id) AS participants,
                    COUNT(DISTINCT m.id) AS total_matches,
                    COUNT(DISTINCT CASE WHEN ms.is_finished = 1 THEN m.id END) AS played_matches,
                    COALESCE(MAX(CASE WHEN r.status = 'active' THEN r.round_number END), 0) AS active_round,
                    GREATEST(
                        t.updated_at,
                        COALESCE(MAX(r.created_at), t.updated_at),
                        COALESCE(MAX(ms.updated_at), t.updated_at)
                    ) AS last_activity_at,
                    CASE
                        WHEN t.status = 'completed' THEN 'completed'
                        WHEN t.status = 'active' AND GREATEST(
                            t.updated_at,
                            COALESCE(MAX(r.created_at), t.updated_at),
                            COALESCE(MAX(ms.updated_at), t.updated_at)
                        ) >= CURRENT_TIMESTAMP - INTERVAL 15 MINUTE THEN 'active'
                        WHEN t.status = 'active' THEN 'abandoned'
                        WHEN t.status = 'draft'
                             AND t.updated_at >= CURRENT_TIMESTAMP - INTERVAL 1 HOUR
                            THEN 'collecting'
                        ELSE 'draft'
                    END AS display_status
             FROM tournaments t
             LEFT JOIN tournament_players tp
                ON tp.tournament_id = t.id AND tp.is_active = 1
             LEFT JOIN rounds r ON r.tournament_id = t.id
             LEFT JOIN matches m ON m.round_id = r.id
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE t.company_id = ?
             GROUP BY t.id
             ORDER BY FIELD(display_status, 'active', 'collecting', 'abandoned', 'draft', 'completed'),
                      t.created_at DESC"
        );
        $stmt->execute([$companyId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row = self::cast($row);
        }
        return ['tournaments' => $rows];
    }

    public static function create(int $companyId, array $input): array
    {
        CompanyService::assertAccess($companyId, true);
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            $name = 'Турнир ' . date('d.m.Y');
        }
        if (mb_strlen($name) > 100) {
            jsonError('Название турнира слишком длинное');
        }

        $playerIds = array_values(array_unique(array_map('intval', $input['player_ids'] ?? [])));
        if (count($playerIds) < 4 || count($playerIds) > 36) {
            jsonError('Выберите от 4 до 36 участников');
        }
        self::assertCompanyPlayers($companyId, $playerIds);

        $courts = max(1, min(10, (int) ($input['courts_count'] ?? 1)));
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO tournaments (company_id, name, status, settings)
                 VALUES (?, ?, 'draft', ?)"
            );
            $stmt->execute([
                $companyId,
                $name,
                json_encode(['courts_count' => $courts], JSON_UNESCAPED_UNICODE),
            ]);
            $tournamentId = (int) $pdo->lastInsertId();
            $insert = $pdo->prepare(
                'INSERT INTO tournament_players (tournament_id, player_id) VALUES (?, ?)'
            );
            foreach ($playerIds as $playerId) {
                $insert->execute([$tournamentId, $playerId]);
            }
            $pdo->commit();
            return self::get($tournamentId);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function get(int $tournamentId): array
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId);
        $stmt = db()->prepare(
            'SELECT t.*, c.name AS company_name, c.view_slug
             FROM tournaments t
             JOIN companies c ON c.id = t.company_id
             WHERE t.id = ? AND c.deleted_at IS NULL'
        );
        $stmt->execute([$tournamentId]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonError('Турнир не найден', 404);
        }
        return self::cast($row);
    }

    public static function players(int $tournamentId): array
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId);
        $stmt = db()->prepare(
            'SELECT p.id, p.name, p.telegram, p.is_active
             FROM tournament_players tp
             JOIN players p ON p.id = tp.player_id
             WHERE tp.tournament_id = ? AND tp.is_active = 1
             ORDER BY p.name'
        );
        $stmt->execute([$tournamentId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['is_active'] = (bool) $row['is_active'];
        }
        return ['players' => $rows, 'count' => count($rows)];
    }

    public static function updatePlayers(int $tournamentId, array $playerIds): array
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId, true);
        if (self::hasRounds($tournamentId)) {
            jsonError('После начала турнира состав изменить нельзя');
        }
        $playerIds = array_values(array_unique(array_map('intval', $playerIds)));
        if (count($playerIds) < 4 || count($playerIds) > 36) {
            jsonError('Выберите от 4 до 36 участников');
        }
        self::assertCompanyPlayers($companyId, $playerIds);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM tournament_players WHERE tournament_id = ?')
                ->execute([$tournamentId]);
            $insert = $pdo->prepare(
                'INSERT INTO tournament_players (tournament_id, player_id) VALUES (?, ?)'
            );
            foreach ($playerIds as $playerId) {
                $insert->execute([$tournamentId, $playerId]);
            }
            $pdo->prepare('UPDATE tournaments SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([$tournamentId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return self::players($tournamentId);
    }

    public static function updateSettings(int $tournamentId, array $input): array
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId, true);
        if (self::hasRounds($tournamentId)) {
            jsonError('Турнир начат. Изменение настроек недоступно');
        }
        $settings = [
            'courts_count' => max(1, min(10, (int) ($input['courts_count'] ?? 1))),
        ];
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 100) {
            jsonError('Укажите название турнира до 100 символов');
        }
        $stmt = db()->prepare('UPDATE tournaments SET name = ?, settings = ? WHERE id = ?');
        $stmt->execute([$name, json_encode($settings, JSON_UNESCAPED_UNICODE), $tournamentId]);
        return self::get($tournamentId);
    }

    public static function reset(int $tournamentId): void
    {
        $tournament = self::get($tournamentId);
        CompanyService::assertAccess((int) $tournament['company_id'], true);
        if ($tournament['status'] === 'completed') {
            jsonError('Завершённый турнир нельзя сбросить');
        }
        db()->prepare('DELETE FROM rounds WHERE tournament_id = ?')->execute([$tournamentId]);
        db()->prepare(
            "UPDATE tournaments
             SET status = 'draft', started_at = NULL, completed_at = NULL
             WHERE id = ?"
        )->execute([$tournamentId]);
    }

    public static function remove(int $tournamentId): void
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId, true);
        $stmt = db()->prepare(
            "DELETE FROM tournaments
             WHERE id = ?
               AND status = 'draft'
               AND NOT EXISTS (
                   SELECT 1 FROM rounds r WHERE r.tournament_id = tournaments.id
               )"
        );
        $stmt->execute([$tournamentId]);
        if ($stmt->rowCount() !== 1) {
            jsonError('Удалить можно только турнир, который ещё не начался');
        }
    }

    public static function companyId(int $tournamentId): int
    {
        $stmt = db()->prepare(
            'SELECT t.company_id
             FROM tournaments t
             JOIN companies c ON c.id = t.company_id
             WHERE t.id = ? AND c.deleted_at IS NULL'
        );
        $stmt->execute([$tournamentId]);
        $companyId = $stmt->fetchColumn();
        if ($companyId === false) {
            jsonError('Турнир не найден', 404);
        }
        return (int) $companyId;
    }

    public static function currentIdForCompany(int $companyId): int
    {
        CompanyService::assertAccess($companyId);
        $stmt = db()->prepare(
            "SELECT id FROM tournaments
             WHERE company_id = ?
             ORDER BY FIELD(status, 'active', 'draft', 'completed'), created_at DESC
             LIMIT 1"
        );
        $stmt->execute([$companyId]);
        $id = $stmt->fetchColumn();
        if ($id === false) {
            jsonError('В компании пока нет турниров', 404);
        }
        return (int) $id;
    }

    public static function activePlayerIds(int $tournamentId): array
    {
        $stmt = db()->prepare(
            'SELECT tp.player_id
             FROM tournament_players tp
             JOIN players p ON p.id = tp.player_id
             WHERE tp.tournament_id = ? AND tp.is_active = 1
             ORDER BY tp.player_id'
        );
        $stmt->execute([$tournamentId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public static function settings(int $tournamentId): array
    {
        $stmt = db()->prepare('SELECT settings FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        $settings = $stmt->fetchColumn();
        if ($settings === false) {
            jsonError('Турнир не найден', 404);
        }
        return json_decode((string) $settings, true) ?: defaultSettings();
    }

    public static function markStarted(int $tournamentId): void
    {
        db()->prepare(
            "UPDATE tournaments
             SET status = 'active', started_at = COALESCE(started_at, NOW())
             WHERE id = ? AND status = 'draft'"
        )->execute([$tournamentId]);
    }

    public static function assertCanStart(int $tournamentId): void
    {
        $companyId = self::companyId($tournamentId);
        $stmt = db()->prepare(
            "SELECT COUNT(*) FROM tournaments
             WHERE company_id = ? AND status = 'active' AND id <> ?"
        );
        $stmt->execute([$companyId, $tournamentId]);
        if ((int) $stmt->fetchColumn() > 0) {
            jsonError('В компании уже идёт другой турнир', 409);
        }
    }

    public static function refreshCompletion(int $tournamentId): void
    {
        $stmt = db()->prepare(
            "SELECT COUNT(*) AS total,
                    SUM(status IN ('planned', 'active')) AS pending
             FROM rounds WHERE tournament_id = ?"
        );
        $stmt->execute([$tournamentId]);
        $state = $stmt->fetch();
        if ((int) ($state['total'] ?? 0) > 0 && (int) ($state['pending'] ?? 0) === 0) {
            db()->prepare(
                "UPDATE tournaments
                 SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
                 WHERE id = ?"
            )->execute([$tournamentId]);
        }
    }

    private static function hasRounds(int $tournamentId): bool
    {
        $stmt = db()->prepare('SELECT COUNT(*) FROM rounds WHERE tournament_id = ?');
        $stmt->execute([$tournamentId]);
        return (int) $stmt->fetchColumn() > 0;
    }

    private static function assertCompanyPlayers(int $companyId, array $playerIds): void
    {
        $placeholders = implode(',', array_fill(0, count($playerIds), '?'));
        $stmt = db()->prepare(
            "SELECT COUNT(*) FROM players
             WHERE company_id = ? AND is_active = 1 AND id IN ($placeholders)"
        );
        $stmt->execute([$companyId, ...$playerIds]);
        if ((int) $stmt->fetchColumn() !== count($playerIds)) {
            jsonError('В составе есть недоступные участники');
        }
    }

    private static function cast(array $row): array
    {
        foreach (['id', 'company_id', 'participants', 'total_matches', 'played_matches', 'active_round'] as $key) {
            if (array_key_exists($key, $row)) {
                $row[$key] = (int) $row[$key];
            }
        }
        if (isset($row['settings']) && is_string($row['settings'])) {
            $row['settings'] = json_decode($row['settings'], true) ?: defaultSettings();
        }
        unset($row['active_company_id']);
        return $row;
    }
}
