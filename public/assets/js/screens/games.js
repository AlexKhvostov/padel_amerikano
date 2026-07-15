import { companies, tournaments } from '../api.js';
import { setSession } from '../storage.js';
import { escapeHtml, renderError, toast } from '../ui.js';

export async function renderGames(container, navigate) {
    let selectedDate = today();
    let stopped = false;
    let loading = false;

    const load = async (showError = true) => {
        if (stopped || loading) return;
        loading = true;
        try {
            const data = await tournaments.list(selectedDate, !showError);
            if (!stopped) renderGamesView(container, data.tournaments || [], selectedDate, actions);
        } catch (error) {
            if (showError && !stopped) {
                renderError(container, error.message, () => load(true));
            }
        } finally {
            loading = false;
        }
    };

    const actions = {
        openHome: () => navigate('home'),
        adminLogin: (companyName) => {
            const url = new URL('/', window.location.origin);
            url.searchParams.set('company', companyName);
            window.history.replaceState({}, '', `${url.pathname}${url.search}`);
            navigate('home');
        },
        selectDate: async (date) => {
            selectedDate = date;
            await load(true);
        },
        watch: async (viewSlug) => {
            try {
                const session = await companies.view(viewSlug);
                setSession(session);
                navigate('rounds');
            } catch (error) {
                toast(error.message, true);
            }
        },
    };

    await load();
    const timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') load(false);
    }, 15000);

    return () => {
        stopped = true;
        window.clearInterval(timer);
    };
}

function renderGamesView(container, items, selectedDate, actions) {
    const groups = Object.groupBy
        ? Object.groupBy(items, (item) => item.created_date)
        : items.reduce((result, item) => {
              (result[item.created_date] ||= []).push(item);
              return result;
          }, {});

    container.innerHTML = `
        <header class="page-header games-header">
            <div>
                <span class="eyebrow">Падел Американо</span>
                <h1>Игры</h1>
            </div>
            <button class="header-action" id="btn-open-auth">Создать / войти</button>
        </header>

        <div class="games-filter">
            <label for="games-date">Создана</label>
            <input type="date" id="games-date" value="${selectedDate}">
            <button class="filter-all ${selectedDate ? '' : 'active'}" id="btn-all-games">Все</button>
        </div>

        <div class="games-groups">
            ${
                items.length
                    ? Object.entries(groups)
                          .map(([date, games]) => renderGroup(date, games))
                          .join('')
                    : `<div class="empty games-empty">
                           На выбранную дату компаний нет
                           ${selectedDate ? '<button class="btn btn-secondary" id="btn-empty-all">Показать все игры</button>' : ''}
                       </div>`
            }
        </div>
    `;

    container.querySelector('#btn-open-auth').addEventListener('click', actions.openHome);
    container.querySelector('#games-date').addEventListener('change', (event) => {
        actions.selectDate(event.currentTarget.value);
    });
    container.querySelector('#btn-all-games').addEventListener('click', () => actions.selectDate(''));
    container.querySelector('#btn-empty-all')?.addEventListener('click', () => actions.selectDate(''));
    container.querySelectorAll('[data-watch]').forEach((button) => {
        button.addEventListener('click', () => actions.watch(button.dataset.watch));
    });
    container.querySelectorAll('[data-admin-login]').forEach((button) => {
        button.addEventListener('click', () => actions.adminLogin(button.dataset.adminLogin));
    });
}

function renderGroup(date, games) {
    return `
        <section class="games-group">
            <h2>${formatDate(date)}</h2>
            <div class="games-list">
                ${games.map(renderGame).join('')}
            </div>
        </section>
    `;
}

function renderGame(game) {
    const active = game.status === 'active';
    const planned = game.status === 'planned';
    return `
        <article class="game-row status-${game.status}">
            <div class="game-title">
                <strong>${escapeHtml(game.name)}</strong>
                <span class="game-status ${planned ? 'planned' : active ? 'active' : 'completed'}">
                    ${planned ? 'Не начат' : active ? 'Идёт' : 'Завершён'}
                </span>
            </div>
            <div class="game-facts">
                <span><small>Создана</small><strong>${formatShortDate(game.created_date)} ${escapeHtml(game.created_time)}</strong></span>
                <span><small>Старт</small><strong>${game.start_date ? `${formatShortDate(game.start_date)} ${escapeHtml(game.start_time)}` : '—'}</strong></span>
                <span><small>Игроки</small><strong>${game.participants}</strong></span>
                <span><small>Матчи</small><strong>${game.played_matches}/${game.total_matches}</strong></span>
            </div>
            <div class="game-updated">Обновлено: ${formatUpdated(game.updated_at)}</div>
            <div class="game-actions">
                <button class="btn btn-ghost" data-admin-login="${escapeHtml(game.name)}">Войти</button>
                <button class="btn btn-secondary" data-watch="${game.view_slug}">Смотреть</button>
            </div>
        </article>
    `;
}

function today() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    const current = today();
    if (value === current) return 'Сегодня';
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date);
}

function formatUpdated(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatShortDate(value) {
    const [, month, day] = String(value || '').split('-');
    return day && month ? `${day}.${month}` : '—';
}
