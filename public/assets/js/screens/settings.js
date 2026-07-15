import { companies } from '../api.js';
import { getSession, setSession, clearSession } from '../storage.js';
import { toast, escapeHtml, confirmAction, renderError } from '../ui.js';

export async function renderSettings(container, navigate) {
    const session = getSession();
    let company;

    try {
        company = await companies.get(session.id);
    } catch (e) {
        renderError(container, e.message, () => renderSettings(container, navigate));
        return;
    }

    const s = company.settings;
    const locked = company.tournament_started;

    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">${escapeHtml(company.name)}</span>
                <h1>Настройки</h1>
            </div>
            ${locked ? '<span class="status-pill locked">Заблокировано</span>' : ''}
        </header>
        ${locked ? '<div class="notice compact">Турнир уже начат. Параметры защищены от изменений.</div>' : ''}

        <div class="card setting-card">
            <div class="setting-icon">#</div>
            <div>
                <h2>Счёт матча</h2>
                <p>Свободный ввод. Суммы 16, 17, 24 и 25 — стандартные.</p>
            </div>
        </div>

        <div class="card setting-card courts-setting">
            <div class="setting-icon">▦</div>
            <div class="setting-main">
                <label for="courts_count">Количество кортов</label>
                <p>Одновременные матчи в одном раунде</p>
            </div>
            <input type="number" id="courts_count" min="1" max="10" value="${s.courts_count}" ${locked ? 'disabled' : ''}>
        </div>

        ${locked ? '' : '<button class="btn btn-primary" id="btn-save-settings">Сохранить настройки</button>'}

        <div class="settings-actions">
            <button class="list-action danger" id="btn-reset"><span>Сбросить турнир</span><b>Все результаты будут удалены</b></button>
            <button class="list-action" id="btn-logout"><span>Выйти из компании</span><b>Вернуться на экран входа</b></button>
        </div>
    `;

    container.querySelector('#btn-save-settings')?.addEventListener('click', async () => {
        try {
            const payload = {
                courts_count: Number(container.querySelector('#courts_count').value),
            };
            const { settings } = await companies.updateSettings(session.id, payload);
            session.settings = settings;
            setSession(session);
            toast('Настройки сохранены');
        } catch (e) {
            toast(e.message, true);
        }
    });

    container.querySelector('#btn-reset').addEventListener('click', async () => {
        if (!confirmAction('Сбросить все раунды и результаты?')) return;
        try {
            await companies.reset(session.id);
            toast('Турнир сброшен');
            renderSettings(container, navigate);
        } catch (e) {
            toast(e.message, true);
        }
    });

    container.querySelector('#btn-logout').addEventListener('click', () => {
        clearSession();
        navigate('home');
    });
}
