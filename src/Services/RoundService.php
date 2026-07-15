<?php

declare(strict_types=1);

require_once __DIR__ . '/CompanyService.php';
require_once __DIR__ . '/PlayerService.php';
require_once __DIR__ . '/RoundGenerator.php';

final class RoundService
{
    public static function list(int $companyId): array
    {
        CompanyService::assertAccess($companyId);

        $stmt = db()->prepare(
            "SELECT id, round_number, bench_player_ids, status, created_at
             FROM rounds
             WHERE company_id = ? AND status <> 'planned'
             ORDER BY round_number ASC"
        );
        $stmt->execute([$companyId]);
        $rounds = $stmt->fetchAll();
        $playerMap = self::playerMap($companyId);

        foreach ($rounds as &$round) {
            $round = self::hydrateRound($round, $playerMap);
        }

        $schedule = $rounds === []
            ? self::previewSchedule($companyId)
            : self::scheduleSummary($companyId);

        return [
            'rounds' => $rounds,
            'schedule' => $schedule,
        ];
    }

    public static function fullSchedule(int $companyId): array
    {
        CompanyService::assertAccess($companyId);

        $stmt = db()->prepare(
            'SELECT id, round_number, bench_player_ids, status, created_at
             FROM rounds
             WHERE company_id = ?
             ORDER BY round_number ASC'
        );
        $stmt->execute([$companyId]);
        $rounds = $stmt->fetchAll();
        $playerMap = self::playerMap($companyId);

        if ($rounds !== []) {
            return ['rounds' => self::hydrateFullSchedule($companyId, $rounds, $playerMap)];
        }

        $playerIds = PlayerService::activeIds($companyId);
        if (count($playerIds) < 4) {
            return ['rounds' => []];
        }

        $settings = CompanyService::settings($companyId);
        $preview = RoundGenerator::generateSchedule(
            $playerIds,
            max(1, (int) ($settings['courts_count'] ?? 1))
        );

        $result = [];
        foreach ($preview['rounds'] as $index => $round) {
            $matches = [];
            foreach ($round['matches'] as $court => $match) {
                $matches[] = [
                    'id' => null,
                    'court_number' => (int) $court,
                    'score_team1' => null,
                    'score_team2' => null,
                    'is_finished' => false,
                    'teams' => [
                        1 => array_map(
                            fn(int $id) => $playerMap[$id] ?? ['id' => $id, 'name' => '?'],
                            $match['team1']
                        ),
                        2 => array_map(
                            fn(int $id) => $playerMap[$id] ?? ['id' => $id, 'name' => '?'],
                            $match['team2']
                        ),
                    ],
                ];
            }

            $result[] = [
                'id' => null,
                'round_number' => $index + 1,
                'status' => 'planned',
                'bench' => array_map(
                    fn(int $id) => $playerMap[$id] ?? ['id' => $id, 'name' => '?'],
                    $round['bench']
                ),
                'matches' => $matches,
                'is_complete' => false,
            ];
        }

        return ['rounds' => $result];
    }

