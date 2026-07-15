import { rating } from '../api.js';
import { getSession } from '../storage.js';
import { escapeHtml, telegramLink, renderError } from '../ui.js';

export async function renderRating(container) {
    const session = getSession();
    let stopped = false;

    const load = async (showError = true) => {
        try {
            const data = await rating.get(session.id);
            if (!stopped) renderRows(container, data);
        } catch (e) {
            if (showError && !stopped) {
                renderError(container, e.message, () => renderRating(container));
            }
        }
    };

    await load();
    const timer = window.setInterval(() => load(false), 5000);
    const refresh = () => load(false);
    window.addEventListener('rating-updated', refresh);

    return () => {
        stopped = true;
        window.clearInterval(timer);
        window.removeEventListener('rating-updated', refresh);
    };
}

function renderRows(container, data) {
    const rows = data.rating || [];
    const progress = data.progress || { played: 0, total: 0 };

    container.innerHTML = `
        <header class="page-header rating-header">
            <div>
                <span class="eyebrow">Текущие результаты</span>
                <h1>Рейтинг</h1>
            </div>
            <div class="rating-progress">
                <strong>${progress.played}/${progress.total}</strong>
                <span>матчей сыграно</span>
            </div>
        </header>
        <div class="rating-list">
            ${
                rows.length
                    ? rows.map(renderPlayer).join('')
                    : '<div class="empty">Нет данных — сыграйте первые матчи</div>'
            }
        </div>
    `;
}

function renderPlayer(player) {
    const telegram = telegramLink(player.telegram);
    const placeClass = player.place <= 3 ? ` top-${player.place}` : '';

    return `
        <article class="rating-row ${!player.is_active ? 'inactive' : ''}">
            <div class="rating-place${placeClass}">${player.place}</div>
            <div class="rating-name">
                <div>
                    <strong>${escapeHtml(player.name)}</strong>
                    ${
                        telegram
                            ? `<a href="${telegram.href}" target="_blank" rel="noopener" aria-label="Telegram ${escapeHtml(player.name)}">↗</a>`
                            : ''
                    }
                </div>
                <span>Игры ${player.matches}/${player.planned_matches} · В ${player.wins} · П ${player.losses}</span>
            </div>
            <div class="rating-points"><strong>${player.points}</strong><span>очков</span></div>
        </article>
    `;
}
