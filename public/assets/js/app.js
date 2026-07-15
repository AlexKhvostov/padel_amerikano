import { getSession, clearSession } from './storage.js';
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
let cleanupCurrent = null;

export function navigate(name) {
    cleanupCurrent?.();
    cleanupCurrent = null;
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
    screenEl.classList.toggle('auth-screen', !isAuth);

    navEl.querySelectorAll('.nav-btn').forEach((btn) => {
        const active = btn.dataset.screen === current;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });

    const renderer = screens[current] || screens.home;
    let cleanup = null;
    if (current === 'home') {
        cleanup = screens.home(screenEl, navigate);
    } else if (current === 'settings') {
        cleanup = await renderSettings(screenEl, navigate);
    } else {
        cleanup = await renderer(screenEl);
    }
    if (typeof cleanup === 'function') {
        cleanupCurrent = cleanup;
    }
}

navEl.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
});

if (getSession()?.token) {
    current = 'players';
}

window.addEventListener('session-expired', () => {
    clearSession();
    navigate('home');
});

render();