    public static function createNext(int $companyId): array
    {
        CompanyService::assertAccess($companyId, true);
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $companyStmt = $pdo->prepare('SELECT settings FROM companies WHERE id = ? FOR UPDATE');
            $companyStmt->execute([$companyId]);
            $company = $companyStmt->fetch();
            if (!$company) {
                $pdo->rollBack();
                jsonError('Компания не найдена', 404);
            }

            $activeStmt = $pdo->prepare(
                "SELECT id FROM rounds
                 WHERE company_id = ? AND status = 'active'
                 ORDER BY round_number ASC LIMIT 1 FOR UPDATE"
            );
            $activeStmt->execute([$companyId]);
            $activeRoundId = $activeStmt->fetchColumn();

            if ($activeRoundId !== false) {
                if (!self::isRoundCompleteById((int) $activeRoundId)) {
                    $pdo->rollBack();
                    jsonError('Завершите все матчи текущего раунда перед созданием следующего');
                }
                $stmt = $pdo->prepare("UPDATE rounds SET status = 'completed' WHERE id = ?");
                $stmt->execute([(int) $activeRoundId]);
            }

            $plannedStmt = $pdo->prepare(
                "SELECT id FROM rounds
                 WHERE company_id = ? AND status = 'planned'
                 ORDER BY round_number ASC LIMIT 1 FOR UPDATE"
            );
            $plannedStmt->execute([$companyId]);
            $nextId = $plannedStmt->fetchColumn();

            if ($nextId === false) {
                if (count(PlayerService::activeIds($companyId)) < 4) {
                    $pdo->rollBack();
                    jsonError('Минимум 4 активных игрока для создания раунда');
                }
                self::appendMissingSchedule(
                    $companyId,
                    json_decode($company['settings'], true) ?: defaultSettings()
                );
                $plannedStmt->execute([$companyId]);
                $nextId = $plannedStmt->fetchColumn();
            }

            if ($nextId === false) {
                $pdo->commit();
                jsonError('Полная ротация завершена', 409);
            }

            $stmt = $pdo->prepare("UPDATE rounds SET status = 'active' WHERE id = ?");
            $stmt->execute([(int) $nextId]);
            $pdo->commit();

            return self::findPublishedRound($companyId, (int) $nextId);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Удаляет будущий план. Текущий и завершённые раунды не меняются.
     */
    public static function invalidatePlanned(int $companyId): void
    {
        $stmt = db()->prepare("DELETE FROM rounds WHERE company_id = ? AND status = 'planned'");
        $stmt->execute([$companyId]);
    }

    /** @param array<string, mixed> $settings */
    private static function appendMissingSchedule(int $companyId, array $settings): void
    {
        $playerIds = PlayerService::activeIds($companyId);
        if (count($playerIds) < 4) {
            throw new InvalidArgumentException(
                'Минимум 4 активных игрока для создания раунда'
            );
        }

        $history = self::partnerHistory($companyId);
        $schedule = RoundGenerator::generateSchedule(
            $playerIds,
            max(1, (int) ($settings['courts_count'] ?? 1)),
            $history,
            self::opponentHistory($companyId)
        );

        if ($schedule['rounds'] === []) {
            return;
        }

        $stmt = db()->prepare('SELECT COALESCE(MAX(round_number), 0) FROM rounds WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $roundNumber = (int) $stmt->fetchColumn();

        foreach ($schedule['rounds'] as $round) {
            $roundNumber++;
            $stmt = db()->prepare(
                "INSERT INTO rounds
                    (company_id, round_number, bench_player_ids, status)
                 VALUES (?, ?, ?, 'planned')"
            );
            $stmt->execute([
                $companyId,
                $roundNumber,
                json_encode($round['bench'], JSON_THROW_ON_ERROR),
            ]);
            $roundId = (int) db()->lastInsertId();

            foreach ($round['matches'] as $court => $match) {
                $stmt = db()->prepare(
                    'INSERT INTO matches (round_id, court_number) VALUES (?, ?)'
                );
                $stmt->execute([$roundId, $court]);
                $matchId = (int) db()->lastInsertId();

                $playerStmt = db()->prepare(
                    'INSERT INTO match_players (match_id, player_id, team) VALUES (?, ?, ?)'
                );
                foreach ($match['team1'] as $playerId) {
                    $playerStmt->execute([$matchId, $playerId, 1]);
                }
                foreach ($match['team2'] as $playerId) {
                    $playerStmt->execute([$matchId, $playerId, 2]);
                }

                $scoreStmt = db()->prepare('INSERT INTO match_scores (match_id) VALUES (?)');
                $scoreStmt->execute([$matchId]);
            }
        }
    }

    /** @param array<string, mixed> $round @param array<int, array<string, mixed>> $playerMap */
    private static function hydrateRound(array $round, array $playerMap): array
    {
        $round['id'] = (int) $round['id'];
        $round['round_number'] = (int) $round['round_number'];
        $benchIds = json_decode($round['bench_player_ids'] ?? '[]', true) ?: [];
        $round['bench'] = array_map(
            fn($id) => $playerMap[$id] ?? ['id' => (int) $id, 'name' => '?'],
            $benchIds
        );
        unset($round['bench_player_ids']);
        $round['matches'] = self::matchesForRound((int) $round['id'], $playerMap);
        $round['is_complete'] = self::isRoundComplete($round['matches']);
        return $round;
    }

    /**
     * @param array<int, array<string, mixed>> $rounds
     * @param array<int, array<string, mixed>> $playerMap
     * @return array<int, array<string, mixed>>
     */
    private static function hydrateFullSchedule(
        int $companyId,
        array $rounds,
        array $playerMap
    ): array {
        $stmt = db()->prepare(
            'SELECT m.id, m.round_id, m.court_number,
                    ms.score_team1, ms.score_team2, ms.is_finished,
                    mp.player_id, mp.team
             FROM rounds r
             JOIN matches m ON m.round_id = r.id
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             LEFT JOIN match_players mp ON mp.match_id = m.id
             WHERE r.company_id = ?
             ORDER BY r.round_number, m.court_number, mp.team, mp.player_id'
        );
        $stmt->execute([$companyId]);

        $matches = [];
        while ($row = $stmt->fetch()) {
            $roundId = (int) $row['round_id'];
            $matchId = (int) $row['id'];
            if (!isset($matches[$roundId][$matchId])) {
                $matches[$roundId][$matchId] = [
                    'id' => $matchId,
                    'court_number' => (int) $row['court_number'],
                    'score_team1' => $row['score_team1'] === null
                        ? null
                        : (int) $row['score_team1'],
                    'score_team2' => $row['score_team2'] === null
                        ? null
                        : (int) $row['score_team2'],
                    'is_finished' => (bool) $row['is_finished'],
                    'teams' => [1 => [], 2 => []],
                ];
            }

            if ($row['player_id'] !== null) {
                $playerId = (int) $row['player_id'];
                $matches[$roundId][$matchId]['teams'][(int) $row['team']][] =
                    $playerMap[$playerId] ?? ['id' => $playerId, 'name' => '?'];
            }
        }

        foreach ($rounds as &$round) {
            $round['id'] = (int) $round['id'];
            $round['round_number'] = (int) $round['round_number'];
            $benchIds = json_decode($round['bench_player_ids'] ?? '[]', true) ?: [];
            $round['bench'] = array_map(
                fn($id) => $playerMap[$id] ?? ['id' => (int) $id, 'name' => '?'],
                $benchIds
            );
            unset($round['bench_player_ids']);
            $round['matches'] = array_values($matches[(int) $round['id']] ?? []);
            $round['is_complete'] = self::isRoundComplete($round['matches']);
        }

        return $rounds;
    }

    private static function findPublishedRound(int $companyId, int $roundId): array
    {
        $stmt = db()->prepare(
            "SELECT id, round_number, bench_player_ids, status, created_at
             FROM rounds
             WHERE id = ? AND company_id = ? AND status <> 'planned'"
        );
        $stmt->execute([$roundId, $companyId]);
        $round = $stmt->fetch();
        if (!$round) {
            jsonError('Раунд не найден', 404);
        }
        return self::hydrateRound($round, self::playerMap($companyId));
    }

    /** @param array<int, array<string, mixed>> $playerMap */
    private static function matchesForRound(int $roundId, array $playerMap): array
    {
        $stmt = db()->prepare(
            'SELECT m.id, m.court_number, ms.score_team1, ms.score_team2, ms.is_finished
             FROM matches m
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE m.round_id = ?
             ORDER BY m.court_number ASC'
        );
        $stmt->execute([$roundId]);
        $matches = $stmt->fetchAll();

        foreach ($matches as &$match) {
            $match['id'] = (int) $match['id'];
            $match['court_number'] = (int) $match['court_number'];
            $match['score_team1'] = $match['score_team1'] === null ? null : (int) $match['score_team1'];
            $match['score_team2'] = $match['score_team2'] === null ? null : (int) $match['score_team2'];
            $match['is_finished'] = (bool) $match['is_finished'];
            $match['teams'] = self::teamsForMatch((int) $match['id'], $playerMap);
        }

        return $matches;
    }

    /** @param array<int, array<string, mixed>> $playerMap */
    private static function teamsForMatch(int $matchId, array $playerMap): array
    {
        $stmt = db()->prepare(
            'SELECT player_id, team FROM match_players WHERE match_id = ? ORDER BY team, player_id'
        );
        $stmt->execute([$matchId]);
        $teams = [1 => [], 2 => []];
        while ($row = $stmt->fetch()) {
            $playerId = (int) $row['player_id'];
            $teams[(int) $row['team']][] = $playerMap[$playerId]
                ?? ['id' => $playerId, 'name' => '?'];
        }
        return $teams;
    }

    /** @param array<int, array<string, mixed>> $matches */
    private static function isRoundComplete(array $matches): bool
    {
        return $matches !== []
            && array_reduce(
                $matches,
                fn(bool $complete, array $match): bool => $complete && $match['is_finished'],
                true
            );
    }

    private static function isRoundCompleteById(int $roundId): bool
    {
        $stmt = db()->prepare(
            'SELECT COUNT(*) AS total,
                    SUM(CASE WHEN ms.is_finished = 1 THEN 1 ELSE 0 END) AS finished
             FROM matches m
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE m.round_id = ?'
        );
        $stmt->execute([$roundId]);
        $row = $stmt->fetch();
        return (int) $row['total'] > 0 && (int) $row['total'] === (int) $row['finished'];
    }

    /** @return array<int, array<string, mixed>> */
    private static function playerMap(int $companyId): array
    {
        $stmt = db()->prepare(
            'SELECT id, name, telegram, is_active FROM players WHERE company_id = ?'
        );
        $stmt->execute([$companyId]);
        $map = [];
        while ($row = $stmt->fetch()) {
            $map[(int) $row['id']] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'telegram' => $row['telegram'],
                'is_active' => (bool) $row['is_active'],
            ];
        }
        return $map;
    }

    /** @return array<string, int> */
    private static function partnerHistory(int $companyId): array
    {
        $stmt = db()->prepare(
            "SELECT mp.match_id, mp.player_id, mp.team
             FROM match_players mp
             JOIN matches m ON m.id = mp.match_id
             JOIN rounds r ON r.id = m.round_id
             WHERE r.company_id = ? AND r.status IN ('active', 'completed')
             ORDER BY mp.match_id, mp.team"
        );
        $stmt->execute([$companyId]);
        $matches = [];
        while ($row = $stmt->fetch()) {
            $matches[(int) $row['match_id']][(int) $row['team']][] = (int) $row['player_id'];
        }

        $history = [];
        foreach ($matches as $teams) {
            foreach ($teams as $players) {
                if (count($players) !== 2) {
                    continue;
                }
                sort($players);
                $key = $players[0] . ':' . $players[1];
                $history[$key] = ($history[$key] ?? 0) + 1;
            }
        }
        return $history;
    }

    /** @return array<string, int> */
    private static function opponentHistory(int $companyId): array
    {
        $stmt = db()->prepare(
            "SELECT mp.match_id, mp.player_id, mp.team
             FROM match_players mp
             JOIN matches m ON m.id = mp.match_id
             JOIN rounds r ON r.id = m.round_id
             WHERE r.company_id = ? AND r.status IN ('active', 'completed')
             ORDER BY mp.match_id, mp.team"
        );
        $stmt->execute([$companyId]);
        $matches = [];
        while ($row = $stmt->fetch()) {
            $matches[(int) $row['match_id']][(int) $row['team']][] = (int) $row['player_id'];
        }

        $history = [];
        foreach ($matches as $teams) {
            foreach ($teams[1] ?? [] as $a) {
                foreach ($teams[2] ?? [] as $b) {
                    $key = min($a, $b) . ':' . max($a, $b);
                    $history[$key] = ($history[$key] ?? 0) + 1;
                }
            }
        }
        return $history;
    }

    private static function scheduleSummary(int $companyId): array
    {
        $stmt = db()->prepare(
            "SELECT COUNT(DISTINCT r.id) AS total_rounds,
                    COUNT(m.id) AS total_matches,
                    SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed_rows,
                    SUM(CASE WHEN r.status = 'planned' THEN 1 ELSE 0 END) AS planned_rows
             FROM rounds r
             LEFT JOIN matches m ON m.round_id = r.id
             WHERE r.company_id = ?"
        );
        $stmt->execute([$companyId]);
        $row = $stmt->fetch();

        $roundStmt = db()->prepare(
            "SELECT
                SUM(status = 'completed') AS completed_rounds,
                SUM(status = 'planned') AS planned_rounds
             FROM rounds WHERE company_id = ?"
        );
        $roundStmt->execute([$companyId]);
        $roundCounts = $roundStmt->fetch();
        $activeIds = PlayerService::activeIds($companyId);
        $activeLookup = array_fill_keys($activeIds, true);
        $coveredPairs = 0;
        foreach (self::partnerHistory($companyId) as $key => $count) {
            [$a, $b] = array_map('intval', explode(':', $key));
            if ($count > 0 && isset($activeLookup[$a], $activeLookup[$b])) {
                $coveredPairs++;
            }
        }
        $totalPairs = intdiv(count($activeIds) * (count($activeIds) - 1), 2);

        return [
            'total_rounds' => (int) ($row['total_rounds'] ?? 0),
            'total_matches' => (int) ($row['total_matches'] ?? 0),
            'completed_rounds' => (int) ($roundCounts['completed_rounds'] ?? 0),
            'planned_rounds' => (int) ($roundCounts['planned_rounds'] ?? 0),
            'covered_partnerships' => $coveredPairs,
            'total_partnerships' => $totalPairs,
            'rotation_complete' => $totalPairs > 0 && $coveredPairs >= $totalPairs,
        ];
    }

    private static function previewSchedule(int $companyId): array
    {
        $playerIds = PlayerService::activeIds($companyId);
        if (count($playerIds) < 4) {
            return [
                'preview' => true,
                'total_rounds' => 0,
                'total_matches' => 0,
                'minimum_players_required' => 4,
            ];
        }

        $settings = CompanyService::settings($companyId);
        $schedule = RoundGenerator::generateSchedule(
            $playerIds,
            max(1, (int) ($settings['courts_count'] ?? 1))
        );
        $games = array_values($schedule['games_per_player']);

        return [
            'preview' => true,
            'total_rounds' => count($schedule['rounds']),
            'total_matches' => $schedule['total_matches'],
            'completed_rounds' => 0,
            'planned_rounds' => count($schedule['rounds']),
            'covered_partnerships' => 0,
            'total_partnerships' => intdiv(count($playerIds) * (count($playerIds) - 1), 2),
            'rotation_complete' => false,
            'minimum_games_per_player' => min($games),
            'maximum_games_per_player' => max($games),
            'repeated_partnerships' => $schedule['repeated_partnerships'],
        ];
    }
}
