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
                  AND t.archived_at IS NULL
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

    public static function listForCompany(int $companyId, bool $archived = false): array
    {
        CompanyService::assertAccess($companyId);
        $archiveClause = $archived ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL';
        $stmt = db()->prepare(
            "SELECT t.id, t.company_id, t.name, t.status, t.settings,
                    t.started_at, t.completed_at, t.created_at, t.updated_at, t.archived_at,
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
                        WHEN t.archived_at IS NOT NULL THEN 'archived'
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
             WHERE t.company_id = ? AND $archiveClause
             GROUP BY t.id
             ORDER BY FIELD(display_status, 'active', 'collecting', 'abandoned', 'draft', 'completed', 'archived'),
                      t.created_at DESC"
        );
        $stmt->execute([$companyId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row = self::cast($row);
        }
        return ['tournaments' => $rows, 'archived' => $archived];
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

        $settings = normalizeTournamentSettings([
            'courts_count' => (int) ($input['courts_count'] ?? 1),
            'format' => (int) ($input['format'] ?? 24),
            'allow_extra_ball' => array_key_exists('allow_extra_ball', $input)
                ? filter_var($input['allow_extra_ball'], FILTER_VALIDATE_BOOLEAN)
                : true,
            'allow_draw' => array_key_exists('allow_draw', $input)
                ? filter_var($input['allow_draw'], FILTER_VALIDATE_BOOLEAN)
                : false,
        ]);
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
                json_encode($settings, JSON_UNESCAPED_UNICODE),
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
        $current = self::get($tournamentId);
        $locked = self::hasRounds($tournamentId);
        $settings = normalizeTournamentSettings($current['settings'] ?? null);

        if (array_key_exists('format', $input)) {
            $settings['format'] = (int) $input['format'] === 16 ? 16 : 24;
        }
        if (array_key_exists('allow_extra_ball', $input)) {
            $settings['allow_extra_ball'] = filter_var($input['allow_extra_ball'], FILTER_VALIDATE_BOOLEAN);
        }
        if (array_key_exists('allow_draw', $input)) {
            $settings['allow_draw'] = filter_var($input['allow_draw'], FILTER_VALIDATE_BOOLEAN);
        }

        $name = (string) ($current['name'] ?? '');
        if (!$locked) {
            if (array_key_exists('name', $input)) {
                $name = trim((string) $input['name']);
                if ($name === '' || mb_strlen($name) > 100) {
                    jsonError('Укажите название турнира до 100 символов');
                }
            }
            if (array_key_exists('courts_count', $input)) {
                $settings['courts_count'] = max(1, min(10, (int) $input['courts_count']));
            }
        } elseif (
            (array_key_exists('name', $input) && trim((string) $input['name']) !== $name)
            || (
                array_key_exists('courts_count', $input)
                && (int) $input['courts_count'] !== (int) $settings['courts_count']
            )
        ) {
            jsonError('После начала турнира название, состав и корты защищены от изменений');
        }

        $stmt = db()->prepare('UPDATE tournaments SET name = ?, settings = ? WHERE id = ?');
        $stmt->execute([$name, json_encode($settings, JSON_UNESCAPED_UNICODE), $tournamentId]);
        return self::get($tournamentId);
    }

    public static function archive(int $tournamentId): array
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId, true);
        $tournament = self::get($tournamentId);
        if (!empty($tournament['archived_at'])) {
            return $tournament;
        }
        if ($tournament['status'] === 'active') {
            db()->prepare(
                "UPDATE tournaments
                 SET status = 'completed',
                     completed_at = COALESCE(completed_at, NOW()),
                     archived_at = NOW()
                 WHERE id = ?"
            )->execute([$tournamentId]);
        } else {
            db()->prepare('UPDATE tournaments SET archived_at = NOW() WHERE id = ?')
                ->execute([$tournamentId]);
        }
        return self::get($tournamentId);
    }

    public static function unarchive(int $tournamentId): array
    {
        $companyId = self::companyId($tournamentId);
        CompanyService::assertAccess($companyId, true);
        db()->prepare('UPDATE tournaments SET archived_at = NULL WHERE id = ?')
            ->execute([$tournamentId]);
        return self::get($tournamentId);
    }

    public static function clone(int $tournamentId): array
    {
        $source = self::get($tournamentId);
        $companyId = (int) $source['company_id'];
        CompanyService::assertAccess($companyId, true);
        if ($source['status'] !== 'completed') {
            jsonError('Повторить можно только завершённый турнир');
        }

        $players = self::players($tournamentId);
        $playerIds = array_map(static fn(array $row): int => (int) $row['id'], $players['players']);
        if (count($playerIds) < 4) {
            jsonError('В исходном турнире меньше 4 участников');
        }

        $settings = normalizeTournamentSettings($source['settings'] ?? null);
        $name = self::nextCloneName($companyId, (string) $source['name']);

        return self::create($companyId, [
            'name' => $name,
            'player_ids' => $playerIds,
            'courts_count' => $settings['courts_count'],
            'format' => $settings['format'],
            'allow_extra_ball' => $settings['allow_extra_ball'],
            'allow_draw' => $settings['allow_draw'],
        ]);
    }

    private static function nextCloneName(int $companyId, string $sourceName): string
    {
        $base = trim((string) preg_replace('/\s*\(\d+\)\s*$/u', '', $sourceName));
        if ($base === '') {
            $base = 'Турнир';
        }

        $stmt = db()->prepare('SELECT name FROM tournaments WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $names = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $used = [];
        $pattern = '/^' . preg_quote($base, '/') . '\s*\((\d+)\)\s*$/u';
        foreach ($names as $name) {
            $name = (string) $name;
            if ($name === $base) {
                $used[0] = true;
            }
            if (preg_match($pattern, $name, $match)) {
                $used[(int) $match[1]] = true;
            }
        }

        $n = 1;
        while (isset($used[$n])) {
            $n++;
        }
        $candidate = $base . ' (' . $n . ')';
        if (mb_strlen($candidate) > 100) {
            $trimTo = 100 - mb_strlen(' (' . $n . ')');
            $candidate = mb_substr($base, 0, max(1, $trimTo)) . ' (' . $n . ')';
        }
        return $candidate;
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
        $stmt = db()->prepare('DELETE FROM tournaments WHERE id = ?');
        $stmt->execute([$tournamentId]);
        if ($stmt->rowCount() !== 1) {
            jsonError('Турнир не найден', 404);
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
             WHERE company_id = ? AND archived_at IS NULL
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
        return normalizeTournamentSettings(
            json_decode((string) $settings, true) ?: null
        );
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
             WHERE company_id = ? AND status = 'active' AND id <> ? AND archived_at IS NULL"
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
        if (isset($row['settings'])) {
            $decoded = is_string($row['settings'])
                ? (json_decode($row['settings'], true) ?: null)
                : $row['settings'];
            $row['settings'] = normalizeTournamentSettings(is_array($decoded) ? $decoded : null);
        }
        $row['is_archived'] = !empty($row['archived_at']);
        unset($row['active_company_id']);
        return $row;
    }
}
