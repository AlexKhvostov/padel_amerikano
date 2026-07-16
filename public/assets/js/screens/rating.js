import { rating } from '../api.js';
import { getSession } from '../storage.js';
import { escapeHtml, renderError } from '../ui.js';

export async function renderRating(container, scope = 'tournament', navigate = null) {
    const session = getSession();
    if (scope === 'tournament' && !session.tournamentId) {
        navigate?.('tournaments');
        return;
    }
    let stopped = false;

    const load = async (showError = true) => {
        try {
            const data = scope === 'company'
                ? await rating.company(session.id)
                : await rating.tournament(session.tournamentId);
            if (!stopped) renderRows(container, data, scope, navigate);
        } catch (e) {
            if (showError && !stopped) {
                renderError(container, e.message, () => renderRating(container, scope, navigate));
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

function renderRows(container, data, scope, navigate) {
    const rows = data.rating || [];
    const progress = data.progress || { played: 0, total: 0 };

    container.innerHTML = `
        <header class="page-header rating-header">
            <div>
                <span class="eyebrow">${scope === 'company' ? 'Все турниры' : 'Текущие результаты'}</span>
                <h1>${scope === 'company' ? 'Рейтинг компании' : 'Рейтинг турнира'}</h1>
            </div>
            <div class="rating-progress">
                <strong>${progress.played}/${progress.total}</strong>
                <span>матчей сыграно</span>
            </div>
        </header>
        <div class="rating-list">
            ${
                rows.length
                    ? rows.map((player) => renderPlayer(player, scope)).join('')
                    : '<div class="empty">Нет данных — сыграйте первые матчи</div>'
            }
        </div>
    `;
}

function renderPlayer(player, scope) {
    const placeClass = player.place <= 3 ? ` top-${player.place}` : '';

    return `
        <article class="rating-row ${!player.is_active ? 'inactive' : ''}">
            <div class="rating-place${placeClass}">${player.place}</div>
            <div class="rating-name">
                <div>
                    <strong>${escapeHtml(player.name)}</strong>
                    ${scope === 'company' && player.is_provisional ? '<small class="rating-provisional">предв.</small>' : ''}
                </div>
                <div class="rating-metrics" aria-label="Игры ${player.matches} из ${player.planned_matches}, доля очков ${player.point_share}%, побед ${player.win_rate}%">
                    <span class="games"><b>${player.matches}/${player.planned_matches}</b><small>игр</small></span>
                    <span><b>${player.point_share}%</b><small>очков</small></span>
                    <span class="wins"><b>${player.win_rate}%</b><small>побед</small></span>
                    <span class="difference"><b>${formatSigned(player.average_difference)}</b><small>разница</small></span>
                </div>
            </div>
            <div class="rating-points">
                <strong>${scope === 'company' ? `${player.point_share}%` : player.points}</strong>
                <span>${scope === 'company' ? 'доля очков' : 'очков'}</span>
            </div>
        </article>
    `;
}

function formatSigned(value) {
    const number = Number(value) || 0;
    return `${number > 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 2,
    }).format(number)}`;
}
