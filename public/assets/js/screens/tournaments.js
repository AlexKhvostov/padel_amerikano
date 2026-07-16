import { tournaments } from '../api.js';
import { getSession, setActiveTournament } from '../storage.js';
import { confirmAction, escapeHtml, renderError, toast } from '../ui.js';

export async function renderTournaments(container, navigate) {
    const session = getSession();
    const canEdit = session.role === 'admin';
    let stopped = false;

    const load = async (showError = true) => {
        try {
            const data = await tournaments.list(session.id, !showError);
            if (!stopped) renderView(container, data.tournaments || [], canEdit, navigate, load);
        } catch (error) {
            if (showError && !stopped) {
                renderError(container, error.message, () => load(true));
            }
        }
    };

    await load();
    const timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') load(false);
    }, 10000);

    return () => {
        stopped = true;
        window.clearInterval(timer);
    };
}

function renderView(container, items, canEdit, navigate, reload) {
    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">Компания</span>
                <h1>Турниры</h1>
            </div>
            ${canEdit ? '<button class="header-action" id="btn-new-tournament">＋ Новый турнир</button>' : '<span class="status-pill">Просмотр</span>'}
        </header>
        <div class="tournament-hub-list">
            ${
                items.length
                    ? items.map((item) => renderTournament(item, canEdit)).join('')
                    : `<div class="empty">
                           Турниров пока нет
                           ${canEdit ? '<button class="btn btn-primary" id="btn-empty-new">Создать первый турнир</button>' : ''}
                       </div>`
            }
        </div>
    `;

    const create = () => navigate('tournament-create');
    container.querySelector('#btn-new-tournament')?.addEventListener('click', create);
    container.querySelector('#btn-empty-new')?.addEventListener('click', create);
    container.querySelectorAll('[data-open-tournament]').forEach((button) => {
        button.addEventListener('click', () => {
            const item = items.find((row) => Number(row.id) === Number(button.dataset.openTournament));
            if (!item) return;
            setActiveTournament(item);
            navigate('rounds');
        });
    });
    container.querySelectorAll('[data-delete-tournament]').forEach((button) => {
        button.addEventListener('click', async () => {
            const item = items.find((row) => Number(row.id) === Number(button.dataset.deleteTournament));
            if (!item || !confirmAction(
                `Удалить турнир «${item.name}»?\n\nТурнир ещё не начат. Это действие нельзя отменить.`
            )) return;
            try {
                await tournaments.remove(item.id);
                toast('Турнир удалён');
                await reload(true);
            } catch (error) {
                toast(error.message, true);
            }
        });
    });
}

function renderTournament(item, canEdit) {
    const displayStatus = item.display_status || item.status;
    const labels = {
        draft: 'Не начат',
        collecting: 'Собирается',
        active: 'Идёт',
        abandoned: 'Заброшен',
        completed: 'Завершён',
    };
    const date = new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    }).format(new Date(String(item.created_at).replace(' ', 'T')));
    return `
        <article class="card tournament-hub-row status-${displayStatus}">
            <button class="tournament-open" data-open-tournament="${item.id}">
                <div class="tournament-hub-title">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="game-status ${displayStatus}">${labels[displayStatus] || displayStatus}</span>
                </div>
                <div class="tournament-hub-facts">
                    <span><b>${date}</b><small>дата</small></span>
                    <span><b>${item.participants}</b><small>игроков</small></span>
                    <span><b>${item.played_matches}/${item.total_matches}</b><small>матчей</small></span>
                    <span><b>${item.active_round || '—'}</b><small>раунд</small></span>
                </div>
            </button>
            ${
                canEdit && item.status === 'draft'
                    ? `<button class="tournament-delete" data-delete-tournament="${item.id}" aria-label="Удалить турнир ${escapeHtml(item.name)}">
                           <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
                       </button>`
                    : ''
            }
        </article>
    `;
}
