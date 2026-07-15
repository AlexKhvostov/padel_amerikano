import { rating } from '../api.js';
import { getSession } from '../storage.js';
import { escapeHtml, telegramLink } from '../ui.js';

export async function renderRating(container) {
    const session = getSession();
    let data;

    try {
        data = await rating.get(session.id);
    } catch (e) {
        container.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
        return;
    }

    const rows = data.rating || [];
    container.innerHTML = `
        <h1>Рейтинг</h1>
        ${
            rows.length
                ? `<div class="card" style="overflow-x:auto">
            <table class="rating-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Игрок</th>
                        <th>TG</th>
                        <th>Матчей</th>
                        <th>Очков</th>
                        <th>В</th>
                        <th>П</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows
                        .map((r) => {
                            const tg = telegramLink(r.telegram);
                            const place = r.medal ? `${r.medal} ${r.place}` : r.place;
                            return `<tr class="${!r.is_active ? 'inactive' : ''}">
                                <td>${place}</td>
                                <td>${escapeHtml(r.name)}</td>
                                <td>${tg ? `<a href="${tg.href}" target="_blank">${escapeHtml(tg.label)}</a>` : '—'}</td>
                                <td>${r.matches}</td>
                                <td><strong>${r.points}</strong></td>
                                <td>${r.wins}</td>
                                <td>${r.losses}</td>
                            </tr>`;
                        })
                        .join('')}
                </tbody>
            </table>
        </div>`
                : '<div class="empty">Нет данных — сыграйте первые матчи</div>'
        }
    `;
}
