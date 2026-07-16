import { players, tournaments } from '../api.js';
import { getSession, setActiveTournament } from '../storage.js';
import { confirmAction, escapeHtml, renderError, toast } from '../ui.js';

export async function renderTournamentSettings(container, navigate) {
    const session = getSession();
    if (!session.tournamentId) {
        navigate('tournaments');
        return;
    }

    let tournament;
    let roster;
    let selected;
    try {
        [tournament, roster, selected] = await Promise.all([
            tournaments.get(session.tournamentId),
            players.list(session.id),
            tournaments.players(session.tournamentId),
        ]);
    } catch (error) {
        renderError(container, error.message, () => renderTournamentSettings(container, navigate));
        return;
    }

    const canEdit = session.role === 'admin';
    const locked = tournament.status !== 'draft';
    container.innerHTML = `
        <header class="page-header">
            <div>
                <button class="context-back" id="btn-back-tournaments">← Все турниры</button>
                <h1>Настройки турнира</h1>
            </div>
            <span class="status-pill">${tournament.status === 'draft' ? 'Не начат' : tournament.status === 'active' ? 'Идёт' : 'Завершён'}</span>
        </header>
        ${locked ? '<div class="notice compact">После начала турнира название, состав и корты защищены от изменений.</div>' : ''}
        <div class="card tournament-settings-card">
            <div class="field">
                <label for="tournament-settings-name">Название турнира</label>
                <input id="tournament-settings-name" maxlength="100" value="${escapeHtml(tournament.name)}" ${locked || !canEdit ? 'disabled' : ''}>
            </div>
            <div class="field compact-field">
                <label for="tournament-settings-courts">Количество кортов</label>
                <input type="number" id="tournament-settings-courts" min="1" max="10"
                    value="${tournament.settings?.courts_count || 1}" ${locked || !canEdit ? 'disabled' : ''}>
            </div>
        </div>
        ${
            !locked && canEdit
                ? `<div class="tournament-select-head"><div><strong>Состав турнира</strong><span>От 4 до 36 игроков</span></div></div>
                   <div class="tournament-player-select tournament-settings-players">
                       ${(roster.players || []).filter((player) => player.is_active).map((player, index) => `
                           <label class="card tournament-player-option">
                               <input type="checkbox" value="${player.id}" ${selected.players.some((item) => item.id === player.id) ? 'checked' : ''}>
                               <span class="player-number">${index + 1}</span>
                               <span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.telegram || 'без Telegram')}</small></span>
                           </label>
                       `).join('')}
                   </div>`
                : ''
        }
        ${canEdit && !locked ? '<button class="btn btn-primary" id="btn-save-tournament">Сохранить</button>' : ''}
        ${
            canEdit && tournament.status !== 'completed'
                ? '<button class="list-action danger" id="btn-reset-tournament"><span>Сбросить текущий турнир</span><b>Раунды и результаты этого турнира будут удалены</b></button>'
                : ''
        }
    `;

    container.querySelector('#btn-back-tournaments').addEventListener('click', () => navigate('tournaments'));
    container.querySelector('#btn-save-tournament')?.addEventListener('click', async () => {
        try {
            const selectedIds = [...container.querySelectorAll('.tournament-settings-players input:checked')]
                .map((input) => Number(input.value));
            if (selectedIds.length < 4 || selectedIds.length > 36) {
                toast('Выберите от 4 до 36 участников', true);
                return;
            }
            const updated = await tournaments.update(tournament.id, {
                name: container.querySelector('#tournament-settings-name').value,
                courts_count: Number(container.querySelector('#tournament-settings-courts').value),
            });
            await tournaments.updatePlayers(tournament.id, selectedIds);
            setActiveTournament(updated);
            toast('Настройки турнира сохранены');
            renderTournamentSettings(container, navigate);
        } catch (error) {
            toast(error.message, true);
        }
    });
    container.querySelector('#btn-reset-tournament')?.addEventListener('click', async () => {
        if (!confirmAction('Удалить все раунды и результаты только этого турнира?')) return;
        try {
            await tournaments.reset(tournament.id);
            tournament.status = 'draft';
            setActiveTournament(tournament);
            toast('Турнир сброшен');
            navigate('rounds');
        } catch (error) {
            toast(error.message, true);
        }
    });
}
