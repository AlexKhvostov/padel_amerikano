<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/database.php';

final class TournamentService
{
    public static function publicList(?string $date = null): array
    {
        if ($date !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            jsonError('Некорректная дата');
        }

        $sql = "SELECT
                    c.id,
                    c.name,
                    c.view_slug,
                    DATE_FORMAT(c.created_at, '%Y-%m-%d') AS created_date,
                    DATE_FORMAT(c.created_at, '%H:%i') AS created_time,
                    DATE_FORMAT(MIN(r.created_at), '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(MIN(r.created_at), '%H:%i') AS start_time,
                    DATE_FORMAT(
                        GREATEST(
                            c.created_at,
                            COALESCE(MAX(r.created_at), c.created_at),
                            COALESCE(MAX(ms.updated_at), c.created_at)
                        ),
                        '%Y-%m-%dT%H:%i:%s'
                    ) AS updated_at,
                    (
                        SELECT COUNT(*)
                        FROM players p
                        WHERE p.company_id = c.id AND p.is_active = 1
                    ) AS participants,
                    COUNT(DISTINCT m.id) AS total_matches,
                    COUNT(DISTINCT CASE WHEN ms.is_finished = 1 THEN m.id END) AS played_matches,
                    CASE
                        WHEN COUNT(DISTINCT r.id) = 0 THEN 'planned'
                        WHEN EXISTS (
                            SELECT 1 FROM rounds pending
                            WHERE pending.company_id = c.id
                              AND pending.status IN ('planned', 'active')
                        ) THEN 'active'
                        ELSE 'completed'
                    END AS status
                FROM companies c
                LEFT JOIN rounds r ON r.company_id = c.id
                LEFT JOIN matches m ON m.round_id = r.id
                LEFT JOIN match_scores ms ON ms.match_id = m.id
                WHERE c.deleted_at IS NULL
                GROUP BY c.id, c.name, c.view_slug, c.created_at";

        $params = [];
        if ($date !== null) {
            $sql .= ' HAVING created_date = ?';
            $params[] = $date;
        }
        $sql .= ' ORDER BY c.created_at DESC LIMIT 200';

        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['participants'] = (int) $row['participants'];
            $row['total_matches'] = (int) $row['total_matches'];
            $row['played_matches'] = (int) $row['played_matches'];
        }

        return ['tournaments' => $rows];
    }
}
