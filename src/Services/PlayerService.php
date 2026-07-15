<?php

declare(strict_types=1);

final class PlayerService
{
    public static function list(int $companyId): array
    {
        CompanyService::assertAccess($companyId);

        $stmt = db()->prepare(
            'SELECT id, name, telegram, is_active, created_at
             FROM players WHERE company_id = ?
             ORDER BY is_active DESC, name ASC'
        );
        $stmt->execute([$companyId]);
        $players = $stmt->fetchAll();

        foreach ($players as &$p) {
            $p['id'] = (int) $p['id'];
            $p['is_active'] = (bool) $p['is_active'];
            $p['telegram'] = self::normalizeTelegramDisplay($p['telegram']);
        }

        return [
            'players' => $players,
            'active_count' => count(array_filter($players, fn($p) => $p['is_active'])),
            'max' => 36,
            'min_to_start' => 4,
        ];
    }

    public static function create(int $companyId, array $input): array
    {
        CompanyService::assertAccess($companyId);

        $name = trim($input['name'] ?? '');
        if ($name === '') {
            jsonError('Укажите имя игрока');
        }

        $stmt = db()->prepare('SELECT COUNT(*) FROM players WHERE company_id = ? AND is_active = 1');
        $stmt->execute([$companyId]);
        if ((int) $stmt->fetchColumn() >= 36) {
            jsonError('Достигнут лимит: максимум 36 игроков');
        }

        $telegram = self::normalizeTelegramStorage($input['telegram'] ?? null);

        try {
            $stmt = db()->prepare(
                'INSERT INTO players (company_id, name, telegram) VALUES (?, ?, ?)'
            );
            $stmt->execute([$companyId, $name, $telegram]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Игрок с таким именем уже есть в компании');
            }
            throw $e;
        }

        return self::find((int) db()->lastInsertId());
    }

    public static function update(int $playerId, array $input): array
    {
        $player = self::find($playerId);
        CompanyService::assertAccess((int) $player['company_id']);

        $name = trim($input['name'] ?? $player['name']);
        if ($name === '') {
            jsonError('Укажите имя игрока');
        }

        $telegram = array_key_exists('telegram', $input)
            ? self::normalizeTelegramStorage($input['telegram'])
            : $player['telegram_raw'];

        try {
            $stmt = db()->prepare('UPDATE players SET name = ?, telegram = ? WHERE id = ?');
            $stmt->execute([$name, $telegram, $playerId]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                jsonError('Игрок с таким именем уже есть в компании');
            }
            throw $e;
        }

        return self::find($playerId);
    }

    public static function delete(int $playerId): void
    {
        $player = self::find($playerId);
        CompanyService::assertAccess((int) $player['company_id']);

        if (CompanyService::isTournamentStarted((int) $player['company_id'])) {
            $stmt = db()->prepare('UPDATE players SET is_active = 0 WHERE id = ?');
            $stmt->execute([$playerId]);
            return;
        }

        $stmt = db()->prepare('DELETE FROM players WHERE id = ?');
        $stmt->execute([$playerId]);
    }

    public static function find(int $playerId): array
    {
        $stmt = db()->prepare('SELECT * FROM players WHERE id = ?');
        $stmt->execute([$playerId]);
        $player = $stmt->fetch();
        if (!$player) {
            jsonError('Игрок не найден', 404);
        }

        $player['id'] = (int) $player['id'];
        $player['company_id'] = (int) $player['company_id'];
        $player['is_active'] = (bool) $player['is_active'];
        $player['telegram_raw'] = $player['telegram'];
        $player['telegram'] = self::normalizeTelegramDisplay($player['telegram']);

        return $player;
    }

    public static function activeIds(int $companyId): array
    {
        $stmt = db()->prepare(
            'SELECT id FROM players WHERE company_id = ? AND is_active = 1 ORDER BY id'
        );
        $stmt->execute([$companyId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    private static function normalizeTelegramStorage(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }
        $value = trim($value);
        if (preg_match('#t\.me/([A-Za-z0-9_]+)#', $value, $m)) {
            return '@' . $m[1];
        }
        if (!str_starts_with($value, '@')) {
            return '@' . ltrim($value, '@');
        }
        return $value;
    }

    private static function normalizeTelegramDisplay(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return str_starts_with($value, '@') ? $value : '@' . $value;
    }
}

require_once __DIR__ . '/CompanyService.php';
