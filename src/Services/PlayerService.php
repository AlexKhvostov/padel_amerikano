<?php

declare(strict_types=1);

final class PlayerService
{
    public static function list(int $companyId): array
    {
        CompanyService::assertAccess($companyId);

        $stmt = db()->prepare(
            'SELECT p.id, p.name, p.telegram, p.is_active, p.created_at,
                    COALESCE(s.matches, 0) AS matches,
                    COALESCE(s.points, 0) AS points,
                    COALESCE(s.tournaments_played, 0) AS tournaments_played,
                    COALESCE(s.wins, 0) AS wins,
                    COALESCE(s.losses, 0) AS losses,
                    COALESCE(s.point_share, 0) AS point_share,
                    COALESCE(s.average_difference, 0) AS average_difference,
                    CASE WHEN COALESCE(s.matches, 0) > 0
                         THEN ROUND(s.wins * 100 / s.matches, 1) ELSE 0 END AS win_rate
             FROM players p
             LEFT JOIN (
                SELECT mp.player_id,
                       COUNT(*) AS matches,
                       SUM(CASE WHEN mp.team = 1 THEN ms.score_team1 ELSE ms.score_team2 END) AS points,
                       COUNT(DISTINCT r.tournament_id) AS tournaments_played,
                       SUM(CASE
                           WHEN (mp.team = 1 AND ms.score_team1 > ms.score_team2)
                             OR (mp.team = 2 AND ms.score_team2 > ms.score_team1)
                           THEN 1 ELSE 0 END) AS wins,
                       SUM(CASE
                           WHEN (mp.team = 1 AND ms.score_team1 < ms.score_team2)
                             OR (mp.team = 2 AND ms.score_team2 < ms.score_team1)
                           THEN 1 ELSE 0 END) AS losses,
                       ROUND(AVG(CASE
                           WHEN ms.score_team1 + ms.score_team2 > 0 THEN
                               (CASE WHEN mp.team = 1 THEN ms.score_team1 ELSE ms.score_team2 END)
                               * 100.0 / (ms.score_team1 + ms.score_team2)
                           ELSE 0 END), 1) AS point_share,
                       ROUND(AVG(CASE
                           WHEN mp.team = 1 THEN ms.score_team1 - ms.score_team2
                           ELSE ms.score_team2 - ms.score_team1 END), 2) AS average_difference
                FROM match_players mp
                JOIN matches m ON m.id = mp.match_id
                JOIN rounds r ON r.id = m.round_id
                JOIN match_scores ms ON ms.match_id = m.id AND ms.is_finished = 1
                GROUP BY mp.player_id
             ) s ON s.player_id = p.id
             WHERE p.company_id = ?
             ORDER BY p.is_active DESC,
                      CASE WHEN COALESCE(s.matches, 0) >= 5 THEN 1 ELSE 0 END DESC,
                      COALESCE(s.point_share, 0) DESC,
                      COALESCE(s.average_difference, 0) DESC,
                      CASE WHEN COALESCE(s.matches, 0) > 0
                           THEN s.wins / s.matches ELSE 0 END DESC,
                      COALESCE(s.matches, 0) DESC,
                      p.name ASC'
        );
        $stmt->execute([$companyId]);
        $players = $stmt->fetchAll();

        foreach ($players as &$p) {
            $p['id'] = (int) $p['id'];
            $p['is_active'] = (bool) $p['is_active'];
            $p['matches'] = (int) $p['matches'];
            $p['points'] = (int) $p['points'];
            $p['tournaments_played'] = (int) $p['tournaments_played'];
            $p['wins'] = (int) $p['wins'];
            $p['losses'] = (int) $p['losses'];
            $p['point_share'] = (float) $p['point_share'];
            $p['average_difference'] = (float) $p['average_difference'];
            $p['win_rate'] = (float) $p['win_rate'];
            $p['is_provisional'] = $p['matches'] < 5;
            $p['telegram'] = self::normalizeTelegramDisplay($p['telegram']);
        }

        return [
            'players' => $players,
            'active_count' => count(array_filter($players, fn($p) => $p['is_active'])),
            'max' => 200,
            'min_to_start' => 4,
        ];
    }

