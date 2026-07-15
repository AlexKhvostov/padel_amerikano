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
            'SELECT id, round_number, bench_player_ids, created_at
             FROM rounds WHERE company_id = ? ORDER BY round_number ASC'
        );
        $stmt->execute([$companyId]);
        $rounds = $stmt->fetchAll();

        $playerMap = self::playerMap($companyId);

        foreach ($rounds as &$round) {
            $round['id'] = (int) $round['id'];
            $round['round_number'] = (int) $round['round_number'];
            $benchIds = json_decode($round['bench_player_ids'] ?? '[]', true) ?: [];
            $round['bench'] = array_map(fn($id) => $playerMap[$id] ?? ['id' => $id, 'name' => '?'], $benchIds);
            unset($round['bench_player_ids']);
            $round['matches'] = self::matchesForRound((int) $round['id'], $playerMap);
            $round['is_complete'] = self::isRoundComplete($round['matches']);
        }

        return ['rounds' => $rounds];
    }

    public static function createNext(int $companyId): array
    {
        CompanyService::assertAccess($companyId);

        $settings = CompanyService::settings($companyId);
        $playerIds = PlayerService::activeIds($companyId);

        $stmt = db()->prepare('SELECT MAX(round_number) FROM rounds WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $lastNumber = (int) $stmt->fetchColumn();

        if ($lastNumber > 0) {
            $prev = self::list($companyId);
            $lastRound = $prev['rounds'][count($prev['rounds']) - 1] ?? null;
            if ($lastRound && !$lastRound['is_complete']) {
                jsonError('Завершите все матчи текущего раунда перед созданием следующего');
            }
        }

        $generated = RoundGenerator::generate(
            $playerIds,
            (int) $settings['courts_count'],
            $companyId
        );

        $roundNumber = $lastNumber + 1;
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO rounds (company_id, round_number, bench_player_ids) VALUES (?, ?, ?)'
            );
            $stmt->execute([
                $companyId,
                $roundNumber,
                json_encode($generated['bench']),
            ]);
            $roundId = (int) $pdo->lastInsertId();

            foreach ($generated['matches'] as $court => $match) {
                $stmt = $pdo->prepare(
                    'INSERT INTO matches (round_id, court_number) VALUES (?, ?)'
                );
                $stmt->execute([$roundId, $court]);
                $matchId = (int) $pdo->lastInsertId();

                $stmt = $pdo->prepare(
                    'INSERT INTO match_players (match_id, player_id, team) VALUES (?, ?, ?)'
                );
                foreach ($match['team1'] as $pid) {
                    $stmt->execute([$matchId, $pid, 1]);
                }
                foreach ($match['team2'] as $pid) {
                    $stmt->execute([$matchId, $pid, 2]);
                }

                $stmt2 = $pdo->prepare('INSERT INTO match_scores (match_id) VALUES (?)');
                $stmt2->execute([$matchId]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $result = self::list($companyId);
        $newRound = $result['rounds'][count($result['rounds']) - 1];
        if ($generated['warning']) {
            $newRound['warning'] = $generated['warning'];
        }
        return $newRound;
    }

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
            $match['is_finished'] = (bool) $match['is_finished'];
            $match['teams'] = self::teamsForMatch((int) $match['id'], $playerMap);
        }

        return $matches;
    }

    private static function teamsForMatch(int $matchId, array $playerMap): array
    {
        $stmt = db()->prepare(
            'SELECT player_id, team FROM match_players WHERE match_id = ? ORDER BY team, player_id'
        );
        $stmt->execute([$matchId]);
        $teams = [1 => [], 2 => []];
        while ($row = $stmt->fetch()) {
            $pid = (int) $row['player_id'];
            $teams[(int) $row['team']][] = $playerMap[$pid] ?? ['id' => $pid, 'name' => '?'];
        }
        return $teams;
    }

    private static function isRoundComplete(array $matches): bool
    {
        if ($matches === []) {
            return false;
        }
        foreach ($matches as $m) {
            if (!$m['is_finished']) {
                return false;
            }
        }
        return true;
    }

    private static function playerMap(int $companyId): array
    {
        $stmt = db()->prepare('SELECT id, name, telegram, is_active FROM players WHERE company_id = ?');
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
}
