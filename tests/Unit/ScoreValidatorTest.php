<?php

declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ScoreValidatorTest extends TestCase
{
    public static function standardScores(): array
    {
        return [
            'сумма 16' => [12, 4, 16],
            'сумма 17' => [12, 5, 17],
            'сумма 24' => [14, 10, 24],
            'сумма 25' => [13, 12, 25],
        ];
    }

    #[DataProvider('standardScores')]
    public function testStandardTotalsAreAccepted(int $a, int $b, int $total): void
    {
        $result = ScoreValidator::validate($a, $b);
        self::assertSame($total, $result['total']);
    }

    public function testNonStandardTotalRequiresConfirmation(): void
    {
        $this->expectException(ScoreConfirmationRequiredException::class);
        ScoreValidator::validate(12, 3);
    }

    public function testConfirmedNonStandardTotalIsAccepted(): void
    {
        $result = ScoreValidator::validate(12, 3, true);
        self::assertSame(15, $result['total']);
    }

    public function testTieIsRejectedEvenWithConfirmation(): void
    {
        $this->expectException(ScoreValidationException::class);
        ScoreValidator::validate(8, 8, true);
    }

    public function testEmptyScoreIsRejected(): void
    {
        $this->expectException(ScoreValidationException::class);
        ScoreValidator::validate('', 16);
    }

    public function testNegativeScoreIsRejected(): void
    {
        $this->expectException(ScoreValidationException::class);
        ScoreValidator::validate(-1, 17);
    }

    public function testFractionalScoreIsRejected(): void
    {
        $this->expectException(ScoreValidationException::class);
        ScoreValidator::validate(12.5, 4.5);
    }
}
