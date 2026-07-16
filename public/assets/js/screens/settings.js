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

    const accessCode = session.password || '';

    container.innerHTML = `
        <header class="page-header">
            <div>
                <span class="eyebrow">${escapeHtml(company.name)}</span>
                <h1>Настройки</h1>
            </div>
            <span class="status-pill">Компания</span>
        </header>

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

        <div class="company-edit-actions">
            <button class="company-edit-action" id="btn-show-name-form">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                <span><strong>Изменить название</strong><small>${escapeHtml(company.name)}</small></span>
            </button>
            <button class="company-edit-action" id="btn-show-password-form">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/></svg>
                <span><strong>Изменить код</strong><small>4–8 цифр</small></span>
            </button>
        </div>
        <form class="card company-name-change-card hidden" id="company-name-form">
            <div class="field">
                <label for="company-name-input">Новое название компании</label>
                <input id="company-name-input" maxlength="100" value="${escapeHtml(company.name)}">
            </div>
            <p>Название отображается в поиске и публичном списке.</p>
            <div class="button-row">
                <button type="button" class="btn btn-ghost" id="btn-cancel-name">Отмена</button>
                <button type="submit" class="btn btn-primary">Сохранить название</button>
            </div>
        </form>
        <form class="card password-change-card hidden" id="password-change-form">
            <div class="field">
                <label for="current-password">Текущий код</label>
                <input type="password" id="current-password" inputmode="numeric" maxlength="8" autocomplete="current-password">
            </div>
            <div class="password-new-fields">
                <div class="field">
                    <label for="new-password">Новый код</label>
                    <input type="password" id="new-password" inputmode="numeric" maxlength="8" autocomplete="new-password">
                </div>
                <div class="field">
                    <label for="repeat-password">Повторите код</label>
                    <input type="password" id="repeat-password" inputmode="numeric" maxlength="8" autocomplete="new-password">
                </div>
            </div>
            <div class="button-row">
                <button type="button" class="btn btn-ghost" id="btn-cancel-password">Отмена</button>
                <button type="submit" class="btn btn-primary">Сохранить код</button>
            </div>
        </form>

        <div class="settings-actions">
            <button class="list-action" id="btn-logout"><span>Выйти из компании</span><b>Вернуться на экран входа</b></button>
        </div>

        <div class="company-danger-zone">
            <button class="list-action danger delete-company" id="btn-delete-company">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>
                </svg>
                <span><strong>Удалить компанию</strong><b>Компания исчезнет из сервиса без возможности возврата</b></span>
            </button>
        </div>
    `;

    const nameForm = container.querySelector('#company-name-form');
    const passwordForm = container.querySelector('#password-change-form');
    container.querySelector('#btn-show-name-form').addEventListener('click', () => {
        passwordForm.classList.add('hidden');
        nameForm.classList.toggle('hidden');
    });
    container.querySelector('#btn-cancel-name').addEventListener('click', () => {
        nameForm.reset();
        nameForm.classList.add('hidden');
    });
    nameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = container.querySelector('#company-name-input');
        try {
            const { name } = await companies.rename(session.id, input.value);
            session.name = name;
            setSession(session);
            toast('Название компании сохранено');
            renderSettings(container, navigate);
        } catch (e) {
            toast(e.message, true);
        }
    });

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

    container.querySelector('#btn-show-password-form').addEventListener('click', () => {
        nameForm.classList.add('hidden');
        passwordForm.classList.toggle('hidden');
    });
    container.querySelector('#btn-cancel-password').addEventListener('click', () => {
        passwordForm.reset();
        passwordForm.classList.add('hidden');
    });
    passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const currentPassword = container.querySelector('#current-password').value.trim();
        const newPassword = container.querySelector('#new-password').value.trim();
        const repeated = container.querySelector('#repeat-password').value.trim();
        if (newPassword !== repeated) {
            toast('Новые коды не совпадают', true);
            return;
        }
        try {
            await companies.changePassword(session.id, currentPassword, newPassword);
            session.password = newPassword;
            setSession(session);
            toast('Код администратора изменён');
            renderSettings(container, navigate);
        } catch (e) {
            toast(e.message, true);
        }
    });

    container.querySelector('#btn-logout').addEventListener('click', () => {
        clearSession();
        navigate('games');
    });

    container.querySelector('#btn-delete-company').addEventListener('click', async () => {
        const confirmed = confirmAction(
            `Удалить компанию «${company.name}»?\n\nОна исчезнет из поиска, списка игр и станет недоступна по ссылкам. Отменить это действие через сервис невозможно.`
        );
        if (!confirmed) return;

        try {
            await companies.remove(session.id);
            clearSession();
            toast('Компания удалена');
            navigate('games');
        } catch (e) {
            toast(e.message, true);
        }
    });
}
