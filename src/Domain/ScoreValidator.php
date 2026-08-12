<?php

declare(strict_types=1);

final class ScoreValidationException extends InvalidArgumentException
{
}

final class ScoreConfirmationRequiredException extends RuntimeException
{
    /**
     * @param list<int> $allowedTotals
     */
    public function __construct(
        public readonly int $total,
        public readonly string $reason,
        public readonly array $allowedTotals = []
    ) {
        parent::__construct($reason);
    }
}

final class ScoreValidator
{
    public const STANDARD_TOTALS = [16, 17, 24, 25];

    /**
     * @param array<string, mixed> $settings
     * @return list<int>
     */
    public static function allowedTotals(array $settings): array
    {
        if (!array_key_exists('format', $settings)) {
            return self::STANDARD_TOTALS;
        }

        $format = (int) $settings['format'] === 16 ? 16 : 24;
        $totals = [$format];
        if (($settings['allow_extra_ball'] ?? true) === true) {
            $totals[] = $format + 1;
        }
        return $totals;
    }

    /**
     * @param array<string, mixed> $settings
     * @return array{score_team1: int, score_team2: int, total: int}
     */
    public static function validate(
        mixed $scoreTeam1,
        mixed $scoreTeam2,
        bool $confirmUnusual = false,
        array $settings = []
    ): array {
        $score1 = self::parse($scoreTeam1);
        $score2 = self::parse($scoreTeam2);
        $total = $score1 + $score2;
        $isDraw = $score1 === $score2;
        $allowDraw = ($settings['allow_draw'] ?? false) === true;
        $allowedTotals = self::allowedTotals($settings);
        $totalOk = in_array($total, $allowedTotals, true);

        $reasons = [];
        if ($isDraw && !$allowDraw) {
            $reasons[] = 'Счёт равный — это ничья.';
        }
        if (!$totalOk) {
            $list = implode(', ', $allowedTotals);
            $reasons[] = "Сумма очков равна $total. Ожидаемые суммы: $list.";
        }

        if ($reasons !== [] && !$confirmUnusual) {
            throw new ScoreConfirmationRequiredException(
                $total,
                implode(' ', $reasons) . ' Сохранить всё равно?',
                $allowedTotals
            );
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
