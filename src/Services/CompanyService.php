<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/Auth/Token.php';
require_once dirname(__DIR__) . '/Services/LoginGuard.php';
require_once dirname(__DIR__, 2) . '/config/database.php';
require_once dirname(__DIR__, 2) . '/config/app.php';

final class CompanyService
{
    public static function search(string $query): array
    {
        $stmt = db()->prepare(
            'SELECT id, name FROM companies WHERE name LIKE ? ORDER BY name LIMIT 20'
        );
        $stmt->execute(['%' . $query . '%']);
        return $stmt->fetchAll();
    }

    public static function create(string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            jsonError('Укажите название компании');
        }
        if (mb_strlen($name) > 100) {
            jsonError('Название компании слишком длинное');
        }

        $plainPassword = (string) random_int(1000, 999999);
        $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
        $viewToken = bin2hex(random_bytes(32));
        $viewSlug = rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
        $settings = json_encode(defaultSettings(), JSON_UNESCAPED_UNICODE);

        try {
            $stmt = db()->prepare(
                'INSERT INTO companies
                    (name, password, view_token, view_slug, settings)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $hash, $viewToken, $viewSlug, $settings]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Компания с таким названием уже существует');
            }
            throw $e;
        }

        $id = (int) db()->lastInsertId();
        $token = Token::create($id);

        return [
            'id' => $id,
            'name' => $name,
            'password' => $plainPassword,
            'view_token' => $viewToken,
            'view_slug' => $viewSlug,
            'role' => 'admin',
            'token' => $token,
            'settings' => defaultSettings(),
        ];
    }

    public static function login(string $name, string $password): array
    {
        LoginGuard::assertAllowed();

        $stmt = db()->prepare('SELECT * FROM companies WHERE name = ? LIMIT 1');
        $stmt->execute([trim($name)]);
        $company = $stmt->fetch();

        if (!$company || !password_verify($password, $company['password'])) {
            LoginGuard::recordFailure();
            jsonError('Неверное название компании или пароль', 401);
        }

        LoginGuard::recordSuccess();
        $settings = json_decode($company['settings'], true) ?: defaultSettings();

        return [
            'id' => (int) $company['id'],
            'name' => $company['name'],
            'password' => $password,
            'view_token' => $company['view_token'],
            'view_slug' => $company['view_slug'],
            'role' => 'admin',
            'token' => Token::create((int) $company['id']),
            'settings' => $settings,
        ];
    }

    public static function get(int $companyId): array
    {
        $stmt = db()->prepare(
            'SELECT id, name, view_token, view_slug, settings, created_at
             FROM companies WHERE id = ?'
        );
        $stmt->execute([$companyId]);
        $company = $stmt->fetch();
        if (!$company) {
            jsonError('Компания не найдена', 404);
        }
        $company['id'] = (int) $company['id'];
        $company['settings'] = json_decode($company['settings'], true) ?: defaultSettings();
        $company['tournament_started'] = self::isTournamentStarted($companyId);
        return $company;
    }

    public static function loginViewer(string $viewKey): array
    {
        $isSlug = preg_match('/^[A-Za-z0-9_-]{12}$/', $viewKey) === 1;
        $isLegacyToken = preg_match('/^[a-f0-9]{64}$/', $viewKey) === 1;
        if (!$isSlug && !$isLegacyToken) {
            jsonError('Ссылка просмотра недействительна', 404);
        }

        $stmt = db()->prepare(
            $isSlug
                ? 'SELECT id, name, view_token, settings
                   FROM companies WHERE view_slug = ? LIMIT 1'
                : 'SELECT id, name, view_token, settings
                   FROM companies WHERE view_token = ? LIMIT 1'
        );
        $stmt->execute([$viewKey]);
        $company = $stmt->fetch();
        if (!$company) {
            jsonError('Ссылка просмотра недействительна', 404);
        }

        $settings = json_decode($company['settings'], true) ?: defaultSettings();
        unset($settings['access_code']);

        return [
            'id' => (int) $company['id'],
            'name' => $company['name'],
            'role' => 'viewer',
            'token' => $company['view_token'],
            'settings' => $settings,
        ];
    }

    public static function updateSettings(int $companyId, array $input): array
    {
        if (self::isTournamentStarted($companyId)) {
            jsonError('Турнир начат. Изменение настроек недоступно');
        }

        $settings = defaultSettings();
        if (isset($input['courts_count'])) {
            $courts = max(1, min(10, (int) $input['courts_count']));
            $settings['courts_count'] = $courts;
        }

        $stmt = db()->prepare('UPDATE companies SET settings = ? WHERE id = ?');
        $stmt->execute([json_encode($settings, JSON_UNESCAPED_UNICODE), $companyId]);

        return $settings;
    }

    public static function reset(int $companyId): void
    {
        $stmt = db()->prepare('DELETE FROM rounds WHERE company_id = ?');
        $stmt->execute([$companyId]);
    }

    public static function isTournamentStarted(int $companyId): bool
    {
        $stmt = db()->prepare('SELECT COUNT(*) FROM rounds WHERE company_id = ?');
        $stmt->execute([$companyId]);
        return (int) $stmt->fetchColumn() > 0;
    }

    public static function assertAccess(int $companyId, bool $write = false): string
    {
        $authId = Token::fromRequest();
        if ($authId === $companyId) {
            return 'admin';
        }

        if (!$write) {
            $viewToken = Token::rawFromRequest();
            $stmt = db()->prepare(
                'SELECT COUNT(*) FROM companies WHERE id = ? AND view_token = ?'
            );
            $stmt->execute([$companyId, $viewToken]);
            if ((int) $stmt->fetchColumn() === 1) {
                return 'viewer';
            }
        }

        jsonError(
            $write ? 'Изменения доступны только администратору' : 'Доступ запрещён',
            403
        );
    }

    public static function settings(int $companyId): array
    {
        $company = self::get($companyId);
        return $company['settings'];
    }
}