    public static function create(int $companyId, array $input): array
    {
        CompanyService::assertAccess($companyId, true);

        $name = trim($input['name'] ?? '');
        if ($name === '') {
            jsonError('Укажите имя игрока');
        }
        if (mb_strlen($name) > 100) {
            jsonError('Имя игрока не должно превышать 100 символов');
        }

        $stmt = db()->prepare('SELECT COUNT(*) FROM players WHERE company_id = ? AND is_active = 1');
        $stmt->execute([$companyId]);
        if ((int) $stmt->fetchColumn() >= 200) {
            jsonError('Достигнут лимит: максимум 200 участников компании');
        }

        $telegram = self::normalizeTelegramStorage($input['telegram'] ?? null);

        $inactiveStmt = db()->prepare(
            'SELECT id FROM players WHERE company_id = ? AND name = ? AND is_active = 0 LIMIT 1'
        );
        $inactiveStmt->execute([$companyId, $name]);
        $inactiveId = $inactiveStmt->fetchColumn();
        if ($inactiveId !== false) {
            $stmt = db()->prepare(
                'UPDATE players SET is_active = 1, telegram = ? WHERE id = ?'
            );
            $stmt->execute([$telegram, (int) $inactiveId]);
            return self::find((int) $inactiveId);
        }

        try {
            $stmt = db()->prepare(
                'INSERT INTO players (company_id, name, telegram) VALUES (?, ?, ?)'
            );
            $stmt->execute([$companyId, $name, $telegram]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Игрок с таким именем уже есть в компании');
            }
            throw $e;
        }

        $playerId = (int) db()->lastInsertId();
        return self::find($playerId);
    }

    public static function update(int $playerId, array $input): array
    {
        $player = self::find($playerId);
        CompanyService::assertAccess((int) $player['company_id'], true);

        $name = trim($input['name'] ?? $player['name']);
        if ($name === '') {
            jsonError('Укажите имя игрока');
        }
        if (mb_strlen($name) > 100) {
            jsonError('Имя игрока не должно превышать 100 символов');
        }

        $telegram = array_key_exists('telegram', $input)
            ? self::normalizeTelegramStorage($input['telegram'])
            : $player['telegram_raw'];

        try {
            $stmt = db()->prepare('UPDATE players SET name = ?, telegram = ? WHERE id = ?');
            $stmt->execute([$name, $telegram, $playerId]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Игрок с таким именем уже есть в компании');
            }
            throw $e;
        }

        return self::find($playerId);
    }

    public static function delete(int $playerId): void
    {
        $player = self::find($playerId);
        CompanyService::assertAccess((int) $player['company_id'], true);

        $stmt = db()->prepare('UPDATE players SET is_active = 0 WHERE id = ?');
        $stmt->execute([$playerId]);
        $stmt = db()->prepare(
            "UPDATE tournament_players tp
             JOIN tournaments t ON t.id = tp.tournament_id
             SET tp.is_active = 0
             WHERE tp.player_id = ? AND t.status = 'draft'"
        );
        $stmt->execute([$playerId]);
    }

