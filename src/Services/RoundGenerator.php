<?php

declare(strict_types=1);

/**
 * Строит полную ротацию партнёров без обращений к БД.
 *
 * Каждая уникальная пара игроков становится командой ровно один раз.
 * Если число команд нечётное, добавляется один неизбежный повтор.
 */
final class RoundGenerator
{
    /**
     * @param int[] $playerIds
     * @param array<string, int> $partnerHistory ключ "minId:maxId" => число игр в паре
     * @param array<string, int> $opponentHistory ключ "minId:maxId" => число встреч соперниками
     * @return array{
     *   rounds: array<int, array{matches: array<int, array{team1: int[], team2: int[]}>, bench: int[]}>,
     *   total_matches: int,
     *   repeated_partnerships: int,
     *   games_per_player: array<int, int>
     * }
     */
    public static function generateSchedule(
        array $playerIds,
        int $courtsCount,
        array $partnerHistory = [],
        array $opponentHistory = []
    ): array {
        $playerIds = array_values(array_unique(array_map('intval', $playerIds)));
        sort($playerIds);

        if (count($playerIds) < 4) {
            throw new InvalidArgumentException('Минимум 4 игрока для старта турнира');
        }
        if ($courtsCount < 1) {
            throw new InvalidArgumentException('Количество кортов должно быть не меньше 1');
        }
        $opponentHistory = self::completePairCounts($playerIds, $opponentHistory);

        if (
            $partnerHistory === []
            && $opponentHistory === array_fill_keys(array_keys($opponentHistory), 0)
            && count($playerIds) === 8
        ) {
            return self::buildEightPlayerWhistSchedule($playerIds, $courtsCount);
        }

        if (
            $partnerHistory === []
            && count($playerIds) % 4 === 0
            && count($playerIds) <= 16
            && $courtsCount >= intdiv(count($playerIds), 4)
        ) {
            return self::buildResolvableSchedule(
                $playerIds,
                $courtsCount,
                $opponentHistory
            );
        }

        $partnerEdges = self::missingPartnerEdges($playerIds, $partnerHistory);
        if ($partnerEdges === []) {
            return [
                'rounds' => [],
                'total_matches' => 0,
                'repeated_partnerships' => 0,
                'games_per_player' => array_fill_keys($playerIds, 0),
            ];
        }

        $repeatCount = 0;
        if (count($partnerEdges) % 2 !== 0) {
            $partnerEdges[] = self::pickRepeatEdge($playerIds, $partnerHistory);
            $repeatCount = 1;
        }

        $seed = self::seed($playerIds, $courtsCount, $partnerHistory + $opponentHistory);
        mt_srand($seed);

        $matches = self::buildBestMatches($partnerEdges, $opponentHistory);
        $rounds = self::packBestRounds($matches, $playerIds, $courtsCount);
        $games = array_fill_keys($playerIds, 0);

        foreach ($matches as $match) {
            foreach (array_merge($match['team1'], $match['team2']) as $playerId) {
                $games[$playerId]++;
            }
        }

        return [
            'rounds' => $rounds,
            'total_matches' => count($matches),
            'repeated_partnerships' => $repeatCount,
            'games_per_player' => $games,
        ];
    }

