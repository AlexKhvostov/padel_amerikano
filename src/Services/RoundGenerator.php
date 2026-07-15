<?php

declare(strict_types=1);

final class RoundGenerator
{
    /**
     * @param int[] $playerIds
     * @return array{playing: int[], bench: int[], matches: array<int, array{team1: int[], team2: int[]}>}
     */
    public static function generate(array $playerIds, int $courtsCount, int $companyId): array
    {
        $count = count($playerIds);
        if ($count < 4) {
            jsonError('Минимум 4 игрока для старта турнира');
        }

        $remainder = $count % 4;
        $warning = null;
        if ($remainder === 3) {
            $warning = 'Нестандартное количество игроков. Рекомендуем добавить или убрать одного игрока.';
        }

        $playingCount = intdiv($count, 4) * 4;
        $benchCount = $count - $playingCount;

        $benchHistory = self::benchCounts($companyId, $playerIds);
        usort($playerIds, fn($a, $b) => ($benchHistory[$a] ?? 0) <=> ($benchHistory[$b] ?? 0));

        $bench = array_slice($playerIds, -$benchCount);
        $playing = array_slice($playerIds, 0, $playingCount);

        shuffle($playing);

        $partnerHistory = self::partnerHistory($companyId);
        $opponentHistory = self::opponentHistory($companyId);

        $pairs = self::buildPairs($playing, $partnerHistory);
        shuffle($pairs);

        $maxMatches = min($courtsCount, intdiv(count($pairs), 2));
        $matches = [];
        for ($court = 1; $court <= $maxMatches; $court++) {
            $team1 = array_shift($pairs);
            $team2 = self::pickBestOpponent($pairs, $team1, $opponentHistory);
            if (!$team1 || !$team2) {
                break;
            }
            $matches[$court] = ['team1' => $team1, 'team2' => $team2];
        }

        return [
            'playing' => $playing,
            'bench' => $bench,
            'matches' => $matches,
            'warning' => $warning,
        ];
    }

    /** @param int[] $playing */
    private static function buildPairs(array $playing, array $partnerHistory): array
    {
        $pairs = [];
        $remaining = $playing;

        while (count($remaining) >= 2) {
            $a = array_shift($remaining);
            $bestIdx = 0;
            $bestScore = PHP_INT_MAX;
            foreach ($remaining as $idx => $b) {
                $key = self::pairKey($a, $b);
                $score = $partnerHistory[$key] ?? 0;
                if ($score < $bestScore) {
                    $bestScore = $score;
                    $bestIdx = $idx;
                }
            }
            $b = $remaining[$bestIdx];
            array_splice($remaining, $bestIdx, 1);
            $pairs[] = [$a, $b];
        }

        return $pairs;
    }

    /** @param array<int, int[]> $pairs */
    private static function pickBestOpponent(array &$pairs, array $team1, array $opponentHistory): ?array
    {
        if ($pairs === []) {
            return null;
        }
        $bestIdx = 0;
        $bestScore = PHP_INT_MAX;
        foreach ($pairs as $idx => $team2) {
            $score = 0;
            foreach ($team1 as $p1) {
                foreach ($team2 as $p2) {
                    $score += $opponentHistory[self::pairKey($p1, $p2)] ?? 0;
                }
            }
            if ($score < $bestScore) {
                $bestScore = $score;
                $bestIdx = $idx;
            }
        }
        if (!isset($pairs[$bestIdx])) {
            return null;
        }
        $team2 = $pairs[$bestIdx];
        array_splice($pairs, $bestIdx, 1);
        return $team2;
    }

    private static function pairKey(int $a, int $b): string
    {
        return $a < $b ? "$a:$b" : "$b:$a";
    }

    private static function benchCounts(int $companyId, array $playerIds): array
    {
        $stmt = db()->prepare('SELECT bench_player_ids FROM rounds WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $counts = array_fill_keys($playerIds, 0);
        while ($row = $stmt->fetch()) {
            $bench = json_decode($row['bench_player_ids'] ?? '[]', true) ?: [];
            foreach ($bench as $pid) {
                if (isset($counts[$pid])) {
                    $counts[$pid]++;
                }
            }
        }
        return $counts;
    }

    private static function partnerHistory(int $companyId): array
    {
        return self::historyPairs($companyId, true);
    }

    private static function opponentHistory(int $companyId): array
    {
        return self::historyPairs($companyId, false);
    }

    private static function historyPairs(int $companyId, bool $partners): array
    {
        $sql = 'SELECT mp.match_id, mp.player_id, mp.team
                FROM match_players mp
                JOIN matches m ON m.id = mp.match_id
                JOIN rounds r ON r.id = m.round_id
                WHERE r.company_id = ?';
        $stmt = db()->prepare($sql);
        $stmt->execute([$companyId]);

        $byMatch = [];
        while ($row = $stmt->fetch()) {
            $byMatch[$row['match_id']][] = $row;
        }

        $history = [];
        foreach ($byMatch as $rows) {
            $teams = [1 => [], 2 => []];
            foreach ($rows as $row) {
                $teams[(int) $row['team']][] = (int) $row['player_id'];
            }
            if ($partners) {
                foreach ($teams as $team) {
                    if (count($team) === 2) {
                        $key = self::pairKey($team[0], $team[1]);
                        $history[$key] = ($history[$key] ?? 0) + 1;
                    }
                }
            } else {
                foreach ($teams[1] as $p1) {
                    foreach ($teams[2] as $p2) {
                        $key = self::pairKey($p1, $p2);
                        $history[$key] = ($history[$key] ?? 0) + 1;
                    }
                }
            }
        }
        return $history;
    }
}
