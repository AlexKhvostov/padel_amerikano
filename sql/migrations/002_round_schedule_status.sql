-- Добавляет плановые раунды для полной ротации.
-- Выполнять только для БД, созданной старой версией schema.sql.

ALTER TABLE rounds
    ADD COLUMN status ENUM('planned', 'active', 'completed')
        NOT NULL DEFAULT 'completed' AFTER bench_player_ids,
    ADD COLUMN active_company_id INT GENERATED ALWAYS AS (
        CASE WHEN status = 'active' THEN company_id ELSE NULL END
    ) VIRTUAL AFTER status,
    ADD UNIQUE KEY uq_rounds_one_active (active_company_id),
    ADD INDEX idx_rounds_company_status (company_id, status);

-- Только последний незавершённый раунд каждой компании становится активным.
UPDATE rounds target
JOIN (
    SELECT company_id, MAX(round_number) AS round_number
    FROM (
        SELECT r.company_id, r.round_number
        FROM rounds r
        LEFT JOIN (
            SELECT m.round_id, MIN(COALESCE(ms.is_finished, 0)) AS all_finished
            FROM matches m
            LEFT JOIN match_scores ms ON ms.match_id = m.id
            GROUP BY m.round_id
        ) state ON state.round_id = r.id
        WHERE COALESCE(state.all_finished, 0) = 0
    ) unfinished
    GROUP BY company_id
) latest
    ON latest.company_id = target.company_id
   AND latest.round_number = target.round_number
SET target.status = 'active';
