import { rating } from '../api.js';
import { getSession } from '../storage.js';
import { escapeHtml, telegramLink, renderError } from '../ui.js';

export async function renderRating(container) {
    const session = getSession();
    let stopped = false;

    const load = async (showError = true) => {
        try {
            const data = await rating.get(session.id);
            if (!stopped) renderRows(container, data.rating || []);
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

function renderRows(container, rows) {
    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">Текущие результаты</span>
                <h1>Рейтинг</h1>
            </div>
            <span class="live-pill"><i></i> Live</span>
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
        <article class="card rating-card ${!player.is_active ? 'inactive' : ''}">
            <div class="rating-head">
                <div class="rating-place${placeClass}">${player.place}</div>
                <div class="rating-name">
                    <strong>${escapeHtml(player.name)}</strong>
                    ${
                        telegram
                            ? `<a href="${telegram.href}" target="_blank" rel="noopener">${escapeHtml(telegram.label)}</a>`
                            : '<span>Telegram не указан</span>'
                    }
                </div>
                <div class="rating-points"><strong>${player.points}</strong><span>очков</span></div>
            </div>
            <div class="rating-stats">
                <span>Матчей <strong>${player.matches}</strong></span>
                <span>Побед <strong>${player.wins}</strong></span>
                <span>Поражений <strong>${player.losses}</strong></span>
            </div>
        </article>
    `;
}
