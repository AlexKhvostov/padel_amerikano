-- Добавляет логическое удаление компаний без физического удаления данных.
-- Выполнять после 004_short_view_links.sql.

ALTER TABLE companies
    DROP INDEX uq_companies_name,
    ADD COLUMN deleted_at DATETIME NULL AFTER created_at,
    ADD COLUMN active_name VARCHAR(100) GENERATED ALWAYS AS (
        CASE WHEN deleted_at IS NULL THEN name ELSE NULL END
    ) VIRTUAL AFTER deleted_at,
    ADD UNIQUE KEY uq_companies_active_name (active_name),
    ADD INDEX idx_companies_deleted_at (deleted_at);