    /**
     * Для восьми игроков находит точный whist-дизайн:
     * каждый партнёр один раз, каждый соперник два раза.
     *
     * @param int[] $playerIds
     */
    private static function buildEightPlayerWhistSchedule(
        array $playerIds,
        int $courtsCount
    ): array {
        $edgeList = self::missingPartnerEdges($playerIds, []);
        $edges = [];
        foreach ($edgeList as $edge) {
            $edges[self::pairKey($edge[0], $edge[1])] = $edge;
        }
        $opponents = self::completePairCounts($playerIds, []);
        $solution = null;

        $search = function (
            array $remaining,
            array $rounds,
            array $counts
        ) use (&$search, &$solution, $playerIds): bool {
            if ($remaining === []) {
                $solution = $rounds;
                return true;
            }

            $firstKey = array_key_first($remaining);
            $team1 = $remaining[$firstKey];
            $withoutFirst = $remaining;
            unset($withoutFirst[$firstKey]);

            foreach ($withoutFirst as $secondKey => $team2) {
                if (!self::areDisjoint($team1, $team2)) {
                    continue;
                }
                $match1 = ['team1' => $team1, 'team2' => $team2];
                if (!self::canAddOpponents($match1, $counts, 2)) {
                    continue;
                }

                $used = array_merge($team1, $team2);
                $otherPlayers = array_values(array_diff($playerIds, $used));
                $partitions = [
                    [[$otherPlayers[0], $otherPlayers[1]], [$otherPlayers[2], $otherPlayers[3]]],
                    [[$otherPlayers[0], $otherPlayers[2]], [$otherPlayers[1], $otherPlayers[3]]],
                    [[$otherPlayers[0], $otherPlayers[3]], [$otherPlayers[1], $otherPlayers[2]]],
                ];

                foreach ($partitions as [$team3, $team4]) {
                    sort($team3);
                    sort($team4);
                    $thirdKey = self::pairKey($team3[0], $team3[1]);
                    $fourthKey = self::pairKey($team4[0], $team4[1]);
                    if (
                        !isset($withoutFirst[$thirdKey], $withoutFirst[$fourthKey])
                        || $thirdKey === $secondKey
                        || $fourthKey === $secondKey
                    ) {
                        continue;
                    }

                    $match2 = ['team1' => $team3, 'team2' => $team4];
                    $nextCounts = $counts;
                    self::recordOpponents($team1, $team2, $nextCounts);
                    if (!self::canAddOpponents($match2, $nextCounts, 2)) {
                        continue;
                    }
                    self::recordOpponents($team3, $team4, $nextCounts);

                    $nextRemaining = $remaining;
                    unset(
                        $nextRemaining[$firstKey],
                        $nextRemaining[$secondKey],
                        $nextRemaining[$thirdKey],
                        $nextRemaining[$fourthKey]
                    );
                    $nextRounds = $rounds;
                    $nextRounds[] = ['matches' => [1 => $match1, 2 => $match2], 'bench' => []];
                    if ($search($nextRemaining, $nextRounds, $nextCounts)) {
                        return true;
                    }
                }
            }
            return false;
        };

        if (!$search($edges, [], $opponents) || $solution === null) {
            throw new RuntimeException('Не удалось построить точную ротацию для 8 игроков');
        }

        if ($courtsCount >= 2) {
            $rounds = $solution;
        } else {
            $matches = [];
            foreach ($solution as $round) {
                array_push($matches, ...array_values($round['matches']));
            }
            $rounds = self::packBestRounds($matches, $playerIds, $courtsCount);
        }
        return [
            'rounds' => $rounds,
            'total_matches' => 14,
            'repeated_partnerships' => 0,
            'games_per_player' => array_fill_keys($playerIds, 7),
        ];
    }

    /**
     * Точная one-factorization для состава, кратного четырём.
     *
     * @param int[] $playerIds
     * @param array<string, int> $opponentHistory
     */
    private static function buildResolvableSchedule(
        array $playerIds,
        int $courtsCount,
        array $opponentHistory
    ): array {
        $rotation = $playerIds;
        $teamRounds = [];
        $playerCount = count($playerIds);

        for ($round = 0; $round < $playerCount - 1; $round++) {
            $teams = [];
            for ($i = 0; $i < intdiv($playerCount, 2); $i++) {
                $teams[] = [$rotation[$i], $rotation[$playerCount - 1 - $i]];
            }

            $teamRounds[] = $teams;

            $fixed = $rotation[0];
            $rest = array_slice($rotation, 1);
            array_unshift($rest, array_pop($rest));
            $rotation = array_merge([$fixed], $rest);
        }

        $logicalRounds = self::optimizeTeamOpponents($teamRounds, $opponentHistory);
        $allMatches = array_merge(...$logicalRounds);
        if ($courtsCount >= intdiv($playerCount, 4)) {
            $rounds = [];
            foreach ($logicalRounds as $matches) {
                $courtMatches = [];
                foreach ($matches as $index => $match) {
                    $courtMatches[$index + 1] = $match;
                }
                $rounds[] = ['matches' => $courtMatches, 'bench' => []];
            }
        } else {
            $rounds = self::packBestRounds($allMatches, $playerIds, $courtsCount);
        }

        return [
            'rounds' => $rounds,
            'total_matches' => count($allMatches),
            'repeated_partnerships' => 0,
            'games_per_player' => array_fill_keys($playerIds, $playerCount - 1),
        ];
    }

