import { players } from '../api.js';
import { getSession } from '../storage.js';
import { toast, initials, telegramLink, escapeHtml, confirmAction, renderError } from '../ui.js';

export async function renderPlayers(container) {
    const session = getSession();
    let data;

    try {
        data = await players.list(session.id);
    } catch (e) {
        renderError(container, e.message, () => renderPlayers(container));
        return;
    }

    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">Состав турнира</span>
                <h1>Игроки</h1>
            </div>
            <button class="header-action" id="show-add-player" aria-expanded="false">
                <span aria-hidden="true">＋</span> Добавить
            </button>
        </header>

        <div class="info-strip">
            <span>Активные игроки</span>
            <strong>${data.active_count}<small> / ${data.max}</small></strong>
        </div>

        <div class="card add-player-card hidden" id="add-player-card">
            <div class="section-heading">
                <h2>Новый игрок</h2>
                <p>Telegram можно добавить позже</p>
            </div>
            <div class="field">
                <label for="player-name">Имя *</label>
                <input id="player-name" placeholder="Иван Петров">
            </div>
            <div class="field">
                <label for="player-telegram">Telegram</label>
                <input id="player-telegram" placeholder="@username">
            </div>
            <div class="button-row">
                <button class="btn btn-ghost" id="cancel-add-player">Отмена</button>
                <button class="btn btn-primary" id="btn-add-player">Добавить</button>
            </div>
        </div>

        <div id="players-list" class="player-list"></div>
    `;

    const listEl = container.querySelector('#players-list');
    renderList(listEl, data.players, session.id);

    const addCard = container.querySelector('#add-player-card');
    const showAddButton = container.querySelector('#show-add-player');
    showAddButton.addEventListener('click', () => {
        addCard.classList.toggle('hidden');
        const expanded = !addCard.classList.contains('hidden');
        showAddButton.setAttribute('aria-expanded', String(expanded));
        if (expanded) container.querySelector('#player-name').focus();
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

function renderList(el, items, companyId) {
    if (!items.length) {
        el.innerHTML = '<div class="empty">Пока нет игроков</div>';
        return;
    }

    el.innerHTML = items
        .map((p) => {
            const tg = telegramLink(p.telegram);
            const inactive = !p.is_active ? ' inactive' : '';
            return `
            <div class="card player-card${inactive}">
                <div class="avatar">${initials(p.name)}</div>
                <div class="player-info">
                    <div class="name">${escapeHtml(p.name)}${!p.is_active ? ' (неактивен)' : ''}</div>
                    ${tg ? `<a href="${tg.href}" target="_blank" rel="noopener">${escapeHtml(tg.label)}</a>` : ''}
                    <div class="player-actions">
                        <button class="icon-action" data-edit="${p.id}" aria-label="Редактировать ${escapeHtml(p.name)}">✏️</button>
                        <button class="icon-action danger" data-del="${p.id}" aria-label="Удалить ${escapeHtml(p.name)}">🗑️</button>
                    </div>
                </div>
            </div>`;
        })
        .join('');

    el.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => editPlayer(el, items, btn.dataset.edit, companyId));
    });

    el.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
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

function editPlayer(listEl, items, id, companyId) {
    const p = items.find((x) => String(x.id) === String(id));
    if (!p) return;

    const card = listEl.querySelector(`[data-edit="${id}"]`)?.closest('.card');
    if (!card) return;

    card.innerHTML = `
        <div class="section-heading"><h2>Редактирование</h2><p>${escapeHtml(p.name)}</p></div>
        <div class="field"><label>Имя</label><input id="edit-name" value="${escapeHtml(p.name)}"></div>
        <div class="field"><label>Telegram</label><input id="edit-tg" value="${escapeHtml(p.telegram || '')}"></div>
        <button class="btn btn-primary" id="save-edit">Сохранить</button>
    `;

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
