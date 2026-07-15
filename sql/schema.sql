-- Падел Американо — схема БД (MySQL 8.0)
-- Выполнить один раз в базе host1708875_padelbd

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS match_scores;
DROP TABLE IF EXISTS match_players;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS companies;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE companies (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    password    VARCHAR(255) NOT NULL,
    view_token  CHAR(64) NOT NULL,
    view_slug   CHAR(12) NOT NULL,
    settings    JSON NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL,
    active_name VARCHAR(100) GENERATED ALWAYS AS (
        CASE WHEN deleted_at IS NULL THEN name ELSE NULL END
    ) VIRTUAL,
    UNIQUE KEY uq_companies_active_name (active_name),
    UNIQUE KEY uq_companies_view_token (view_token),
    UNIQUE KEY uq_companies_view_slug (view_slug),
    INDEX idx_companies_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE players (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    company_id  INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    telegram    VARCHAR(100) NULL,
    is_active   TINYINT NOT NULL DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY uq_players_company_name (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rounds (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    company_id   INT NOT NULL,
    round_number INT NOT NULL,
    bench_player_ids JSON NULL,
    status       ENUM('planned', 'active', 'completed') NOT NULL DEFAULT 'planned',
    active_company_id INT GENERATED ALWAYS AS (
        CASE WHEN status = 'active' THEN company_id ELSE NULL END
    ) VIRTUAL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY uq_rounds_company_number (company_id, round_number),
    UNIQUE KEY uq_rounds_one_active (active_company_id),
    INDEX idx_rounds_company_status (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE matches (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    round_id     INT NOT NULL,
    court_number INT NOT NULL,
    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_players (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    match_id   INT NOT NULL,
    player_id  INT NOT NULL,
    team       TINYINT NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id),
    UNIQUE KEY uq_match_player (match_id, player_id),
    CHECK (team IN (1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_scores (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    match_id     INT NOT NULL UNIQUE,
    score_team1  INT NULL,
    score_team2  INT NULL,
    is_finished  TINYINT NOT NULL DEFAULT 0,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    company_name VARCHAR(100) NOT NULL,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_login_attempts_ip_time (ip_address, attempted_at),
    INDEX idx_login_attempts_ip_company_time (ip_address, company_name, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
