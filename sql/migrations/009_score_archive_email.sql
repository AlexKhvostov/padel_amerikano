-- Настройки счёта / архив турниров / email админа и recoverable-пароль

ALTER TABLE tournaments
    ADD COLUMN archived_at DATETIME NULL AFTER updated_at,
    ADD INDEX idx_tournaments_company_archived (company_id, archived_at, status);

ALTER TABLE companies
    ADD COLUMN admin_email VARCHAR(255) NULL AFTER settings,
    ADD COLUMN password_recoverable TEXT NULL AFTER admin_email;
