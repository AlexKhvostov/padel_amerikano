<?php

declare(strict_types=1);

require_once __DIR__ . '/CompanyService.php';
require_once dirname(__DIR__) . '/Domain/ScoreValidator.php';

final class ScoreService
{
    public static function save(int $matchId, array $input): array
    {
        $match = self::getMatch($matchId);
        CompanyService::assertAccess($match['company_id']);

        try {
            $validated = ScoreValidator::validate(
                $input['score_team1'] ?? null,
                $input['score_team2'] ?? null,
                ($input['confirm_invalid_total'] ?? false) === true
            );
        } catch (ScoreConfirmationRequiredException $e) {
            jsonError(
                $e->getMessage(),
                422,
                [
                    'code' => 'SCORE_TOTAL_CONFIRM_REQUIRED',
                    'total' => $e->total,
                    'allowed_totals' => ScoreValidator::STANDARD_TOTALS,
                ]
            );
        } catch (ScoreValidationException $e) {
            jsonError($e->getMessage());
        }

        $stmt = db()->prepare(
            'UPDATE match_scores
             SET score_team1 = ?, score_team2 = ?, is_finished = 1
             WHERE match_id = ?'
        );
        $stmt->execute([
            $validated['score_team1'],
            $validated['score_team2'],
            $matchId,
        ]);
        self::completeRoundWhenReady((int) $match['round_id']);

        return self::getMatch($matchId);
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
        $match['score_team1'] = $match['score_team1'] === null
            ? null
            : (int) $match['score_team1'];
        $match['score_team2'] = $match['score_team2'] === null
            ? null
            : (int) $match['score_team2'];
        $match['is_finished'] = (bool) $match['is_finished'];
        return $match;
    }

    private static function completeRoundWhenReady(int $roundId): void
    {
        $stmt = db()->prepare(
            'SELECT COUNT(*) AS total,
                    SUM(CASE WHEN ms.is_finished = 1 THEN 1 ELSE 0 END) AS finished
             FROM matches m
             LEFT JOIN match_scores ms ON ms.match_id = m.id
             WHERE m.round_id = ?'
        );
        $stmt->execute([$roundId]);
        $state = $stmt->fetch();

        if (
            (int) $state['total'] > 0
            && (int) $state['total'] === (int) $state['finished']
        ) {
            $update = db()->prepare("UPDATE rounds SET status = 'completed' WHERE id = ?");
            $update->execute([$roundId]);
        }
    }
}