    public static function activate(int $playerId): array
    {
        $player = self::find($playerId);
        CompanyService::assertAccess((int) $player['company_id'], true);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE players SET is_active = 1 WHERE id = ?')->execute([$playerId]);
            $pdo->prepare(
                "UPDATE tournament_players tp
                 JOIN tournaments t ON t.id = tp.tournament_id
                 SET tp.is_active = 1
                 WHERE tp.player_id = ? AND t.status = 'draft'"
            )->execute([$playerId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        return self::find($playerId);
    }

    public static function stats(int $playerId): array
    {
        $player = self::find($playerId);
        CompanyService::assertAccess((int) $player['company_id']);

        $stmt = db()->prepare(
            'SELECT COUNT(*) AS matches,
                    COALESCE(SUM(CASE WHEN mp.team = 1 THEN ms.score_team1 ELSE ms.score_team2 END), 0) AS points,
                    COALESCE(SUM(CASE WHEN mp.team = 1 THEN ms.score_team2 ELSE ms.score_team1 END), 0) AS opponent_points,
                    COUNT(DISTINCT r.tournament_id) AS tournaments_played,
                    COALESCE(SUM(CASE
                        WHEN (mp.team = 1 AND ms.score_team1 > ms.score_team2)
                          OR (mp.team = 2 AND ms.score_team2 > ms.score_team1)
                        THEN 1 ELSE 0 END), 0) AS wins,
                    COALESCE(SUM(CASE
                        WHEN (mp.team = 1 AND ms.score_team1 < ms.score_team2)
                          OR (mp.team = 2 AND ms.score_team2 < ms.score_team1)
                        THEN 1 ELSE 0 END), 0) AS losses,
                    COALESCE(ROUND(AVG(CASE
                        WHEN ms.score_team1 + ms.score_team2 > 0 THEN
                            (CASE WHEN mp.team = 1 THEN ms.score_team1 ELSE ms.score_team2 END)
                            * 100.0 / (ms.score_team1 + ms.score_team2)
                        ELSE 0 END), 1), 0) AS point_share,
                    COALESCE(ROUND(AVG(CASE
                        WHEN mp.team = 1 THEN ms.score_team1 - ms.score_team2
                        ELSE ms.score_team2 - ms.score_team1 END), 2), 0) AS average_difference
             FROM match_players mp
             JOIN matches m ON m.id = mp.match_id
             JOIN rounds r ON r.id = m.round_id
             JOIN match_scores ms ON ms.match_id = m.id AND ms.is_finished = 1
             WHERE mp.player_id = ?'
        );
        $stmt->execute([$playerId]);
        $summary = $stmt->fetch() ?: [];
        $matches = (int) ($summary['matches'] ?? 0);
        $points = (int) ($summary['points'] ?? 0);
        $opponentPoints = (int) ($summary['opponent_points'] ?? 0);
        $tournamentsPlayed = (int) ($summary['tournaments_played'] ?? 0);
        $wins = (int) ($summary['wins'] ?? 0);
        $losses = (int) ($summary['losses'] ?? 0);
        $pointShare = (float) ($summary['point_share'] ?? 0);
        $averageDifference = (float) ($summary['average_difference'] ?? 0);

        $stmt = db()->prepare(
            'SELECT t.id, t.name, t.status, t.created_at, t.started_at,
                    (SELECT COUNT(*) FROM tournament_players all_tp
                     WHERE all_tp.tournament_id = t.id AND all_tp.is_active = 1) AS participants,
                    COUNT(CASE WHEN ms.is_finished = 1 AND mp.player_id IS NOT NULL THEN 1 END) AS matches,
                    COALESCE(SUM(CASE
                        WHEN ms.is_finished = 1 AND mp.team = 1 THEN ms.score_team1
                        WHEN ms.is_finished = 1 AND mp.team = 2 THEN ms.score_team2
                        ELSE 0 END), 0) AS points,
                    COALESCE(SUM(CASE
                        WHEN ms.is_finished = 1 AND (
                            (mp.team = 1 AND ms.score_team1 > ms.score_team2)
                            OR (mp.team = 2 AND ms.score_team2 > ms.score_team1)
                        ) THEN 1 ELSE 0 END), 0) AS wins,
                    COALESCE(SUM(CASE
                        WHEN ms.is_finished = 1 AND (
                            (mp.team = 1 AND ms.score_team1 < ms.score_team2)
                            OR (mp.team = 2 AND ms.score_team2 < ms.score_team1)
                        ) THEN 1 ELSE 0 END), 0) AS losses
             FROM tournament_players tp
             JOIN tournaments t ON t.id = tp.tournament_id
             LEFT JOIN rounds r ON r.tournament_id = t.id
             LEFT JOIN matches m ON m.round_id = r.id
             LEFT JOIN match_players mp ON mp.match_id = m.id AND mp.player_id = tp.player_id
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE tp.player_id = ?
             GROUP BY t.id
             ORDER BY COALESCE(t.started_at, t.created_at) DESC'
        );
        $stmt->execute([$playerId]);
        $history = $stmt->fetchAll();
        $finishScores = [];
        foreach ($history as &$item) {
            $item['id'] = (int) $item['id'];
            $item['participants'] = (int) $item['participants'];
            $item['matches'] = (int) $item['matches'];
            $item['points'] = (int) $item['points'];
            $item['wins'] = (int) $item['wins'];
            $item['losses'] = (int) $item['losses'];
            $item['place'] = $item['matches'] > 0
                ? self::tournamentPlace((int) $item['id'], $playerId)
                : null;
            $item['finish_percentile'] = null;
            if (
                $item['status'] === 'completed'
                && $item['place'] !== null
                && $item['participants'] > 1
            ) {
                $item['finish_percentile'] = round(
                    (1 - (($item['place'] - 1) / ($item['participants'] - 1))) * 100,
                    1
                );
                $finishScores[] = $item['finish_percentile'];
            }
        }
        unset($item);

        return [
            'player' => [
                'id' => $playerId,
                'name' => $player['name'],
                'telegram' => $player['telegram'],
                'is_active' => $player['is_active'],
            ],
            'summary' => [
                'tournaments_played' => $tournamentsPlayed,
                'matches' => $matches,
                'points' => $points,
                'opponent_points' => $opponentPoints,
                'wins' => $wins,
                'losses' => $losses,
                'win_rate' => $matches > 0 ? round($wins * 100 / $matches, 1) : 0.0,
                'point_share' => $pointShare,
                'average_difference' => $averageDifference,
                'average_finish_percentile' => $finishScores !== []
                    ? round(array_sum($finishScores) / count($finishScores), 1)
                    : null,
                'is_provisional' => $matches < 5,
            ],
            'tournaments' => $history,
        ];
    }

    public static function find(int $playerId): array
    {
        $stmt = db()->prepare('SELECT * FROM players WHERE id = ?');
        $stmt->execute([$playerId]);
        $player = $stmt->fetch();
        if (!$player) {
            jsonError('Игрок не найден', 404);
        }

        $player['id'] = (int) $player['id'];
        $player['company_id'] = (int) $player['company_id'];
        $player['is_active'] = (bool) $player['is_active'];
        $player['telegram_raw'] = $player['telegram'];
        $player['telegram'] = self::normalizeTelegramDisplay($player['telegram']);

        return $player;
    }

    public static function activeIds(int $companyId): array
    {
        $stmt = db()->prepare(
            'SELECT id FROM players WHERE company_id = ? AND is_active = 1 ORDER BY id'
        );
        $stmt->execute([$companyId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    private static function tournamentPlace(int $tournamentId, int $playerId): ?int
    {
        $stmt = db()->prepare(
            'WITH player_stats AS (
                SELECT p.id, p.name,
                       COUNT(CASE
                           WHEN ms.is_finished = 1 AND mp.player_id IS NOT NULL THEN 1
                       END) AS matches,
                       COALESCE(SUM(CASE
                           WHEN ms.is_finished = 1 AND mp.team = 1 THEN ms.score_team1
                           WHEN ms.is_finished = 1 AND mp.team = 2 THEN ms.score_team2
                           ELSE 0 END), 0) AS points,
                       COALESCE(SUM(CASE
                           WHEN ms.is_finished = 1 AND (
                               (mp.team = 1 AND ms.score_team1 > ms.score_team2)
                               OR (mp.team = 2 AND ms.score_team2 > ms.score_team1)
                           ) THEN 1 ELSE 0 END), 0) AS wins
                FROM tournament_players tp
                JOIN players p ON p.id = tp.player_id
                LEFT JOIN rounds r ON r.tournament_id = tp.tournament_id
                LEFT JOIN matches m ON m.round_id = r.id
                LEFT JOIN match_players mp ON mp.match_id = m.id AND mp.player_id = p.id
                LEFT JOIN match_scores ms ON ms.match_id = m.id
                WHERE tp.tournament_id = ?
                GROUP BY p.id, p.name
             ),
             ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (ORDER BY points DESC, wins DESC, name ASC) AS place
                FROM player_stats
                WHERE matches > 0
             )
             SELECT place FROM ranked WHERE id = ?'
        );
        $stmt->execute([$tournamentId, $playerId]);
        $place = $stmt->fetchColumn();
        return $place === false ? null : (int) $place;
    }

    private static function normalizeTelegramStorage(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }
        $value = trim($value);
        if (preg_match('#^(?:https?://)?(?:www\.)?t\.me/([A-Za-z0-9_]{5,32})/?$#i', $value, $m)) {
            return '@' . $m[1];
        }
        $username = ltrim($value, '@');
        if (!preg_match('/^[A-Za-z0-9_]{5,32}$/', $username)) {
            jsonError('Telegram должен содержать 5–32 латинских символа, цифры или _');
        }
        return '@' . $username;
    }

    private static function normalizeTelegramDisplay(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return str_starts_with($value, '@') ? $value : '@' . $value;
    }

}

require_once __DIR__ . '/CompanyService.php';
