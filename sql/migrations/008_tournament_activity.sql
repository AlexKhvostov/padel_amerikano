-- Время последнего изменения турнира для динамических статусов активности.
-- Выполнять один раз после 007_multi_tournament.sql.

ALTER TABLE tournaments
    ADD COLUMN updated_at DATETIME NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
        AFTER created_at;

UPDATE tournaments t
SET t.updated_at = GREATEST(
    t.created_at,
    COALESCE((
        SELECT MAX(r.created_at)
        FROM rounds r
        WHERE r.tournament_id = t.id
    ), t.created_at),
    COALESCE((
        SELECT MAX(ms.updated_at)
        FROM rounds r
        JOIN matches m ON m.round_id = r.id
        JOIN match_scores ms ON ms.match_id = m.id
        WHERE r.tournament_id = t.id
    ), t.created_at)
);
