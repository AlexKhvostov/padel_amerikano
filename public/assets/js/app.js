import { getSession } from './storage.js';
import { renderHome } from './screens/home.js';
import { renderPlayers } from './screens/players.js';
import { renderRounds } from './screens/rounds.js';
import { renderRating } from './screens/rating.js';
import { renderSettings } from './screens/settings.js';

const screenEl = document.getElementById('screen');
const navEl = document.getElementById('nav');

const screens = {
    home: renderHome,
    players: renderPlayers,
    rounds: renderRounds,
    rating: renderRating,
    settings: renderSettings,
};

let current = 'home';

export function navigate(name) {
    current = name;
    render();
}

async function render() {
    const session = getSession();
    const isAuth = !!session?.token;

    if (!isAuth && current !== 'home') {
        current = 'home';
    }

    navEl.classList.toggle('hidden', !isAuth);

    navEl.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.screen === current);
    });

    const renderer = screens[current] || screens.home;
    if (current === 'home') {
        screens.home(screenEl, navigate);
    } else if (current === 'settings') {
        await renderSettings(screenEl, navigate);
    } else {
        await renderer(screenEl);
    }
}

navEl.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
});

if (getSession()?.token) {
    current = 'players';
}

render();
