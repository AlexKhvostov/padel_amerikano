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
    container.querySelectorAll('[data-clone-tournament]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation();
            const item = items.find((row) => Number(row.id) === Number(button.dataset.cloneTournament));
            if (!item) return;
            try {
                const created = await tournaments.clone(item.id);
                setActiveTournament(created);
                toast(`Создан турнир «${created.name}»`);
                navigate('rounds');
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
    const canClone = canEdit && item.status === 'completed' && !showArchived;
    const rightActions = canEdit
        ? (showArchived
            ? `<button type="button" class="swipe-action restore" data-unarchive-tournament="${item.id}">Вернуть</button>
               <button type="button" class="swipe-action danger" data-delete-tournament="${item.id}">Удалить</button>`
            : `<button type="button" class="swipe-action archive" data-archive-tournament="${item.id}">Архив</button>
               <button type="button" class="swipe-action danger" data-delete-tournament="${item.id}">Удалить</button>`)
        : '';
    const leftActions = canClone
        ? `<button type="button" class="swipe-action restore" data-clone-tournament="${item.id}">Повторить</button>`
        : '';

    return `
        <div class="tournament-swipe-item" data-swipe-item>
            ${leftActions ? `<div class="tournament-swipe-actions swipe-left">${leftActions}</div>` : ''}
            ${rightActions ? `<div class="tournament-swipe-actions swipe-right">${rightActions}</div>` : ''}
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
                        ? `<button class="tournament-more" type="button" data-toggle-swipe="right" aria-label="Действия с турниром ${escapeHtml(item.name)}">⋯</button>`
                        : ''
                }
            </article>
        </div>
    `;
}

function bindSwipe(container) {
    const closeAll = (except = null) => {
        container.querySelectorAll('[data-swipe-item].open-left, [data-swipe-item].open-right').forEach((item) => {
            if (item !== except) {
                item.classList.remove('open-left', 'open-right');
            }
        });
    };
    const measure = (item) => {
        const left = item.querySelector('.swipe-left');
        const right = item.querySelector('.swipe-right');
        const leftWidth = left?.offsetWidth || 0;
        const rightWidth = right?.offsetWidth || 148;
        item.style.setProperty('--swipe-left', `${leftWidth}px`);
        item.style.setProperty('--swipe-right', `${rightWidth}px`);
        return { leftWidth, rightWidth };
    };

    container.querySelectorAll('[data-toggle-swipe]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const item = button.closest('[data-swipe-item]');
            const side = button.dataset.toggleSwipe || 'right';
            const willOpen = !item.classList.contains(`open-${side}`);
            closeAll(item);
            measure(item);
            item.classList.toggle(`open-${side}`, willOpen);
        });
    });

    container.querySelectorAll('[data-swipe-item]').forEach((item) => {
        const front = item.querySelector('[data-swipe-front]');
        if (!front) return;
        let startX = 0;
        let currentX = 0;
        let dragging = false;
        let leftWidth = 0;
        let rightWidth = 148;

        const onStart = (clientX) => {
            dragging = true;
            startX = clientX;
            currentX = clientX;
            ({ leftWidth, rightWidth } = measure(item));
            item.classList.add('dragging');
        };
        const onMove = (clientX) => {
            if (!dragging) return;
            currentX = clientX;
            const delta = currentX - startX;
            const limited = Math.max(-rightWidth, Math.min(leftWidth, delta));
            front.style.transform = `translateX(${limited}px)`;
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            item.classList.remove('dragging');
            front.style.transform = '';
            const delta = currentX - startX;
            if (delta < -56 && rightWidth > 0) {
                closeAll(item);
                item.classList.add('open-right');
            } else if (delta > 56 && leftWidth > 0) {
                closeAll(item);
                item.classList.add('open-left');
            } else if (Math.abs(delta) > 24) {
                item.classList.remove('open-left', 'open-right');
            }
        };

        front.addEventListener('touchstart', (event) => onStart(event.changedTouches[0].clientX), { passive: true });
        front.addEventListener('touchmove', (event) => onMove(event.changedTouches[0].clientX), { passive: true });
        front.addEventListener('touchend', onEnd);
        front.addEventListener('touchcancel', onEnd);
    });
}
