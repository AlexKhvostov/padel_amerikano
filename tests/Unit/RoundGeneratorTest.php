<?php

declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RoundGeneratorTest extends TestCase
{
    public static function rosters(): array
    {
        return [
            '4 игрока, 1 корт' => [4, 1],
            '5 игроков, 1 корт' => [5, 1],
            '6 игроков, 1 корт' => [6, 1],
            '7 игроков, 1 корт' => [7, 1],
            '8 игроков, 1 корт' => [8, 1],
            '8 игроков, 2 корта' => [8, 2],
            '10 игроков, 2 корта' => [10, 2],
            '12 игроков, 2 корта' => [12, 2],
            '16 игроков, 3 корта' => [16, 3],
            '36 игроков, 3 корта' => [36, 3],
        ];
    }

    #[DataProvider('rosters')]
    public function testFullPartnerCoverageAndRoundConstraints(int $players, int $courts): void
    {
        $ids = range(1, $players);
        $result = RoundGenerator::generateSchedule($ids, $courts);
        $partnerCounts = [];
        $opponentCounts = [];
        $gameCounts = array_fill_keys($ids, 0);
        for ($a = 1; $a <= $players; $a++) {
            for ($b = $a + 1; $b <= $players; $b++) {
                $opponentCounts["$a:$b"] = 0;
            }
        }

        foreach ($result['rounds'] as $round) {
            self::assertLessThanOrEqual($courts, count($round['matches']));
            $used = [];

            foreach ($round['matches'] as $match) {
                $matchPlayers = array_merge($match['team1'], $match['team2']);
                self::assertCount(4, array_unique($matchPlayers));
                self::assertSame([], array_intersect($used, $matchPlayers));
                $used = array_merge($used, $matchPlayers);

                foreach ([$match['team1'], $match['team2']] as $team) {
                    sort($team);
                    $key = $team[0] . ':' . $team[1];
                    $partnerCounts[$key] = ($partnerCounts[$key] ?? 0) + 1;
                    $gameCounts[$team[0]]++;
                    $gameCounts[$team[1]]++;
                }
                foreach ($match['team1'] as $a) {
                    foreach ($match['team2'] as $b) {
                        $key = min($a, $b) . ':' . max($a, $b);
                        $opponentCounts[$key]++;
                    }
                }
            }

            sort($used);
            $expectedBench = array_values(array_diff($ids, $used));
            sort($expectedBench);
            $actualBench = $round['bench'];
            sort($actualBench);
            self::assertSame($expectedBench, $actualBench);
        }

        for ($a = 1; $a <= $players; $a++) {
            for ($b = $a + 1; $b <= $players; $b++) {
                self::assertArrayHasKey("$a:$b", $partnerCounts);
            }
        }

        $expectedPairs = intdiv($players * ($players - 1), 2);
        $repeatCount = array_sum($partnerCounts) - $expectedPairs;
        self::assertSame($expectedPairs % 2, $repeatCount);
        self::assertLessThanOrEqual(1, max($gameCounts) - min($gameCounts));
        self::assertLessThanOrEqual(2, max($opponentCounts) - min($opponentCounts));
    }

    public function testNMinusOneRoundsWhenAllPlayersFitOnCourts(): void
    {
        foreach ([4, 8, 12, 16] as $players) {
            $result = RoundGenerator::generateSchedule(
                range(1, $players),
                intdiv($players, 4)
            );
            self::assertCount($players - 1, $result['rounds']);
        }
    }

    public function testExistingPartnershipsAreNotScheduledAgain(): void
    {
        $history = ['1:2' => 1, '1:3' => 1];
        $result = RoundGenerator::generateSchedule(range(1, 8), 2, $history);
        $teams = [];

        foreach ($result['rounds'] as $round) {
            foreach ($round['matches'] as $match) {
                foreach ([$match['team1'], $match['team2']] as $team) {
                    sort($team);
                    $teams[] = implode(':', $team);
                }
            }
        }

        self::assertNotContains('1:2', $teams);
        self::assertNotContains('1:3', $teams);
    }
}