    /**
     * @param array<int, array<int, int[]>> $teamRounds
     * @param array<string, int> $baseOpponents
     * @return array<int, array<int, array{team1: int[], team2: int[]}>>
     */
    private static function optimizeTeamOpponents(
        array $teamRounds,
        array $baseOpponents
    ): array {
        if (count($teamRounds[0] ?? []) <= 4 && count($teamRounds) <= 8) {
            return self::exhaustiveTeamPairing($teamRounds, $baseOpponents);
        }

        $bestRounds = [];
        $bestScore = PHP_INT_MAX;
        $attemptLimit = count($teamRounds) <= 16 ? 800 : 300;

        for ($attempt = 0; $attempt < $attemptLimit; $attempt++) {
            $opponents = $baseOpponents;
            $roundOrder = array_keys($teamRounds);
            shuffle($roundOrder);
            $candidate = [];

            foreach ($roundOrder as $roundIndex) {
                $teams = $teamRounds[$roundIndex];
                shuffle($teams);
                $candidate[$roundIndex] = self::pairTeams($teams, $opponents);
            }
            ksort($candidate);

            $score = self::opponentSpreadScore($opponents);
            if ($score < $bestScore) {
                $bestRounds = array_values($candidate);
                $bestScore = $score;
            }
        }

        return self::improveOpponentBalance($bestRounds, $teamRounds, $baseOpponents);
    }

    /**
     * Точный перебор для 4 и 8 игроков.
     *
     * @param array<int, array<int, int[]>> $teamRounds
     * @param array<string, int> $baseOpponents
     * @return array<int, array<int, array{team1: int[], team2: int[]}>>
     */
    private static function exhaustiveTeamPairing(
        array $teamRounds,
        array $baseOpponents
    ): array {
        $options = array_map(
            fn(array $teams): array => self::teamPairingOptions($teams),
            $teamRounds
        );
        $best = [];
        $bestScore = PHP_INT_MAX;

        $search = function (
            int $roundIndex,
            array $chosen,
            array $counts
        ) use (&$search, &$best, &$bestScore, $options): void {
            if ($roundIndex === count($options)) {
                $score = self::opponentSpreadScore($counts);
                if ($score < $bestScore) {
                    $best = $chosen;
                    $bestScore = $score;
                }
                return;
            }

            foreach ($options[$roundIndex] as $matches) {
                $nextCounts = $counts;
                self::changeOpponentCounts($nextCounts, $matches, 1);
                $nextChosen = $chosen;
                $nextChosen[] = $matches;
                $search($roundIndex + 1, $nextChosen, $nextCounts);
            }
        };

        $search(0, [], $baseOpponents);
        return $best;
    }

    /**
     * @param array<int, int[]> $teams
     * @return array<int, array<int, array{team1: int[], team2: int[]}>>
     */
    private static function teamPairingOptions(array $teams): array
    {
        if ($teams === []) {
            return [[]];
        }

        $team1 = array_shift($teams);
        $options = [];
        foreach ($teams as $index => $team2) {
            $remaining = $teams;
            array_splice($remaining, $index, 1);
            foreach (self::teamPairingOptions($remaining) as $tail) {
                array_unshift($tail, ['team1' => $team1, 'team2' => $team2]);
                $options[] = $tail;
            }
        }
        return $options;
    }

    /**
     * @param array<int, int[]> $teams
     * @param array<string, int> $opponents
     * @return array<int, array{team1: int[], team2: int[]}>
     */
    private static function pairTeams(array $teams, array &$opponents): array
    {
        $matches = [];
        while ($teams !== []) {
            $team1 = array_shift($teams);
            $candidateIndexes = [];
            $bestCost = PHP_INT_MAX;
            foreach ($teams as $index => $team2) {
                $cost = self::opponentCost($team1, $team2, $opponents);
                if ($cost < $bestCost) {
                    $bestCost = $cost;
                    $candidateIndexes = [$index];
                } elseif ($cost === $bestCost) {
                    $candidateIndexes[] = $index;
                }
            }
            $bestIndex = $candidateIndexes[array_rand($candidateIndexes)];
            $team2 = $teams[$bestIndex];
            array_splice($teams, $bestIndex, 1);
            self::recordOpponents($team1, $team2, $opponents);
            $matches[] = ['team1' => $team1, 'team2' => $team2];
        }
        return $matches;
    }

