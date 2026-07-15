<?php

declare(strict_types=1);

require_once __DIR__ . '/CompanyService.php';

final class RatingService
{
    public static function get(int $companyId): array
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

        $stats = [];
        foreach ($players as $p) {
            $stats[(int) $p['id']] = [
                'id' => (int) $p['id'],
                'name' => $p['name'],
                'telegram' => $p['telegram'],
                'is_active' => (bool) $p['is_active'],
                'matches' => 0,
                'points' => 0,
                'wins' => 0,
                'losses' => 0,
            ];
        }

        $sql = 'SELECT mp.player_id, mp.team, ms.score_team1, ms.score_team2
                FROM match_players mp
                JOIN matches m ON m.id = mp.match_id
                JOIN rounds r ON r.id = m.round_id
                JOIN match_scores ms ON ms.match_id = m.id
                WHERE r.company_id = ? AND ms.is_finished = 1';
        $stmt = db()->prepare($sql);
        $stmt->execute([$companyId]);

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
            if ($myScore > $oppScore) {
                $stats[$pid]['wins']++;
            } else {
                $stats[$pid]['losses']++;
            }
        }

        $rating = array_values($stats);
        usort($rating, function ($a, $b) {
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

        return ['rating' => $rating];
    }
}
