<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/database.php';
require_once dirname(__DIR__, 2) . '/config/app.php';

final class LoginGuard
{
    private const MAX_COMPANY_ATTEMPTS = 3;
    private const MAX_IP_ATTEMPTS = 20;
    private const WINDOW_MINUTES = 10;

    public static function assertAllowed(string $companyName): void
    {
        $ip = clientIp();
        $companyName = self::normalizeCompanyName($companyName);
        db()->exec('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        $stmt = db()->prepare(
            'SELECT
                COUNT(*) AS ip_attempts,
                SUM(CASE WHEN company_name = ? THEN 1 ELSE 0 END) AS company_attempts
             FROM login_attempts
             WHERE ip_address = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)'
        );
        $stmt->execute([$companyName, $ip, self::WINDOW_MINUTES]);
        $attempts = $stmt->fetch();
        if (
            (int) ($attempts['company_attempts'] ?? 0) >= self::MAX_COMPANY_ATTEMPTS
            || (int) ($attempts['ip_attempts'] ?? 0) >= self::MAX_IP_ATTEMPTS
        ) {
            jsonError('Слишком много попыток входа. Попробуйте через 10 минут.', 429);
        }
    }

    public static function recordFailure(string $companyName): void
    {
        $stmt = db()->prepare(
            'INSERT INTO login_attempts (ip_address, company_name) VALUES (?, ?)'
        );
        $stmt->execute([clientIp(), self::normalizeCompanyName($companyName)]);
    }

    public static function recordSuccess(string $companyName): void
    {
        $stmt = db()->prepare(
            'DELETE FROM login_attempts WHERE ip_address = ? AND company_name = ?'
        );
        $stmt->execute([clientIp(), self::normalizeCompanyName($companyName)]);
    }

    private static function normalizeCompanyName(string $companyName): string
    {
        return mb_strtolower(trim($companyName));
    }
}
