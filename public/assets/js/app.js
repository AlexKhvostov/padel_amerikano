import { getSession, clearSession } from './storage.js';
import { renderHome } from './screens/home.js';
import { renderPlayers } from './screens/players.js';
import { renderRounds } from './screens/rounds.js';
import { renderRating } from './screens/rating.js';
import { renderSettings } from './screens/settings.js';
import { renderGames } from './screens/games.js';

const screenEl = document.getElementById('screen');
const navEl = document.getElementById('nav');

const screens = {
    home: renderHome,
    players: renderPlayers,
    rounds: renderRounds,
    rating: renderRating,
    settings: renderSettings,
    games: renderGames,
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
    const isViewer = session?.role === 'viewer';

    if (!isAuth && !['home', 'games'].includes(current)) {
        current = 'home';
    }

    navEl.classList.toggle('hidden', !isAuth);
    screenEl.classList.toggle('auth-screen', !isAuth);
    navEl.querySelector('[data-screen="settings"]')?.classList.toggle('hidden', isViewer);
    navEl.querySelector('[data-action="exit-view"]')?.classList.toggle('hidden', !isViewer);

    navEl.querySelectorAll('.nav-btn').forEach((btn) => {
        const active = btn.dataset.screen === current;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });

    const renderer = screens[current] || screens.home;
    let cleanup = null;
    if (current === 'home' || current === 'games') {
        cleanup = await screens[current](screenEl, navigate);
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
    if (btn.dataset.screen) {
        btn.addEventListener('click', () => navigate(btn.dataset.screen));
    }
});

navEl.querySelector('[data-action="exit-view"]')?.addEventListener('click', () => {
    clearSession();
    navigate('games');
});

const viewLinkRequested =
    /\/v\/[A-Za-z0-9_-]{12}\/?$/.test(window.location.pathname)
    || new URLSearchParams(window.location.search).has('view');

if (getSession()?.token && !viewLinkRequested) {
    current = getSession()?.role === 'viewer' ? 'rounds' : 'players';
}

window.addEventListener('session-expired', () => {
    clearSession();
    navigate('home');
});

render();
