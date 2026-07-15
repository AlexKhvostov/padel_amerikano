<?php

declare(strict_types=1);

require_once __DIR__ . '/CompanyService.php';

final class ScoreService
{
    public static function save(int $matchId, array $input): array
    {
        $match = self::getMatch($matchId);
        CompanyService::assertAccess($match['company_id']);

        if (!isset($input['score_team1'], $input['score_team2'])) {
            jsonError('Укажите счёт обеих команд');
        }

        $s1 = (int) $input['score_team1'];
        $s2 = (int) $input['score_team2'];
        $settings = CompanyService::settings($match['company_id']);

        self::validateScore($s1, $s2, $settings);

        $stmt = db()->prepare(
            'UPDATE match_scores SET score_team1 = ?, score_team2 = ?, is_finished = 1 WHERE match_id = ?'
        );
        $stmt->execute([$s1, $s2, $matchId]);

        return self::getMatch($matchId);
    }

    private static function validateScore(int $s1, int $s2, array $settings): void
    {
        if ($s1 < 0 || $s2 < 0) {
            jsonError('Счёт не может быть отрицательным');
        }

        $limit = (int) $settings['score_limit'];
        $half = $limit / 2;
        $maxWithExtra = $settings['extra_point_always'] ? $limit + 1 : $limit;

        if ($s1 + $s2 > $maxWithExtra + ($settings['extra_point_always'] ? 0 : 1)) {
            jsonError("Сумма очков превышает допустимый максимум для игры до $limit");
        }

        if ($s1 > $maxWithExtra || $s2 > $maxWithExtra) {
            jsonError("Максимальный счёт команды: $maxWithExtra");
        }

        $diff = abs($s1 - $s2);

        if ($settings['extra_point_always']) {
            if ($diff !== 1) {
                jsonError('При обязательном +1 разница между командами должна быть ровно 1');
            }
            return;
        }

        if ($s1 === $half && $s2 === $half && $settings['extra_point_on_tie']) {
            jsonError('При равном счёте нужен дополнительный розыгрыш (+1)');
        }

        if ($diff === 0) {
            jsonError('Ничья недопустима');
        }

        if ($diff < 1) {
            jsonError('Разница между командами должна быть не менее 1');
        }

        $winner = max($s1, $s2);
        $loser = min($s1, $s2);

        if ($winner === $half + 1 && $loser === $half && $settings['extra_point_on_tie']) {
            return;
        }

        if ($winner > $limit) {
            jsonError("Максимальный счёт без +1: $limit");
        }
    }

    private static function getMatch(int $matchId): array
    {
        $stmt = db()->prepare(
            'SELECT m.id, m.court_number, m.round_id, r.company_id, r.round_number,
                    ms.score_team1, ms.score_team2, ms.is_finished
             FROM matches m
             JOIN rounds r ON r.id = m.round_id
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE m.id = ?'
        );
        $stmt->execute([$matchId]);
        $match = $stmt->fetch();
        if (!$match) {
            jsonError('Матч не найден', 404);
        }
        $match['id'] = (int) $match['id'];
        $match['company_id'] = (int) $match['company_id'];
        $match['is_finished'] = (bool) $match['is_finished'];
        return $match;
    }
}