    /**
     * Локальный поиск устраняет перекосы, которые остаются после жадного выбора.
     *
     * @param array<int, array<int, array{team1: int[], team2: int[]}>> $initialRounds
     * @param array<int, array<int, int[]>> $teamRounds
     * @param array<string, int> $baseOpponents
     * @return array<int, array<int, array{team1: int[], team2: int[]}>>
     */
    private static function improveOpponentBalance(
        array $initialRounds,
        array $teamRounds,
        array $baseOpponents
    ): array {
        $currentRounds = $initialRounds;
        $currentCounts = self::opponentCountsForRounds($currentRounds, $baseOpponents);
        $currentScore = self::opponentSpreadScore($currentCounts);
        $bestRounds = $currentRounds;
        $bestScore = $currentScore;
        $iterations = count($teamRounds) <= 16 ? 30000 : 50000;

        for ($iteration = 0; $iteration < $iterations; $iteration++) {
            $roundIndex = array_rand($teamRounds);
            $replacement = self::randomTeamPairing($teamRounds[$roundIndex]);
            $candidateCounts = $currentCounts;
            self::changeOpponentCounts(
                $candidateCounts,
                $currentRounds[$roundIndex],
                -1
            );
            self::changeOpponentCounts($candidateCounts, $replacement, 1);
            $candidateScore = self::opponentSpreadScore($candidateCounts);

            $temperature = max(0.25, 80 * (1 - $iteration / $iterations));
            $accept = $candidateScore <= $currentScore;
            if (!$accept) {
                $probability = exp(-($candidateScore - $currentScore) / $temperature);
                $accept = mt_rand() / mt_getrandmax() < $probability;
            }

            if ($accept) {
                $currentRounds[$roundIndex] = $replacement;
                $currentCounts = $candidateCounts;
                $currentScore = $candidateScore;
                if ($candidateScore < $bestScore) {
                    $bestRounds = $currentRounds;
                    $bestScore = $candidateScore;
                }
            }
        }

        return $bestRounds;
    }

    /**
     * @param array<int, int[]> $teams
     * @return array<int, array{team1: int[], team2: int[]}>
     */
    private static function randomTeamPairing(array $teams): array
    {
        shuffle($teams);
        $matches = [];
        while ($teams !== []) {
            $matches[] = [
                'team1' => array_shift($teams),
                'team2' => array_shift($teams),
            ];
        }
        return $matches;
    }

    /**
     * @param array<int, array<int, array{team1: int[], team2: int[]}>> $rounds
     * @param array<string, int> $base
     * @return array<string, int>
     */
    private static function opponentCountsForRounds(array $rounds, array $base): array
    {
        $counts = $base;
        foreach ($rounds as $matches) {
            self::changeOpponentCounts($counts, $matches, 1);
        }
        return $counts;
    }

    /**
     * @param array<string, int> $counts
     * @param array<int, array{team1: int[], team2: int[]}> $matches
     */
    private static function changeOpponentCounts(
        array &$counts,
        array $matches,
        int $direction
    ): void {
        foreach ($matches as $match) {
            foreach ($match['team1'] as $a) {
                foreach ($match['team2'] as $b) {
                    $key = self::pairKey($a, $b);
                    $counts[$key] = ($counts[$key] ?? 0) + $direction;
                }
            }
        }
    }

