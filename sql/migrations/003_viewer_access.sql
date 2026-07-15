-- Добавляет постоянную безопасную ссылку для просмотра турнира.
-- Выполнять один раз для БД, созданной до появления режима зрителя.

ALTER TABLE companies
    ADD COLUMN view_token CHAR(64) NULL AFTER password;

UPDATE companies
SET view_token = LOWER(HEX(RANDOM_BYTES(32)))
WHERE view_token IS NULL;

ALTER TABLE companies
    MODIFY view_token CHAR(64) NOT NULL,
    ADD UNIQUE KEY uq_companies_view_token (view_token);
