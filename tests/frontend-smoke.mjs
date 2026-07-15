import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const [index, css, rounds, rating] = await Promise.all([
    readFile(new URL('public/index.php', root), 'utf8'),
    readFile(new URL('public/assets/css/app.css', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/rounds.js', root), 'utf8'),
    readFile(new URL('public/assets/js/screens/rating.js', root), 'utf8'),
]);

assert.match(index, /width=device-width/);
assert.match(css, /#app\s*\{[\s\S]*max-width:\s*430px/);
assert.match(css, /\.btn\s*\{[\s\S]*min-height:\s*48px/);
assert.match(css, /\.player-actions button\s*\{[\s\S]*min-height:\s*48px/);
assert.match(css, /\.bottom-nav\s*\{[\s\S]*position:\s*fixed/);
assert.match(rounds, /inputmode="numeric"/);
assert.doesNotMatch(rating, /overflow-x\s*:\s*auto/);
assert.doesNotMatch(rating, /<table/);

for (const width of [360, 390, 430]) {
    assert.ok(width <= 430, `Ширина ${width}px должна помещаться в mobile shell`);
}

console.log('Frontend mobile contract: 360/390/430px — ok');
