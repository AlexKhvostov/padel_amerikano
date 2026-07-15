-- Добавляет короткие адреса вида /v/A7kP2mQ9xL4c.
-- Выполнять после 003_viewer_access.sql.

ALTER TABLE companies
    ADD COLUMN view_slug CHAR(12) NULL AFTER view_token;

UPDATE companies
SET view_slug = REPLACE(
    REPLACE(
        REPLACE(TO_BASE64(RANDOM_BYTES(9)), '+', '-'),
        '/',
        '_'
    ),
    '=',
    ''
)
WHERE view_slug IS NULL;

ALTER TABLE companies
    MODIFY view_slug CHAR(12) NOT NULL,
    ADD UNIQUE KEY uq_companies_view_slug (view_slug);
