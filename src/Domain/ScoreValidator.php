<?php

declare(strict_types=1);

final class ScoreValidationException extends InvalidArgumentException
{
}

final class ScoreConfirmationRequiredException extends RuntimeException
{
    public function __construct(public readonly int $total)
    {
        parent::__construct(
            "Сумма очков равна $total. Стандартные суммы: 16, 17, 24 или 25."
        );
    }
}

final class ScoreValidator
{
    public const STANDARD_TOTALS = [16, 17, 24, 25];

    /**
     * @return array{score_team1: int, score_team2: int, total: int}
     */
    public static function validate(
        mixed $scoreTeam1,
        mixed $scoreTeam2,
        bool $confirmInvalidTotal = false
    ): array {
        $score1 = self::parse($scoreTeam1);
        $score2 = self::parse($scoreTeam2);

        if ($score1 === $score2) {
            throw new ScoreValidationException(
                'Ничья недопустима. Счёт команд должен отличаться.'
            );
        }

        $total = $score1 + $score2;
        if (!in_array($total, self::STANDARD_TOTALS, true) && !$confirmInvalidTotal) {
            throw new ScoreConfirmationRequiredException($total);
        }

        return [
            'score_team1' => $score1,
            'score_team2' => $score2,
            'total' => $total,
        ];
    }

    private static function parse(mixed $value): int
    {
        if ($value === null || $value === '') {
            throw new ScoreValidationException('Заполните оба поля счёта');
        }
        if (is_bool($value)) {
            throw new ScoreValidationException(
                'Счёт должен быть целым неотрицательным числом'
            );
        }

        if (is_int($value)) {
            $score = $value;
        } elseif (is_string($value) && preg_match('/^\d+$/', $value)) {
            $score = (int) $value;
        } else {
            throw new ScoreValidationException(
                'Счёт должен быть целым неотрицательным числом'
            );
        }

        if ($score < 0) {
            throw new ScoreValidationException('Счёт не может быть отрицательным');
        }
        return $score;
    }
}
