import { players, tournaments } from '../api.js';
import { getSession, setActiveTournament } from '../storage.js';
import { escapeHtml, renderError, toast } from '../ui.js';

export async function renderTournamentCreate(container, navigate) {
    const session = getSession();
    if (session.role !== 'admin') {
        navigate('tournaments');
        return;
    }

    let roster;
    try {
        roster = await players.list(session.id);
    } catch (error) {
        renderError(container, error.message, () => renderTournamentCreate(container, navigate));
        return;
    }

    const active = (roster.players || []).filter((player) => player.is_active);
    const today = new Intl.DateTimeFormat('ru-RU').format(new Date());
    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">Новая игра</span>
                <h1>Создать турнир</h1>
            </div>
            <button class="header-action" id="btn-cancel-tournament">Отмена</button>
        </header>
        <div class="card tournament-create-main">
            <div class="field">
                <label for="tournament-name">Название</label>
                <input id="tournament-name" maxlength="100" value="Турнир ${today}">
            </div>
            <div class="field compact-field">
                <label for="tournament-courts">Количество кортов</label>
                <input type="number" id="tournament-courts" min="1" max="10" value="1">
            </div>
        </div>
        <div class="tournament-select-head">
            <div><strong>Участники</strong><span id="selected-count">Выбрано: ${active.length}</span></div>
            <div>
                <button class="mini-action" id="btn-select-all">Все</button>
                <button class="mini-action" id="btn-select-none">Снять</button>
            </div>
        </div>
        <div class="tournament-player-select">
            ${
                active.length
                    ? active.map((player, index) => `
                        <label class="card tournament-player-option">
                            <input type="checkbox" value="${player.id}" checked>
                            <span class="player-number">${index + 1}</span>
                            <span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.telegram || 'без Telegram')}</small></span>
                        </label>
                    `).join('')
                    : '<div class="empty">Сначала добавьте участников компании</div>'
            }
        </div>
        <button class="btn btn-primary sticky-create-action" id="btn-create-tournament" ${active.length < 4 ? 'disabled' : ''}>
            Создать турнир
        </button>
    `;

    const checks = [...container.querySelectorAll('.tournament-player-option input')];
    const refreshCount = () => {
        const count = checks.filter((input) => input.checked).length;
        container.querySelector('#selected-count').textContent = `Выбрано: ${count}`;
        container.querySelector('#btn-create-tournament').disabled = count < 4 || count > 36;
    };
    checks.forEach((input) => input.addEventListener('change', refreshCount));
    container.querySelector('#btn-select-all').addEventListener('click', () => {
        checks.forEach((input) => { input.checked = true; });
        refreshCount();
    });
    container.querySelector('#btn-select-none').addEventListener('click', () => {
        checks.forEach((input) => { input.checked = false; });
        refreshCount();
    });
    container.querySelector('#btn-cancel-tournament').addEventListener('click', () => navigate('tournaments'));
    container.querySelector('#btn-create-tournament').addEventListener('click', async () => {
        try {
            const tournament = await tournaments.create(session.id, {
                name: container.querySelector('#tournament-name').value,
                courts_count: Number(container.querySelector('#tournament-courts').value),
                player_ids: checks.filter((input) => input.checked).map((input) => Number(input.value)),
            });
            setActiveTournament(tournament);
            toast('Турнир создан');
            navigate('rounds');
        } catch (error) {
            toast(error.message, true);
        }
    });
}
