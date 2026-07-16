import { players } from '../api.js';
import { getSession } from '../storage.js';
import { toast, telegramLink, escapeHtml, confirmAction, renderError } from '../ui.js';

export async function renderPlayers(container) {
    const session = getSession();
    const canEdit = session.role !== 'viewer';
    let data;

    try {
        data = await players.list(session.id);
    } catch (e) {
        renderError(container, e.message, () => renderPlayers(container));
        return;
    }
    let showAll = false;

    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">Постоянная группа</span>
                <h1>Участники</h1>
            </div>
            <div class="player-header-controls">
                <div class="player-list-filter" role="tablist" aria-label="Фильтр участников">
                    <button class="active" data-player-filter="active" role="tab" aria-selected="true">Активные</button>
                    <button data-player-filter="all" role="tab" aria-selected="false">Все</button>
                </div>
                ${
                    canEdit
                        ? `<button class="header-action" id="show-add-player" aria-expanded="false">
                               <span aria-hidden="true">＋</span> Добавить
                           </button>`
                        : ''
                }
            </div>
        </header>

        <div class="info-strip">
            <span>Активные игроки</span>
            <strong>${data.active_count}<small> / ${data.max}</small></strong>
        </div>

        ${
            canEdit
                ? `<div class="card add-player-card hidden" id="add-player-card">
            <div class="section-heading">
                <h2>Новый игрок</h2>
                <p>Telegram можно добавить позже</p>
            </div>
            <div class="add-player-fields">
                <div class="field">
                    <label for="player-name">Имя *</label>
                    <input id="player-name" placeholder="Иван Петров">
                </div>
                <div class="field">
                    <label for="player-telegram">Telegram</label>
                    <input id="player-telegram" placeholder="@username">
                </div>
            </div>
            <div class="button-row">
                <button class="btn btn-ghost" id="cancel-add-player">Отмена</button>
                <button class="btn btn-primary" id="btn-add-player">Добавить</button>
            </div>
                   </div>`
                : ''
        }

        <div id="players-list" class="player-list"></div>
        <dialog class="player-stats-dialog" id="player-stats-dialog">
            <div class="player-stats-head">
                <div><span class="eyebrow">Статистика компании</span><h2 id="player-stats-title">Игрок</h2></div>
                <button class="dialog-close" id="btn-close-player-stats" aria-label="Закрыть">×</button>
            </div>
            <div class="player-stats-body" id="player-stats-body"></div>
        </dialog>
    `;

    const listEl = container.querySelector('#players-list');
    const renderFilteredList = () => {
        const visiblePlayers = showAll
            ? data.players
            : data.players.filter((player) => player.is_active);
        renderList(listEl, visiblePlayers, session.id, canEdit);
    };
    renderFilteredList();
    container.querySelectorAll('[data-player-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            showAll = button.dataset.playerFilter === 'all';
            container.querySelectorAll('[data-player-filter]').forEach((item) => {
                const active = item === button;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', String(active));
            });
            renderFilteredList();
        });
    });
    container.querySelector('#btn-close-player-stats').addEventListener('click', () => {
        container.querySelector('#player-stats-dialog').close();
    });
    container.querySelector('#player-stats-dialog').addEventListener('click', (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
            event.clientX < rect.left
            || event.clientX > rect.right
            || event.clientY < rect.top
            || event.clientY > rect.bottom;
        if (event.target === event.currentTarget && outside) {
            event.currentTarget.close();
        }
    });

    if (!canEdit) return;

    const addCard = container.querySelector('#add-player-card');
    const showAddButton = container.querySelector('#show-add-player');
    showAddButton.addEventListener('click', () => {
        addCard.classList.toggle('hidden');
        const expanded = !addCard.classList.contains('hidden');
        showAddButton.setAttribute('aria-expanded', String(expanded));
    });
    container.querySelector('#cancel-add-player').addEventListener('click', () => {
        addCard.classList.add('hidden');
        showAddButton.setAttribute('aria-expanded', 'false');
    });

    container.querySelector('#btn-add-player').addEventListener('click', async () => {
        try {
            await players.create(session.id, {
                name: container.querySelector('#player-name').value,
                telegram: container.querySelector('#player-telegram').value,
            });
            toast('Игрок добавлен');
            renderPlayers(container);
        } catch (e) {
            toast(e.message, true);
        }
    });
}

function renderList(el, items, companyId, canEdit) {
    if (!items.length) {
        el.innerHTML = '<div class="empty">Пока нет игроков</div>';
        return;
    }

    el.innerHTML = items
        .map((p, index) => {
            const inactive = !p.is_active ? ' inactive' : '';
            return `
            <article class="card player-card player-stats-trigger${inactive}" data-stats="${p.id}" role="button" tabindex="0"
                aria-label="Подробная статистика игрока ${escapeHtml(p.name)}">
                <div class="player-number" aria-label="Номер ${index + 1}">${index + 1}</div>
                <div class="player-info">
                    <div class="name">${escapeHtml(p.name)}${!p.is_active ? ' (неактивен)' : ''}</div>
                    <div class="player-company-primary">
                        <span><b>${formatNumber(p.point_share)}%</b><small>доля очков</small></span>
                        <span><b>${formatSigned(p.average_difference)}</b><small>разница / игру</small></span>
                    </div>
                    <div class="player-company-stats">
                        <span><b>${p.tournaments_played ?? 0}</b> турн.</span>
                        <span><b>${p.matches ?? 0}</b> игр</span>
                        <span><b>${formatNumber(p.win_rate)}%</b> побед</span>
                        ${p.is_provisional ? '<span class="provisional-stat">предварительно</span>' : ''}
                    </div>
                    ${
                        canEdit
                            ? `<div class="player-actions">
                                   <button class="icon-action" data-edit="${p.id}" aria-label="Редактировать ${escapeHtml(p.name)}">
                                       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                                   </button>
                                   ${
                                       p.is_active
                                           ? `<button class="icon-action danger" data-del="${p.id}" aria-label="Удалить ${escapeHtml(p.name)}">
                                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
                                              </button>`
                                           : ''
                                   }
                               </div>`
                            : ''
                    }
                </div>
            </article>`;
        })
        .join('');

    el.querySelectorAll('[data-stats]').forEach((card) => {
        const open = () => openPlayerStats(card.dataset.stats);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => {
            if (event.target !== card) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });

    el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            editPlayer(el, items, btn.dataset.edit, companyId);
        });
    });

    el.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!confirmAction('Удалить игрока?')) return;
            try {
                await players.remove(btn.dataset.del);
                toast('Игрок удалён');
                renderPlayers(document.getElementById('screen'));
            } catch (e) {
                toast(e.message, true);
            }
        });
    });
}

async function openPlayerStats(playerId) {
    const dialog = document.getElementById('player-stats-dialog');
    const title = document.getElementById('player-stats-title');
    const body = document.getElementById('player-stats-body');
    if (!dialog || !body) return;
    title.textContent = 'Загрузка…';
    body.innerHTML = '<div class="empty">Загружаем статистику</div>';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    try {
        const data = await players.stats(playerId);
        const summary = data.summary;
        const telegram = telegramLink(data.player.telegram);
        const canActivate = getSession()?.role === 'admin' && !data.player.is_active;
        title.textContent = data.player.name;
        body.innerHTML = `
            ${
                telegram
                    ? `<a class="player-stats-telegram" href="${telegram.href}" target="_blank" rel="noopener">${escapeHtml(telegram.label)} ↗</a>`
                    : '<span class="player-stats-telegram muted">Telegram не указан</span>'
            }
            ${
                canActivate
                    ? `<button class="btn btn-secondary player-activate-button" id="btn-activate-player">
                           Активировать игрока
                       </button>`
                    : ''
            }
            ${summary.is_provisional ? '<div class="rating-provisional-note">Рейтинг предварительный: сыграно меньше 5 матчей</div>' : ''}
            <div class="player-stats-summary">
                <div><strong>${formatNumber(summary.point_share)}%</strong><span>доля очков</span></div>
                <div><strong>${summary.win_rate}%</strong><span>побед</span></div>
                <div><strong>${formatSigned(summary.average_difference)}</strong><span>разница / игру</span></div>
            </div>
            ${renderTournamentPositionScale(summary.average_finish_percentile)}
            <div class="player-stats-totals">
                <span><b>${summary.tournaments_played}</b> турниров</span>
                <span><b>${summary.matches}</b> игр</span>
                <span><b>${summary.wins}</b> побед</span>
                <span><b>${summary.losses}</b> поражений</span>
            </div>
            <h3>История турниров</h3>
            <div class="player-tournament-history">
                ${
                    data.tournaments.length
                        ? data.tournaments.map(renderPlayerTournament).join('')
                        : '<div class="empty">Сыгранных турниров пока нет</div>'
                }
            </div>
        `;
        body.querySelector('#btn-activate-player')?.addEventListener('click', async () => {
            try {
                await players.activate(playerId);
                toast('Игрок снова активен');
                dialog.close();
                renderPlayers(document.getElementById('screen'));
            } catch (error) {
                toast(error.message, true);
            }
        });
    } catch (error) {
        title.textContent = 'Статистика';
        body.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
}

function renderPlayerTournament(item) {
    const date = new Date(String(item.started_at || item.created_at).replace(' ', 'T'));
    const formattedDate = Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
          }).format(date);
    return `
        <article class="player-tournament-row">
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${formattedDate}${item.place ? ` · ${item.place}-е место из ${item.participants}` : ' · не сыгран'}</span>
            </div>
            <div>
                <strong>${item.points}</strong>
                <span>${item.matches} игр · ${item.wins} побед</span>
            </div>
        </article>
    `;
}

function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatSigned(value) {
    const number = Number(value) || 0;
    return `${number > 0 ? '+' : ''}${formatNumber(number)}`;
}

function renderTournamentPositionScale(value) {
    if (value === null || value === undefined) {
        return '<div class="tournament-position-empty">Позиция появится после завершения турнира</div>';
    }
    const position = 100 - Math.max(0, Math.min(100, Number(value)));
    return `
        <div class="tournament-position-scale">
            <strong>Позиция в турнирных сетках</strong>
            <div class="tournament-position-track" role="img" aria-label="Средняя позиция игрока между первым и последним местом">
                <i style="left: ${position}%"></i>
            </div>
            <div class="tournament-position-labels">
                <span>1-е место</span>
                <span>Последнее место</span>
            </div>
        </div>
    `;
}

function editPlayer(listEl, items, id, companyId) {
    const p = items.find((x) => String(x.id) === String(id));
    if (!p) return;

    const card = listEl.querySelector(`[data-edit="${id}"]`)?.closest('.card');
    if (!card) return;

    card.classList.add('editing');
    card.innerHTML = `
        <div class="edit-player-head">
            <strong>${escapeHtml(p.name)}</strong>
            <span>Редактирование игрока</span>
        </div>
        <div class="edit-player-fields">
            <div class="field"><label for="edit-name">Имя</label><input id="edit-name" value="${escapeHtml(p.name)}"></div>
            <div class="field"><label for="edit-tg">Telegram</label><input id="edit-tg" value="${escapeHtml(p.telegram || '')}"></div>
        </div>
        <div class="edit-player-actions">
            <button class="btn btn-ghost" id="cancel-edit">Отмена</button>
            <button class="btn btn-primary" id="save-edit">Сохранить</button>
        </div>
    `;

    card.querySelector('#cancel-edit').addEventListener('click', () => {
        renderList(listEl, items, companyId, true);
    });

    card.querySelector('#save-edit').addEventListener('click', async () => {
        try {
            await players.update(id, {
                name: card.querySelector('#edit-name').value,
                telegram: card.querySelector('#edit-tg').value,
            });
            toast('Сохранено');
            renderPlayers(document.getElementById('screen'));
        } catch (e) {
            toast(e.message, true);
        }
    });
}
