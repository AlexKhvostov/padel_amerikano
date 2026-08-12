import { tournaments } from '../api.js';
import { getSession, setActiveTournament } from '../storage.js';
import { confirmAction, escapeHtml, renderError, toast } from '../ui.js';

export async function renderTournaments(container, navigate) {
    const session = getSession();
    const canEdit = session.role === 'admin';
    let stopped = false;
    let showArchived = false;

    const load = async (showError = true) => {
        try {
            const data = await tournaments.list(session.id, !showError, showArchived);
            if (!stopped) {
                renderView(container, data.tournaments || [], canEdit, navigate, load, showArchived, (value) => {
                    showArchived = value;
                    load(true);
                });
            }
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

function renderView(container, items, canEdit, navigate, reload, showArchived, setArchived) {
    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">Компания</span>
                <h1>Турниры</h1>
            </div>
            ${canEdit && !showArchived ? '<button class="header-action" id="btn-new-tournament">＋ Новый турнир</button>' : '<span class="status-pill">Просмотр</span>'}
        </header>
        <div class="segmented tournament-hub-tabs" role="tablist">
            <button type="button" class="segment ${!showArchived ? 'active' : ''}" data-hub-tab="active">Активные</button>
            <button type="button" class="segment ${showArchived ? 'active' : ''}" data-hub-tab="archived">Архив</button>
        </div>
        <div class="tournament-hub-list">
            ${
                items.length
                    ? items.map((item) => renderTournament(item, canEdit, showArchived)).join('')
                    : `<div class="empty">
                           ${showArchived ? 'В архиве пока пусто' : 'Турниров пока нет'}
                           ${!showArchived && canEdit ? '<button class="btn btn-primary" id="btn-empty-new">Создать первый турнир</button>' : ''}
                       </div>`
            }
        </div>
    `;

    container.querySelectorAll('[data-hub-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            setArchived(button.dataset.hubTab === 'archived');
        });
    });

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
    container.querySelectorAll('[data-archive-tournament]').forEach((button) => {
        button.addEventListener('click', async () => {
            const item = items.find((row) => Number(row.id) === Number(button.dataset.archiveTournament));
            if (!item || !confirmAction(
                `Отправить турнир «${item.name}» в архив?\n\nОн сохранится, но не будет учитываться в рейтинге компании.`
            )) return;
            try {
                await tournaments.archive(item.id);
                toast('Турнир в архиве');
                await reload(true);
            } catch (error) {
                toast(error.message, true);
            }
        });
    });
    container.querySelectorAll('[data-unarchive-tournament]').forEach((button) => {
        button.addEventListener('click', async () => {
            const item = items.find((row) => Number(row.id) === Number(button.dataset.unarchiveTournament));
            if (!item) return;
            try {
                await tournaments.unarchive(item.id);
                toast('Турнир возвращён из архива');
                await reload(true);
            } catch (error) {
                toast(error.message, true);
            }
        });
    });
    container.querySelectorAll('[data-delete-tournament]').forEach((button) => {
        button.addEventListener('click', async () => {
            const item = items.find((row) => Number(row.id) === Number(button.dataset.deleteTournament));
            if (!item || !confirmAction(
                `Удалить турнир «${item.name}» полностью?\n\nРаунды и результаты будут удалены без возможности восстановления.`
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

    if (canEdit) {
        bindSwipe(container);
    }
}

function renderTournament(item, canEdit, showArchived) {
    const displayStatus = item.display_status || item.status;
    const labels = {
        draft: 'Не начат',
        collecting: 'Собирается',
        active: 'Идёт',
        abandoned: 'Заброшен',
        completed: 'Завершён',
        archived: 'Архив',
    };
    const date = new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    }).format(new Date(String(item.created_at).replace(' ', 'T')));
    const actions = canEdit
        ? (showArchived
            ? `<button type="button" class="swipe-action restore" data-unarchive-tournament="${item.id}">Вернуть</button>
               <button type="button" class="swipe-action danger" data-delete-tournament="${item.id}">Удалить</button>`
            : `<button type="button" class="swipe-action archive" data-archive-tournament="${item.id}">Архив</button>
               <button type="button" class="swipe-action danger" data-delete-tournament="${item.id}">Удалить</button>`)
        : '';

    return `
        <div class="tournament-swipe-item" data-swipe-item>
            <div class="tournament-swipe-actions">${actions}</div>
            <article class="card tournament-hub-row status-${displayStatus}" data-swipe-front>
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
                    canEdit
                        ? `<button class="tournament-more" type="button" data-toggle-swipe aria-label="Действия с турниром ${escapeHtml(item.name)}">⋯</button>`
                        : ''
                }
            </article>
        </div>
    `;
}

function bindSwipe(container) {
    const closeAll = (except = null) => {
        container.querySelectorAll('[data-swipe-item].open').forEach((item) => {
            if (item !== except) item.classList.remove('open');
        });
    };

    container.querySelectorAll('[data-toggle-swipe]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const item = button.closest('[data-swipe-item]');
            const willOpen = !item.classList.contains('open');
            closeAll(item);
            item.classList.toggle('open', willOpen);
        });
    });

    container.querySelectorAll('[data-swipe-item]').forEach((item) => {
        const front = item.querySelector('[data-swipe-front]');
        if (!front) return;
        let startX = 0;
        let currentX = 0;
        let dragging = false;

        const onStart = (clientX) => {
            dragging = true;
            startX = clientX;
            currentX = clientX;
            item.classList.add('dragging');
        };
        const onMove = (clientX) => {
            if (!dragging) return;
            currentX = clientX;
            const delta = Math.min(0, currentX - startX);
            front.style.transform = `translateX(${Math.max(delta, -148)}px)`;
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            item.classList.remove('dragging');
            front.style.transform = '';
            const delta = currentX - startX;
            if (delta < -56) {
                closeAll(item);
                item.classList.add('open');
            } else if (delta > 40) {
                item.classList.remove('open');
            }
        };

        front.addEventListener('touchstart', (event) => onStart(event.changedTouches[0].clientX), { passive: true });
        front.addEventListener('touchmove', (event) => onMove(event.changedTouches[0].clientX), { passive: true });
        front.addEventListener('touchend', onEnd);
        front.addEventListener('touchcancel', onEnd);
    });
}
