<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function ensure(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$rosters = [
    [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
    [8, 2], [10, 2], [12, 2], [16, 3], [36, 3],
];

foreach ($rosters as [$playerCount, $courts]) {
    $ids = range(1, $playerCount);
    $result = RoundGenerator::generateSchedule($ids, $courts);
    $partners = [];
    $opponents = [];
    $games = array_fill_keys($ids, 0);
    for ($a = 1; $a <= $playerCount; $a++) {
        for ($b = $a + 1; $b <= $playerCount; $b++) {
            $opponents["$a:$b"] = 0;
        }
    }

    foreach ($result['rounds'] as $roundIndex => $round) {
        ensure(count($round['matches']) <= $courts, "Слишком много матчей в раунде");
        $used = [];
        foreach ($round['matches'] as $match) {
            $players = array_merge($match['team1'], $match['team2']);
            ensure(count(array_unique($players)) === 4, 'Игрок повторяется внутри матча');
            ensure(array_intersect($used, $players) === [], 'Игрок играет дважды в раунде');
            $used = array_merge($used, $players);

            foreach ([$match['team1'], $match['team2']] as $team) {
                sort($team);
                $key = implode(':', $team);
                $partners[$key] = ($partners[$key] ?? 0) + 1;
                $games[$team[0]]++;
                $games[$team[1]]++;
            }
            foreach ($match['team1'] as $a) {
                foreach ($match['team2'] as $b) {
                    $key = min($a, $b) . ':' . max($a, $b);
                    $opponents[$key]++;
                }
            }
        }

        sort($used);
        $expectedBench = array_values(array_diff($ids, $used));
        sort($expectedBench);
        $actualBench = $round['bench'];
        sort($actualBench);
        ensure($actualBench === $expectedBench, "Неверная скамейка в раунде $roundIndex");
    }

    for ($a = 1; $a <= $playerCount; $a++) {
        for ($b = $a + 1; $b <= $playerCount; $b++) {
            ensure(isset($partners["$a:$b"]), "Нет партнёрства $a:$b");
        }
    }

    $allPairs = intdiv($playerCount * ($playerCount - 1), 2);
    ensure(array_sum($partners) - $allPairs === $allPairs % 2, 'Лишние повторы партнёров');
    ensure(max($games) - min($games) <= 1, 'Игры распределены неравномерно');
    ensure(max($opponents) - min($opponents) <= 2, 'Соперники распределены неравномерно');

    echo "schedule {$playerCount}p/{$courts}c: "
        . count($result['rounds']) . " rounds, {$result['total_matches']} matches, "
        . 'opponents ' . min($opponents) . '-' . max($opponents) . "\n";
}

foreach ([[12, 4], [12, 5], [14, 10], [13, 12]] as [$a, $b]) {
    ScoreValidator::validate($a, $b);
}

try {
    ScoreValidator::validate(12, 3);
    throw new RuntimeException('Нестандартная сумма не запросила подтверждение');
} catch (ScoreConfirmationRequiredException) {
}

ScoreValidator::validate(12, 3, true);

try {
    ScoreValidator::validate(8, 8, true);
    throw new RuntimeException('Ничья была принята');
} catch (ScoreValidationException) {
}

echo "score validation: ok\n";
