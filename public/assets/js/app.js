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
const tournamentSubnavEl = document.getElementById('tournament-subnav');

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
const screenTitles = {
    home: 'Вход',
    games: 'Компании',
    players: 'Участники компании',
    tournaments: 'Турниры компании',
    'tournament-create': 'Создание турнира',
    rounds: 'Раунды турнира',
    rating: 'Рейтинг турнира',
    settings: 'Настройки компании',
    'tournament-settings': 'Настройки турнира',
};

let current = 'games';
let cleanupCurrent = null;

export function navigate(name) {
    cleanupCurrent?.();
    cleanupCurrent = null;
    current = name;
    render().then(() => {
        if (current === name) trackScreen(name);
    });
}

function trackScreen(name) {
    if (typeof window.ym !== 'function') return;
    const virtualUrl = `${window.location.origin}/spa/${encodeURIComponent(name)}`;
    window.ym(110792369, 'hit', virtualUrl, {
        title: screenTitles[name] || 'Падел Американо',
        referer: window.location.href,
    });
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
    tournamentSubnavEl.classList.toggle('hidden', !isAuth || !tournamentContext);
    screenEl.classList.toggle('auth-screen', !isAuth);
    screenEl.classList.toggle('settings-screen', current === 'settings');
    screenEl.classList.toggle('tournament-context-screen', tournamentContext);
    navEl.querySelectorAll('[data-context]').forEach((button) => {
        let visible = button.dataset.context === 'company';
        if (button.dataset.screen === 'settings' && isViewer) visible = false;
        if (button.dataset.action === 'exit-view' && !isViewer) visible = false;
        button.classList.toggle('hidden', !visible);
    });

    navEl.querySelectorAll('.nav-btn').forEach((btn) => {
        const active = btn.dataset.screen === current
            || (btn.dataset.screen === 'tournaments'
                && ['rounds', 'rating', 'tournament-settings', 'tournament-create'].includes(current));
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });
    tournamentSubnavEl.querySelectorAll('.tournament-subnav-btn').forEach((btn) => {
        const active = btn.dataset.screen === current
            || (btn.dataset.screen === 'rounds' && current === 'tournament-settings');
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
        btn.addEventListener('click', () => {
            if (btn.dataset.screen === 'tournaments') {
                clearActiveTournament();
            }
            navigate(btn.dataset.screen);
        });
    }
});
tournamentSubnavEl.querySelectorAll('.tournament-subnav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.screen));
});

navEl.querySelector('[data-action="exit-view"]')?.addEventListener('click', () => {
    clearSession();
    navigate('games');
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
