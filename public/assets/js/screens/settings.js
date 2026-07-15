import { companies } from '../api.js';
import { getSession, setSession, clearSession } from '../storage.js';
import { toast, escapeHtml, confirmAction, renderError } from '../ui.js';
import { buildQrUrl, shareViewerInvite } from '../invite.js';

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
    const accessCode = session.password || '';

    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">${escapeHtml(company.name)}</span>
                <h1>Настройки</h1>
            </div>
            ${locked ? '<span class="status-pill locked">Заблокировано</span>' : ''}
        </header>
        ${locked ? '<div class="notice compact">Турнир уже начат. Параметры защищены от изменений.</div>' : ''}

        <div class="card access-card">
            <div class="access-details">
                <span class="eyebrow">Код администратора</span>
                ${
                    accessCode
                        ? `<div class="access-code-row">
                               <strong class="access-code" id="admin-access-code" aria-live="polite">${'•'.repeat(Math.max(4, accessCode.length))}</strong>
                               <button class="code-toggle" id="btn-toggle-code" type="button"
                                   aria-label="Показать код администратора" aria-pressed="false">
                                   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>
                               </button>
                           </div>`
                        : '<p>Чтобы восстановить показ кода, выйдите и войдите в компанию повторно.</p>'
                }
                ${company.view_slug ? '<button class="btn btn-secondary btn-compact" id="btn-share-invite">Поделиться просмотром</button>' : ''}
            </div>
            ${
                company.view_slug
                    ? `<div class="invite-qr-wrap">
                           <img class="invite-qr" src="${buildQrUrl(company.view_slug)}" width="88" height="88"
                               alt="QR-код для просмотра компании ${escapeHtml(company.name)}"
                               loading="lazy" referrerpolicy="no-referrer">
                           <span>QR для просмотра</span>
                       </div>`
                    : ''
            }
        </div>

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

    container.querySelector('#btn-toggle-code')?.addEventListener('click', (event) => {
        const button = event.currentTarget;
        const code = container.querySelector('#admin-access-code');
        const visible = button.getAttribute('aria-pressed') === 'true';
        button.setAttribute('aria-pressed', String(!visible));
        button.setAttribute(
            'aria-label',
            visible ? 'Показать код администратора' : 'Скрыть код администратора'
        );
        code.textContent = visible ? '•'.repeat(Math.max(4, accessCode.length)) : accessCode;
    });

    container.querySelector('#btn-share-invite')?.addEventListener('click', () => {
        shareViewerInvite(company.name, company.view_slug);
    });

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
