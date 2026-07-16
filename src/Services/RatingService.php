<?php

declare(strict_types=1);

require_once __DIR__ . '/CompanyService.php';
require_once __DIR__ . '/TournamentService.php';

final class RatingService
{
    public static function getTournament(int $tournamentId): array
    {
        $companyId = TournamentService::companyId($tournamentId);
        CompanyService::assertAccess($companyId);

        $stmt = db()->prepare(
            'SELECT p.id, p.name, p.telegram, p.is_active
             FROM tournament_players tp
             JOIN players p ON p.id = tp.player_id
             WHERE tp.tournament_id = ? AND tp.is_active = 1
             ORDER BY p.name ASC'
        );
        $stmt->execute([$tournamentId]);
        $players = $stmt->fetchAll();
        return self::build($players, 'r.tournament_id = ?', [$tournamentId], false);
    }

    public static function getCompany(int $companyId): array
    {
        CompanyService::assertAccess($companyId);
        $stmt = db()->prepare(
            'SELECT p.id, p.name, p.telegram, p.is_active
             FROM players p
             WHERE p.company_id = ?
             ORDER BY p.name ASC'
        );
        $stmt->execute([$companyId]);
        $players = $stmt->fetchAll();
        return self::build($players, 'r.company_id = ?', [$companyId], true);
    }

    private static function build(
        array $players,
        string $scope,
        array $params,
        bool $sortByAverage
    ): array {
        $stats = [];
        foreach ($players as $p) {
            $stats[(int) $p['id']] = [
                'id' => (int) $p['id'],
                'name' => $p['name'],
                'telegram' => $p['telegram'],
                'is_active' => (bool) $p['is_active'],
                'planned_matches' => 0,
                'matches' => 0,
                'points' => 0,
                'opponent_points' => 0,
                'wins' => 0,
                'losses' => 0,
                'tournaments_played' => 0,
                'point_share_sum' => 0.0,
                'point_share' => 0.0,
                'average_difference' => 0.0,
                'win_rate' => 0.0,
                'is_provisional' => true,
            ];
        }

        $stmt = db()->prepare(
            "SELECT mp.player_id, COUNT(*) AS planned_matches,
                    COUNT(DISTINCT r.tournament_id) AS tournaments_played
             FROM match_players mp
             JOIN matches m ON m.id = mp.match_id
             JOIN rounds r ON r.id = m.round_id
             WHERE $scope
             GROUP BY mp.player_id"
        );
        $stmt->execute($params);
        while ($row = $stmt->fetch()) {
            $pid = (int) $row['player_id'];
            if (isset($stats[$pid])) {
                $stats[$pid]['planned_matches'] = (int) $row['planned_matches'];
                $stats[$pid]['tournaments_played'] = (int) $row['tournaments_played'];
            }
        }

        $sql = "SELECT mp.player_id, mp.team, ms.score_team1, ms.score_team2
                FROM match_players mp
                JOIN matches m ON m.id = mp.match_id
                JOIN rounds r ON r.id = m.round_id
                JOIN match_scores ms ON ms.match_id = m.id
                WHERE $scope AND ms.is_finished = 1";
        $stmt = db()->prepare($sql);
        $stmt->execute($params);

        while ($row = $stmt->fetch()) {
            $pid = (int) $row['player_id'];
            if (!isset($stats[$pid])) {
                continue;
            }
            $team = (int) $row['team'];
            $s1 = (int) $row['score_team1'];
            $s2 = (int) $row['score_team2'];
            $myScore = $team === 1 ? $s1 : $s2;
            $oppScore = $team === 1 ? $s2 : $s1;

            $stats[$pid]['matches']++;
            $stats[$pid]['points'] += $myScore;
            $stats[$pid]['opponent_points'] += $oppScore;
            $totalScore = $myScore + $oppScore;
            if ($totalScore > 0) {
                $stats[$pid]['point_share_sum'] += $myScore * 100 / $totalScore;
            }
            if ($myScore > $oppScore) {
                $stats[$pid]['wins']++;
            } else {
                $stats[$pid]['losses']++;
            }
        }

        $rating = array_values($stats);
        foreach ($rating as &$row) {
            if ($row['matches'] > 0) {
                $row['point_share'] = round($row['point_share_sum'] / $row['matches'], 1);
                $row['average_difference'] = round(
                    ($row['points'] - $row['opponent_points']) / $row['matches'],
                    2
                );
                $row['win_rate'] = round($row['wins'] * 100 / $row['matches'], 1);
            }
            $row['is_provisional'] = $row['matches'] < 5;
            unset($row['point_share_sum']);
        }
        unset($row);

        usort($rating, function ($a, $b) use ($sortByAverage) {
            if ($sortByAverage && $a['is_provisional'] !== $b['is_provisional']) {
                return $a['is_provisional'] <=> $b['is_provisional'];
            }
            if ($sortByAverage && $a['point_share'] !== $b['point_share']) {
                return $b['point_share'] <=> $a['point_share'];
            }
            if ($sortByAverage && $a['average_difference'] !== $b['average_difference']) {
                return $b['average_difference'] <=> $a['average_difference'];
            }
            if ($sortByAverage && $a['win_rate'] !== $b['win_rate']) {
                return $b['win_rate'] <=> $a['win_rate'];
            }
            if ($sortByAverage && $a['matches'] !== $b['matches']) {
                return $b['matches'] <=> $a['matches'];
            }
            if ($a['points'] !== $b['points']) {
                return $b['points'] <=> $a['points'];
            }
            if ($a['wins'] !== $b['wins']) {
                return $b['wins'] <=> $a['wins'];
            }
            return strcmp($a['name'], $b['name']);
        });

        $medals = ['🥇', '🥈', '🥉'];
        foreach ($rating as $i => &$row) {
            $row['place'] = $i + 1;
            $row['medal'] = $medals[$i] ?? null;
        }

        $stmt = db()->prepare(
            "SELECT COUNT(*) AS total_matches,
                    COALESCE(SUM(CASE WHEN ms.is_finished = 1 THEN 1 ELSE 0 END), 0) AS played_matches
             FROM matches m
             JOIN rounds r ON r.id = m.round_id
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE $scope"
        );
        $stmt->execute($params);
        $progress = $stmt->fetch() ?: ['total_matches' => 0, 'played_matches' => 0];

        return [
            'rating' => $rating,
            'progress' => [
                'played' => (int) $progress['played_matches'],
                'total' => (int) $progress['total_matches'],
            ],
            'scope' => $sortByAverage ? 'company' : 'tournament',
        ];
    }
}
