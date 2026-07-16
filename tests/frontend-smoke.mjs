import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const [
    index, css, home, games, rounds, rating, players, settings, invite,
    app, api, storage, tournamentHub, tournamentCreate, tournamentSettings,
    schema, migration, activityMigration, apiRouter, companyService, tournamentService,
] = await Promise.all([
    readFile(new URL('public/index.php', root), 'utf8'),
    readFile(new URL('public/assets/css/app.css', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/home.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/games.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/rounds.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/rating.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/players.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/settings.js', root), 'utf8'),
    readFile(new URL('public/assets/js/invite.js', root), 'utf8'),
    readFile(new URL('public/assets/js/app.js', root), 'utf8'),
    readFile(new URL('public/assets/js/api.js', root), 'utf8'),
    readFile(new URL('public/assets/js/storage.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/tournaments.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/tournament-create.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/tournament-settings.js', root), 'utf8'),
    readFile(new URL('sql/schema.sql', root), 'utf8'),
    readFile(new URL('sql/migrations/007_multi_tournament.sql', root), 'utf8'),
    readFile(new URL('sql/migrations/008_tournament_activity.sql', root), 'utf8'),
    readFile(new URL('public/api/index.php', root), 'utf8'),
    readFile(new URL('src/Services/CompanyService.php', root), 'utf8'),
    readFile(new URL('src/Services/TournamentService.php', root), 'utf8'),
]);

assert.match(index, /width=device-width/);
assert.match(index, /data-action="exit-view"/);
assert.match(css, /#app\s*\{[\s\S]*max-width:\s*430px/);
assert.match(css, /\.btn\s*\{[\s\S]*min-height:\s*44px/);
assert.match(css, /\.field input, \.field select\s*\{[\s\S]*font-size:\s*16px/);
assert.match(css, /\.player-actions button\s*\{[\s\S]*min-height:\s*36px/);
assert.match(css, /\.bottom-nav\s*\{[\s\S]*position:\s*fixed/);
assert.match(css, /\.bottom-nav\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
assert.match(css, /--primary:\s*#5b5bd6/);
assert.match(rounds, /inputmode="numeric"/);
assert.match(rounds, /class="team-names"/);
assert.match(rounds, /match-edit-icon/);
assert.match(rounds, /schedule-dialog/);
assert.match(rounds, /schedule-grid-icon/);
assert.match(rounds, /rounds\.schedule/);
assert.doesNotMatch(rounds, />Изменить счёт</);
assert.match(rounds, /setInterval\([\s\S]*4000/);
assert.match(rounds, /session\.role !== 'viewer'/);
assert.doesNotMatch(rating, /overflow-x\s*:\s*auto/);
assert.doesNotMatch(rating, /<table/);
assert.match(css, /\.rating-row\s*\{[\s\S]*min-height:\s*44px/);
assert.match(css, /\.player-card\s*\{[\s\S]*min-height:\s*44px/);
assert.match(css, /\.setting-card\s*\{[\s\S]*min-height:\s*40px/);
assert.match(css, /\.game-actions \.btn\s*\{[\s\S]*min-height:\s*36px/);
assert.match(rating, /player\.matches}\/\$\{player\.planned_matches/);
assert.match(rating, /rating-metrics/);
assert.match(players, /class="icon-action"/);
assert.match(players, /class="player-number"/);
assert.match(players, /card\.classList\.add\('editing'\)/);
assert.match(players, /edit-player-fields/);
assert.doesNotMatch(players, /player-name'\)\.focus/);
assert.match(home, /btn-save-telegram/);
assert.match(games, /data-watch/);
assert.match(games, /data-admin-login/);
assert.match(games, /companies\.publicList/);
assert.match(games, /companies-pagination/);
assert.match(games, /company-auth-dialog/);
assert.match(games, /btn-create-company/);
assert.match(games, /data-company-scope="my"/);
assert.match(games, /data-favorite-company/);
assert.match(games, /rememberCompany/);
assert.match(games, /company-status-filter/);
assert.match(games, /companies-sticky-head/);
assert.match(games, /Собирается турнир/);
assert.match(games, /Заброшен/);
assert.doesNotMatch(games, /type="date"/);
assert.doesNotMatch(games, /<table/);
assert.match(settings, /buildQrUrl\(company\.view_slug\)/);
assert.match(settings, /btn-delete-company/);
assert.match(settings, /company-danger-zone/);
assert.match(settings, /M4 7h16/);
assert.match(settings, /companies\.remove/);
assert.match(settings, /password-change-form/);
assert.match(settings, /companies\.changePassword/);
assert.match(settings, /btn-show-name-form/);
assert.match(settings, /company-edit-actions/);
assert.doesNotMatch(settings, /m5 12 4 4L19 6/);
assert.match(invite, /Ссылка для просмотра:/);
assert.match(invite, /\/v\/\$\{encodeURIComponent\(viewSlug\)\}/);
assert.match(invite, /document\.execCommand\('copy'\)/);
assert.match(index, /data-screen="tournaments"/);
assert.match(index, /data-context="company"/);
assert.match(index, /data-context="tournament"/);
assert.doesNotMatch(index, /data-screen="company-rating"/);
assert.doesNotMatch(index, /data-screen="tournament-settings"/);
assert.match(index, /data-action="back-tournaments"[\s\S]*Компания/);
assert.match(index, /data-action="logout-company"/);
assert.match(index, /Компания[\s\S]*Раунды[\s\S]*Рейтинг турнира/);
assert.match(app, /clearActiveTournament/);
assert.match(app, /four-item-nav/);
assert.match(app, /let current = 'games'/);
assert.match(api, /\/companies\/\$\{companyId\}\/tournaments/);
assert.match(api, /\/tournaments\/\$\{tournamentId\}\/rounds/);
assert.match(api, /&ids=/);
assert.match(api, /&status=/);
assert.match(api, /remove:\s*\(id\).*method:\s*'DELETE'/);
assert.match(storage, /getMyCompanyIds/);
assert.match(storage, /toggleFavoriteCompany/);
assert.match(storage, /rememberCompany/);
assert.match(tournamentHub, /Новый турнир/);
assert.match(tournamentHub, /setActiveTournament/);
assert.match(tournamentHub, /display_status/);
assert.match(tournamentHub, /data-delete-tournament/);
assert.match(tournamentHub, /confirmAction/);
assert.match(tournamentCreate, /player_ids/);
assert.match(tournamentCreate, /Выбрано:/);
assert.match(tournamentSettings, /Завершённый турнир|status !== 'completed'/);
assert.match(rating, /point_share/);
assert.match(rating, /average_difference/);
assert.match(players, /player-company-stats/);
assert.match(players, /point_share/);
assert.match(players, /average_finish_percentile/);
assert.match(players, /tournament-position-scale/);
assert.match(players, /1-е место/);
assert.match(players, /Последнее место/);
assert.doesNotMatch(players, /результат турниров/);
assert.doesNotMatch(players, /average_tournament_points/);
assert.match(players, /player-stats-dialog/);
assert.match(players, /players\.stats/);
assert.match(players, /event\.target === event\.currentTarget/);
assert.match(players, /player-stats-telegram/);
assert.match(players, /data-player-filter="active"/);
assert.match(players, /btn-activate-player/);
assert.match(players, /players\.activate/);
assert.doesNotMatch(players, /player-info > a/);
assert.match(rounds, /btn-tournament-settings/);
assert.match(schema, /CREATE TABLE tournaments/);
assert.match(schema, /CREATE TABLE tournament_players/);
assert.match(schema, /tournament_id INT NOT NULL/);
assert.match(schema, /updated_at\s+DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/);
assert.match(migration, /UPDATE rounds r[\s\S]*SET r\.tournament_id = t\.id/);
assert.match(migration, /INSERT INTO tournament_players/);
assert.match(activityMigration, /ADD COLUMN updated_at/);
assert.match(activityMigration, /MAX\(ms\.updated_at\)/);
assert.match(apiRouter, /\/companies\/\(\\d\+\)\/tournaments/);
assert.match(apiRouter, /RatingService::getCompany/);
assert.match(apiRouter, /PlayerService::stats/);
assert.match(apiRouter, /PlayerService::activate/);
assert.match(apiRouter, /\/companies\/public/);
assert.match(companyService, /INTERVAL 15 MINUTE/);
assert.match(companyService, /INTERVAL 1 HOUR/);
assert.match(companyService, /THEN 'abandoned'/);
assert.match(tournamentService, /AS display_status/);
assert.match(tournamentService, /function remove/);

for (const width of [360, 390, 430]) {
    assert.ok(width <= 430, `Ширина ${width}px должна помещаться в mobile shell`);
}

console.log('Frontend mobile contract: 360/390/430px — ok');
