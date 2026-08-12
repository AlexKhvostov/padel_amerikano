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
    const settings = tournament.settings || {};
    const format = Number(settings.format) === 16 ? 16 : 24;
    const allowExtra = settings.allow_extra_ball !== false;
    const allowDraw = settings.allow_draw === true;

    container.innerHTML = `
        <header class="page-header">
            <div>
                <button class="context-back" id="btn-back-rounds">← К раундам</button>
                <h1>Настройки турнира</h1>
            </div>
            <span class="status-pill">${tournament.status === 'draft' ? 'Не начат' : tournament.status === 'active' ? 'Идёт' : 'Завершён'}</span>
        </header>
        ${locked ? '<div class="notice compact">После начала турнира название, состав и корты защищены. Правила счёта можно менять.</div>' : ''}
        <div class="card tournament-settings-card tournament-settings-main">
            <div class="field">
                <label for="tournament-settings-name">Название турнира</label>
                <input id="tournament-settings-name" maxlength="100" value="${escapeHtml(tournament.name)}" ${locked || !canEdit ? 'disabled' : ''}>
            </div>
            <div class="field compact-field">
                <label for="tournament-settings-courts">Корты</label>
                <input type="number" id="tournament-settings-courts" min="1" max="10"
                    value="${settings.courts_count || 1}" ${locked || !canEdit ? 'disabled' : ''}>
            </div>
        </div>
        <div class="card tournament-settings-rules">
            <div class="field">
                <label for="tournament-settings-format">Формат американки</label>
                <select id="tournament-settings-format" ${!canEdit ? 'disabled' : ''}>
                    <option value="16" ${format === 16 ? 'selected' : ''}>16 очков</option>
                    <option value="24" ${format === 24 ? 'selected' : ''}>24 очка</option>
                </select>
            </div>
            <label class="check-row">
                <input type="checkbox" id="tournament-settings-extra" ${allowExtra ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                <span id="tournament-settings-extra-label">Дополнительный мяч до ${format + 1}</span>
            </label>
            <label class="check-row">
                <input type="checkbox" id="tournament-settings-draw" ${allowDraw ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                <span>Разрешить ничью без предупреждения</span>
            </label>
            <p class="field-hint">Любой счёт можно сохранить. Если он не совпадает с выбранным форматом, система сначала предупредит.</p>
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
        ${canEdit ? '<button class="btn btn-primary" id="btn-save-tournament">Сохранить</button>' : ''}
        ${
            canEdit && tournament.status === 'completed' && !tournament.is_archived
                ? '<button class="btn btn-secondary" id="btn-clone-tournament">Повторить состав</button>'
                : ''
        }
        ${
            canEdit && tournament.status !== 'completed' && !tournament.is_archived
                ? '<button class="list-action danger" id="btn-reset-tournament"><span>Сбросить текущий турнир</span><b>Раунды и результаты этого турнира будут удалены</b></button>'
                : ''
        }
    `;

    const formatSelect = container.querySelector('#tournament-settings-format');
    const extraLabel = container.querySelector('#tournament-settings-extra-label');
    formatSelect?.addEventListener('change', () => {
        const value = Number(formatSelect.value) === 16 ? 16 : 24;
        if (extraLabel) {
            extraLabel.textContent = `Дополнительный мяч до ${value + 1}`;
        }
    });

    container.querySelector('#btn-back-rounds').addEventListener('click', () => navigate('rounds'));
    container.querySelector('#btn-save-tournament')?.addEventListener('click', async () => {
        try {
            const payload = {
                format: Number(container.querySelector('#tournament-settings-format').value),
                allow_extra_ball: container.querySelector('#tournament-settings-extra').checked,
                allow_draw: container.querySelector('#tournament-settings-draw').checked,
            };
            if (!locked) {
                const selectedIds = [...container.querySelectorAll('.tournament-settings-players input:checked')]
                    .map((input) => Number(input.value));
                if (selectedIds.length < 4 || selectedIds.length > 36) {
                    toast('Выберите от 4 до 36 участников', true);
                    return;
                }
                payload.name = container.querySelector('#tournament-settings-name').value;
                payload.courts_count = Number(container.querySelector('#tournament-settings-courts').value);
                const updated = await tournaments.update(tournament.id, payload);
                await tournaments.updatePlayers(tournament.id, selectedIds);
                setActiveTournament(updated);
            } else {
                const updated = await tournaments.update(tournament.id, payload);
                setActiveTournament(updated);
            }
            toast('Настройки турнира сохранены');
            navigate('rounds');
        } catch (error) {
            toast(error.message, true);
        }
    });
    container.querySelector('#btn-clone-tournament')?.addEventListener('click', async () => {
        try {
            const created = await tournaments.clone(tournament.id);
            setActiveTournament(created);
            toast(`Создан турнир «${created.name}»`);
            navigate('rounds');
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
