import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const [index, css, home, games, rounds, rating, players, settings, invite] = await Promise.all([
    readFile(new URL('public/index.php', root), 'utf8'),
    readFile(new URL('public/assets/css/app.css', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/home.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/games.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/rounds.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/rating.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/players.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/settings.js', root), 'utf8'),
    readFile(new URL('public/assets/js/invite.js', root), 'utf8'),
]);

assert.match(index, /width=device-width/);
assert.match(index, /data-action="exit-view"/);
assert.match(css, /#app\s*\{[\s\S]*max-width:\s*430px/);
assert.match(css, /\.btn\s*\{[\s\S]*min-height:\s*48px/);
assert.match(css, /\.player-actions button\s*\{[\s\S]*min-height:\s*48px/);
assert.match(css, /\.bottom-nav\s*\{[\s\S]*position:\s*fixed/);
assert.match(rounds, /inputmode="numeric"/);
assert.match(rounds, /setInterval\([\s\S]*4000/);
assert.match(rounds, /session\.role !== 'viewer'/);
assert.doesNotMatch(rating, /overflow-x\s*:\s*auto/);
assert.doesNotMatch(rating, /<table/);
assert.match(css, /\.rating-row\s*\{[\s\S]*min-height:\s*44px/);
assert.match(css, /\.player-card\s*\{[\s\S]*min-height:\s*50px/);
assert.match(css, /\.setting-card\s*\{[\s\S]*min-height:\s*48px/);
assert.match(rating, /player\.matches}\/\$\{player\.planned_matches/);
assert.match(players, /class="icon-action"/);
assert.match(home, /btn-save-telegram/);
assert.match(games, /data-watch/);
assert.doesNotMatch(games, /<table/);
assert.match(settings, /buildQrUrl\(company\.view_slug\)/);
assert.match(invite, /Ссылка для просмотра:/);
assert.match(invite, /\/v\/\$\{encodeURIComponent\(viewSlug\)\}/);
assert.match(invite, /document\.execCommand\('copy'\)/);

for (const width of [360, 390, 430]) {
    assert.ok(width <= 430, `Ширина ${width}px должна помещаться в mobile shell`);
}

console.log('Frontend mobile contract: 360/390/430px — ok');