    /**
     * @param int[] $playerIds
     * @param array<string, int> $history
     * @return array<int, int[]>
     */
    private static function missingPartnerEdges(array $playerIds, array $history): array
    {
        $edges = [];
        $count = count($playerIds);
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                $edge = [$playerIds[$i], $playerIds[$j]];
                if (($history[self::pairKey($edge[0], $edge[1])] ?? 0) === 0) {
                    $edges[] = $edge;
                }
            }
        }
        return $edges;
    }

    /**
     * @param int[] $playerIds
     * @param array<string, int> $history
     * @return int[]
     */
    private static function pickRepeatEdge(array $playerIds, array $history): array
    {
        $games = array_fill_keys($playerIds, 0);
        foreach ($history as $key => $count) {
            [$a, $b] = array_map('intval', explode(':', $key));
            if (isset($games[$a], $games[$b])) {
                $games[$a] += $count;
                $games[$b] += $count;
            }
        }

        $candidates = [];
        for ($i = 0, $n = count($playerIds); $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $a = $playerIds[$i];
                $b = $playerIds[$j];
                $candidates[] = [
                    'edge' => [$a, $b],
                    'score' => ($history[self::pairKey($a, $b)] ?? 0) * 1000
                        + $games[$a] + $games[$b],
                ];
            }
        }

        usort($candidates, fn(array $x, array $y): int => $x['score'] <=> $y['score']);
        return $candidates[0]['edge'];
    }

    /**
     * @param array<int, int[]> $edges
     * @return array<int, array{team1: int[], team2: int[]}>
     */
    private static function buildBestMatches(array $edges, array $opponentHistory): array
    {
        $best = null;
        $bestScore = PHP_INT_MAX;

        for ($attempt = 0; $attempt < 120; $attempt++) {
            $pool = $edges;
            shuffle($pool);
            $matches = [];
            $opponents = $opponentHistory;
            $failed = false;

            while ($pool !== []) {
                $team1 = array_shift($pool);
                $candidateIndexes = [];
                $lowestCost = PHP_INT_MAX;

                foreach ($pool as $index => $team2) {
                    if (!self::areDisjoint($team1, $team2)) {
                        continue;
                    }
                    $cost = self::opponentCost($team1, $team2, $opponents);
                    if ($cost < $lowestCost) {
                        $lowestCost = $cost;
                        $candidateIndexes = [$index];
                    } elseif ($cost === $lowestCost) {
                        $candidateIndexes[] = $index;
                    }
                }

                if ($candidateIndexes === []) {
                    $failed = true;
                    break;
                }

                $chosenIndex = $candidateIndexes[array_rand($candidateIndexes)];
                $team2 = $pool[$chosenIndex];
                array_splice($pool, $chosenIndex, 1);
                self::recordOpponents($team1, $team2, $opponents);
                $matches[] = ['team1' => $team1, 'team2' => $team2];
            }

            if ($failed) {
                continue;
            }

            $score = self::opponentSpreadScore($opponents);
            if ($score < $bestScore) {
                $best = $matches;
                $bestScore = $score;
            }
        }

        if ($best === null) {
            throw new RuntimeException('Не удалось построить полную ротацию. Повторите генерацию.');
        }

        return $best;
    }

    /**
     * @param array<int, array{team1: int[], team2: int[]}> $matches
     * @param int[] $playerIds
     * @return array<int, array{matches: array<int, array{team1: int[], team2: int[]}>, bench: int[]}>
     */
    private static function packBestRounds(array $matches, array $playerIds, int $courtsCount): array
    {
        $bestRounds = null;
        $bestScore = PHP_INT_MAX;

        $attemptLimit = count($matches) <= 100 ? 1200 : 200;
        for ($attempt = 0; $attempt < $attemptLimit; $attempt++) {
            $pool = $matches;
            shuffle($pool);
            $rounds = [];

            while ($pool !== []) {
                $roundMatches = [];
                $used = [];

                for ($court = 1; $court <= $courtsCount; $court++) {
                    $chosenIndex = self::pickRoundMatch($pool, $used);
                    if ($chosenIndex === null) {
                        break;
                    }
                    $match = $pool[$chosenIndex];
                    array_splice($pool, $chosenIndex, 1);
                    $roundMatches[$court] = $match;
                    foreach (self::matchPlayers($match) as $playerId) {
                        $used[$playerId] = true;
                    }
                }

                if ($roundMatches === []) {
                    throw new RuntimeException('Не удалось распределить матчи по раундам');
                }

                $bench = array_values(array_filter(
                    $playerIds,
                    fn(int $id): bool => !isset($used[$id])
                ));
                $rounds[] = ['matches' => $roundMatches, 'bench' => $bench];
            }

            $score = count($rounds) * 10000 + self::benchStreakScore($rounds, $playerIds);
            if ($score < $bestScore) {
                $bestRounds = $rounds;
                $bestScore = $score;
            }
        }

        if ($bestRounds === null) {
            throw new RuntimeException('Не удалось сформировать раунды');
        }

        return $bestRounds;
    }

    /**
     * @param array<int, array{team1: int[], team2: int[]}> $pool
     * @param array<int, bool> $used
     */
    private static function pickRoundMatch(array $pool, array $used): ?int
    {
        $candidates = [];
        foreach ($pool as $index => $match) {
            $players = self::matchPlayers($match);
            if (array_filter($players, fn(int $id): bool => isset($used[$id])) === []) {
                $candidates[] = $index;
            }
        }
        return $candidates === [] ? null : $candidates[array_rand($candidates)];
    }

    /**
     * @param array<int, array{matches: array<int, array{team1: int[], team2: int[]}>, bench: int[]}> $rounds
     * @param int[] $playerIds
     */
    private static function benchStreakScore(array $rounds, array $playerIds): int
    {
        $score = 0;
        $streaks = array_fill_keys($playerIds, 0);
        foreach ($rounds as $round) {
            $benchLookup = array_fill_keys($round['bench'], true);
            foreach ($playerIds as $playerId) {
                if (isset($benchLookup[$playerId])) {
                    $streaks[$playerId]++;
                    $score += $streaks[$playerId] * $streaks[$playerId];
                } else {
                    $streaks[$playerId] = 0;
                }
            }
        }
        return $score;
    }

    /** @param int[] $team1 @param int[] $team2 */
    private static function areDisjoint(array $team1, array $team2): bool
    {
        return array_intersect($team1, $team2) === [];
    }

    /** @param int[] $team1 @param int[] $team2 @param array<string, int> $opponents */
    private static function opponentCost(array $team1, array $team2, array $opponents): int
    {
        $cost = 0;
        foreach ($team1 as $a) {
            foreach ($team2 as $b) {
                $count = $opponents[self::pairKey($a, $b)] ?? 0;
                $cost += $count * $count * 10 + $count;
            }
        }
        return $cost;
    }

    /** @param int[] $team1 @param int[] $team2 @param array<string, int> $opponents */
    private static function recordOpponents(array $team1, array $team2, array &$opponents): void
    {
        foreach ($team1 as $a) {
            foreach ($team2 as $b) {
                $key = self::pairKey($a, $b);
                $opponents[$key] = ($opponents[$key] ?? 0) + 1;
            }
        }
    }

    /**
     * @param array{team1: int[], team2: int[]} $match
     * @param array<string, int> $counts
     */
    private static function canAddOpponents(
        array $match,
        array $counts,
        int $maximum
    ): bool {
        foreach ($match['team1'] as $a) {
            foreach ($match['team2'] as $b) {
                if (($counts[self::pairKey($a, $b)] ?? 0) >= $maximum) {
                    return false;
                }
            }
        }
        return true;
    }

    /** @param array<string, int> $opponents */
    private static function opponentSpreadScore(array $opponents): int
    {
        if ($opponents === []) {
            return 0;
        }
        $values = array_values($opponents);
        $spread = max($values) - min($values);
        $average = array_sum($values) / count($values);
        $variance = array_sum(array_map(
            fn(int $value): int => (int) round(($value - $average) ** 2 * 10),
            $values
        ));
        return $spread * 100 + $variance;
    }

    /** @param array{team1: int[], team2: int[]} $match @return int[] */
    private static function matchPlayers(array $match): array
    {
        return array_merge($match['team1'], $match['team2']);
    }

    private static function pairKey(int $a, int $b): string
    {
        return $a < $b ? "$a:$b" : "$b:$a";
    }

    /**
     * @param int[] $playerIds
     * @param array<string, int> $counts
     * @return array<string, int>
     */
    private static function completePairCounts(array $playerIds, array $counts): array
    {
        for ($i = 0, $n = count($playerIds); $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $key = self::pairKey($playerIds[$i], $playerIds[$j]);
                $counts[$key] = $counts[$key] ?? 0;
            }
        }
        return $counts;
    }

    /** @param int[] $playerIds @param array<string, int> $history */
    private static function seed(array $playerIds, int $courts, array $history): int
    {
        ksort($history);
        return (int) sprintf('%u', crc32(json_encode([$playerIds, $courts, $history])));
    }
}
