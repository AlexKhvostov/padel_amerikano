import { companies } from '../api.js';
import { getSession, clearSession } from '../storage.js';
import { toast, escapeHtml, confirmAction } from '../ui.js';

export async function renderSettings(container, navigate) {
    const session = getSession();
    let company;

    try {
        company = await companies.get(session.id);
    } catch (e) {
        container.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`;
        return;
    }

    const s = company.settings;
    const locked = company.tournament_started;

    container.innerHTML = `
        <h1>Настройки</h1>
        <p class="subtitle">${escapeHtml(company.name)}</p>
        ${locked ? '<div class="error-box">Турнир начат. Изменение настроек недоступно</div>' : ''}

        <div class="card settings-group">
            <h2>Счёт до</h2>
            <label class="radio-row">
                <input type="radio" name="score_limit" value="16" ${s.score_limit === 16 ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                До 16 очков
            </label>
            <label class="radio-row">
                <input type="radio" name="score_limit" value="24" ${s.score_limit === 24 ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                До 24 очков
            </label>
        </div>

        <div class="card settings-group">
            <label class="check-row">
                <input type="checkbox" id="extra_tie" ${s.extra_point_on_tie ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                Дополнительный розыгрыш (+1) при равном счёте
            </label>
            <label class="check-row">
                <input type="checkbox" id="extra_always" ${s.extra_point_always ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                +1 всегда обязательный
            </label>
        </div>

        <div class="card settings-group">
            <div class="field">
                <label>Количество кортов</label>
                <input type="number" id="courts_count" min="1" max="10" value="${s.courts_count}" ${locked ? 'disabled' : ''}>
            </div>
        </div>

        ${locked ? '' : '<button class="btn btn-primary" id="btn-save-settings">Сохранить настройки</button>'}

        <button class="btn btn-danger" id="btn-reset">Сбросить турнир</button>
        <button class="btn btn-secondary" id="btn-logout">Выйти из компании</button>
    `;

    container.querySelector('#btn-save-settings')?.addEventListener('click', async () => {
        try {
            const payload = {
                score_limit: Number(container.querySelector('input[name="score_limit"]:checked').value),
                extra_point_on_tie: container.querySelector('#extra_tie').checked,
                extra_point_always: container.querySelector('#extra_always').checked,
                courts_count: Number(container.querySelector('#courts_count').value),
            };
            const { settings } = await companies.updateSettings(session.id, payload);
            Object.assign(session.settings, settings);
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
