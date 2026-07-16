import { getSession, clearSession, clearActiveTournament } from './storage.js';
import { renderHome } from './screens/home.js';
import { renderPlayers } from './screens/players.js';
import { renderRounds } from './screens/rounds.js';
import { renderRating } from './screens/rating.js';
import { renderSettings } from './screens/settings.js';
import { renderGames } from './screens/games.js';
import { renderTournaments } from './screens/tournaments.js';
import { renderTournamentCreate } from './screens/tournament-create.js';
import { renderTournamentSettings } from './screens/tournament-settings.js';

const screenEl = document.getElementById('screen');
const navEl = document.getElementById('nav');

const screens = {
    home: renderHome,
    players: renderPlayers,
    rounds: renderRounds,
    rating: renderRating,
    settings: renderSettings,
    games: renderGames,
    tournaments: renderTournaments,
    'tournament-create': renderTournamentCreate,
    'tournament-settings': renderTournamentSettings,
};

let current = 'games';
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
    const tournamentContext = ['rounds', 'rating', 'tournament-settings'].includes(current);

    if (!isAuth && !['home', 'games'].includes(current)) {
        current = 'games';
    }

    navEl.classList.toggle('hidden', !isAuth);
    navEl.classList.toggle('viewer-nav', isViewer);
    navEl.classList.toggle('four-item-nav', !tournamentContext && !isViewer);
    screenEl.classList.toggle('auth-screen', !isAuth);
    screenEl.classList.toggle('settings-screen', current === 'settings');
    navEl.querySelectorAll('[data-context]').forEach((button) => {
        let visible = button.dataset.context === (tournamentContext ? 'tournament' : 'company');
        if (button.dataset.screen === 'settings' && isViewer) visible = false;
        if (button.dataset.action === 'logout-company' && isViewer) visible = false;
        if (button.dataset.action === 'exit-view' && !isViewer) visible = false;
        button.classList.toggle('hidden', !visible);
    });

    navEl.querySelectorAll('.nav-btn').forEach((btn) => {
        const active = btn.dataset.screen === current;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });

    const renderer = screens[current] || screens.home;
    let cleanup = null;
    if (['home', 'games', 'tournaments', 'tournament-create', 'tournament-settings'].includes(current)) {
        cleanup = await screens[current](screenEl, navigate);
    } else if (current === 'rating') {
        cleanup = await renderRating(screenEl, 'tournament', navigate);
    } else if (current === 'rounds') {
        cleanup = await renderRounds(screenEl, navigate);
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
navEl.querySelector('[data-action="logout-company"]')?.addEventListener('click', () => {
    clearSession();
    navigate('games');
});
navEl.querySelector('[data-action="back-tournaments"]')?.addEventListener('click', () => {
    clearActiveTournament();
    navigate('tournaments');
});

const viewLinkRequested =
    /\/v\/[A-Za-z0-9_-]{12}\/?$/.test(window.location.pathname)
    || new URLSearchParams(window.location.search).has('view');

if (getSession()?.token && !viewLinkRequested) {
    current = 'tournaments';
} else if (viewLinkRequested || new URLSearchParams(window.location.search).has('company')) {
    current = 'home';
}

window.addEventListener('session-expired', () => {
    clearSession();
    navigate('games');
});

render();
