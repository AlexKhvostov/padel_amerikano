-- Защита входа по сочетанию IP-адреса и названия компании.
-- Выполнить после 005_company_soft_delete.sql.

ALTER TABLE login_attempts
    ADD COLUMN company_name VARCHAR(100) NOT NULL DEFAULT '' AFTER ip_address,
    ADD INDEX idx_login_attempts_ip_company_time
        (ip_address, company_name, attempted_at);
