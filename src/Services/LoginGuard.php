<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/database.php';
require_once dirname(__DIR__, 2) . '/config/app.php';

final class LoginGuard
{
    private const MAX_ATTEMPTS = 10;
    private const WINDOW_MINUTES = 10;

    public static function assertAllowed(): void
    {
        $ip = clientIp();
        $stmt = db()->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE ip_address = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)'
        );
        $stmt->execute([$ip, self::WINDOW_MINUTES]);
        if ((int) $stmt->fetchColumn() >= self::MAX_ATTEMPTS) {
            jsonError('Слишком много попыток входа. Попробуйте через 10 минут.', 429);
        }
    }

    public static function recordFailure(): void
    {
        $stmt = db()->prepare('INSERT INTO login_attempts (ip_address) VALUES (?)');
        $stmt->execute([clientIp()]);
    }
}
