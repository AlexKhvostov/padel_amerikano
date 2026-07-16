-- Несколько турниров внутри одной компании.
-- Выполнить после 006_login_bruteforce_protection.sql и до загрузки нового PHP-кода.

CREATE TABLE tournaments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    company_id  INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    status      ENUM('draft', 'active', 'completed') NOT NULL DEFAULT 'draft',
    settings    JSON NOT NULL,
    started_at  DATETIME NULL,
    completed_at DATETIME NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    active_company_id INT GENERATED ALWAYS AS (
        CASE WHEN status = 'active' THEN company_id ELSE NULL END
    ) VIRTUAL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY uq_tournaments_one_active (active_company_id),
    INDEX idx_tournaments_company_status (company_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_players (
    tournament_id INT NOT NULL,
    player_id     INT NOT NULL,
    is_active     TINYINT NOT NULL DEFAULT 1,
    joined_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tournament_id, player_id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tournaments
    (company_id, name, status, settings, started_at, completed_at, created_at)
SELECT
    c.id,
    CONCAT(
        'Турнир ',
        DATE_FORMAT(
            COALESCE(
                (SELECT MIN(r1.created_at) FROM rounds r1 WHERE r1.company_id = c.id),
                c.created_at
            ),
            '%d.%m.%Y'
        )
    ),
    CASE
        WHEN NOT EXISTS (SELECT 1 FROM rounds r2 WHERE r2.company_id = c.id) THEN 'draft'
        WHEN EXISTS (
            SELECT 1 FROM rounds r3
            WHERE r3.company_id = c.id AND r3.status IN ('planned', 'active')
        ) THEN 'active'
        ELSE 'completed'
    END,
    c.settings,
    (SELECT MIN(r4.created_at) FROM rounds r4 WHERE r4.company_id = c.id),
    CASE
        WHEN EXISTS (SELECT 1 FROM rounds r5 WHERE r5.company_id = c.id)
         AND NOT EXISTS (
            SELECT 1 FROM rounds r6
            WHERE r6.company_id = c.id AND r6.status IN ('planned', 'active')
         )
        THEN (SELECT MAX(r7.created_at) FROM rounds r7 WHERE r7.company_id = c.id)
        ELSE NULL
    END,
    c.created_at
FROM companies c;

ALTER TABLE rounds
    ADD COLUMN tournament_id INT NULL AFTER company_id;

UPDATE rounds r
JOIN tournaments t ON t.company_id = r.company_id
SET r.tournament_id = t.id;

ALTER TABLE rounds
    DROP INDEX uq_rounds_company_number,
    MODIFY tournament_id INT NOT NULL,
    ADD CONSTRAINT fk_rounds_tournament
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    ADD UNIQUE KEY uq_rounds_tournament_number (tournament_id, round_number),
    ADD INDEX idx_rounds_tournament_status (tournament_id, status);

INSERT INTO tournament_players (tournament_id, player_id, is_active, joined_at)
SELECT t.id, p.id, p.is_active, p.created_at
FROM tournaments t
JOIN players p ON p.company_id = t.company_id;
