import { companies } from '../api.js';
import { shareViewerInvite } from '../invite.js';
import {
    getFavoriteCompanyIds,
    getMyCompanyIds,
    rememberCompany,
    setSession,
    toggleFavoriteCompany,
} from '../storage.js';
import { escapeHtml, renderError, toast } from '../ui.js';

export async function renderGames(container, navigate) {
    let query = '';
    let page = 1;
    let stopped = false;
    let loading = false;
    let searchTimer = null;
    let scope = getMyCompanyIds().length ? 'my' : 'all';
    let activityStatus = '';

    const load = async (showError = true) => {
        if (stopped || loading) return;
        loading = true;
        try {
            const companyIds = scope === 'my' ? getMyCompanyIds() : null;
            const data = await companies.publicList(
                query,
                page,
                !showError,
                companyIds,
                activityStatus
            );
            if (!stopped) {
                renderCompanies(
                    container,
                    data,
                    actions,
                    query,
                    scope,
                    new Set(getFavoriteCompanyIds()),
                    activityStatus
                );
            }
        } catch (error) {
            if (showError && !stopped) {
                renderError(container, error.message, () => load(true));
            }
        } finally {
            loading = false;
        }
    };

    const actions = {
        search: (value) => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(async () => {
                query = value.trim();
                page = 1;
                await load(true);
            }, 350);
        },
        setScope: async (nextScope) => {
            scope = nextScope;
            page = 1;
            await load(true);
        },
        setActivityStatus: async (nextStatus) => {
            activityStatus = nextStatus;
            page = 1;
            await load(true);
        },
        setPage: async (nextPage) => {
            page = nextPage;
            await load(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        toggleFavorite: async (companyId) => {
            const isFavorite = toggleFavoriteCompany(companyId);
            page = 1;
            toast(isFavorite ? 'Добавлено в избранное' : 'Удалено из избранного');
            await load(false);
        },
        watch: async (companyId, viewSlug) => {
            try {
                const session = await companies.view(viewSlug);
                rememberCompany(companyId);
                setSession(session);
                navigate('tournaments');
            } catch (error) {
                toast(error.message, true);
            }
        },
        enter: (session) => {
            rememberCompany(session.id);
            setSession(session);
            window.history.replaceState({}, '', '/');
            navigate('tournaments');
        },
        refresh: () => load(false),
    };

    await load();
    const pollTimer = window.setInterval(() => {
        const dialogOpen = container.querySelector('#company-auth-dialog')?.open;
        const searchFocused = document.activeElement?.id === 'companies-search-input';
        if (document.visibilityState === 'visible' && !dialogOpen && !searchFocused) load(false);
    }, 15000);

    return () => {
        stopped = true;
        window.clearTimeout(searchTimer);
        window.clearInterval(pollTimer);
    };
}

function renderCompanies(container, data, actions, query, scope, favoriteIds, activityStatus) {
    const items = data.companies || [];
    const pagination = data.pagination || { page: 1, total_pages: 1, total: 0 };
    container.innerHTML = `
        <div class="companies-sticky-head">
            <header class="companies-main-header">
                <div class="companies-brand">
                    <span class="companies-brand-mark">A</span>
                    <div><strong>Американо</strong><small>Компании и турниры</small></div>
                </div>
                <button class="btn-create-company" id="btn-create-company">
                    <span aria-hidden="true">＋</span> Создать компанию
                </button>
            </header>

            <div class="companies-list-heading">
                <h1>Компании:</h1>
                <div class="companies-scope-tabs" role="tablist" aria-label="Фильтр компаний">
                    <button class="${scope === 'my' ? 'active' : ''}" data-company-scope="my" role="tab"
                        aria-selected="${scope === 'my'}">Мои</button>
                    <button class="${scope === 'all' ? 'active' : ''}" data-company-scope="all" role="tab"
                        aria-selected="${scope === 'all'}">Все</button>
                </div>
            </div>

            <div class="company-status-filter" role="group" aria-label="Статус турнира">
                <button class="${activityStatus === '' ? 'active' : ''}" data-activity-status="">Все</button>
                <button class="${activityStatus === 'active' ? 'active' : ''}" data-activity-status="active">Идут</button>
                <button class="${activityStatus === 'collecting' ? 'active' : ''}" data-activity-status="collecting">Собираются</button>
                <button class="${activityStatus === 'abandoned' ? 'active' : ''}" data-activity-status="abandoned">Заброшены</button>
            </div>

            <div class="companies-search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
                <input id="companies-search-input" type="search" placeholder="Найти компанию" value="${escapeHtml(query)}">
            </div>
        </div>

        <div class="companies-public-list">
            ${
                items.length
                    ? items.map((company) => renderCompany(company, favoriteIds)).join('')
                    : activityStatus
                        ? '<div class="empty">Компаний с выбранным статусом нет</div>'
                        : scope === 'my'
                        ? `<div class="empty my-companies-empty">
                               Здесь появятся избранные и недавно посещённые компании.
                               <button data-show-all-companies>Показать все</button>
                           </div>`
                        : '<div class="empty">Компании не найдены</div>'
            }
        </div>

        ${
            pagination.total_pages > 1
                ? `<nav class="companies-pagination" aria-label="Страницы компаний">
                       <button id="btn-prev-page" ${pagination.page <= 1 ? 'disabled' : ''}>← Назад</button>
                       <span>${pagination.page} / ${pagination.total_pages}</span>
                       <button id="btn-next-page" ${pagination.page >= pagination.total_pages ? 'disabled' : ''}>Далее →</button>
                   </nav>`
                : ''
        }

        <dialog class="company-auth-dialog" id="company-auth-dialog">
            <div class="company-auth-head">
                <div><span class="eyebrow">Американо</span><h2 id="company-auth-title">Компания</h2></div>
                <button class="dialog-close" id="btn-close-company-auth" aria-label="Закрыть">×</button>
            </div>
            <div class="company-auth-body" id="company-auth-body"></div>
        </dialog>
    `;

    const dialog = container.querySelector('#company-auth-dialog');
    container.querySelector('#btn-create-company').addEventListener('click', () => {
        showCreateForm(dialog, actions);
    });
    container.querySelector('#btn-close-company-auth').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => closeOnBackdrop(event));
    dialog.addEventListener('close', actions.refresh);

    const input = container.querySelector('#companies-search-input');
    input.addEventListener('input', () => actions.search(input.value));
    container.querySelectorAll('[data-company-scope]').forEach((button) => {
        button.addEventListener('click', () => actions.setScope(button.dataset.companyScope));
    });
    container.querySelectorAll('[data-activity-status]').forEach((button) => {
        button.addEventListener('click', () => {
            actions.setActivityStatus(button.dataset.activityStatus);
        });
    });
    container.querySelector('[data-show-all-companies]')?.addEventListener('click', () => {
        actions.setScope('all');
    });
    container.querySelector('#btn-prev-page')?.addEventListener('click', () => {
        actions.setPage(pagination.page - 1);
    });
    container.querySelector('#btn-next-page')?.addEventListener('click', () => {
        actions.setPage(pagination.page + 1);
    });
    container.querySelectorAll('[data-watch]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            actions.watch(button.dataset.companyId, button.dataset.watch);
        });
    });
    container.querySelectorAll('[data-favorite-company]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            actions.toggleFavorite(button.dataset.favoriteCompany);
        });
    });
    container.querySelectorAll('[data-admin-login]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            showLoginForm(dialog, button.dataset.adminLogin, actions);
        });
    });
    container.querySelectorAll('[data-company-open]').forEach((card) => {
        const open = () => actions.watch(card.dataset.companyOpen, card.dataset.watchSlug);
        card.addEventListener('click', (event) => {
            if (event.target.closest('button, a, input')) return;
            open();
        });
        card.addEventListener('keydown', (event) => {
            if (event.target !== card) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });
}

function renderCompany(company, favoriteIds) {
    const isFavorite = favoriteIds.has(Number(company.id));
    const activityStatus = company.activity_status || 'idle';
    return `
        <article class="company-public-card status-${activityStatus}"
            data-company-open="${company.id}"
            data-watch-slug="${escapeHtml(company.view_slug)}"
            role="link"
            tabindex="0"
            aria-label="Смотреть компанию ${escapeHtml(company.name)}">
            <div class="company-public-title">
                <strong>${escapeHtml(company.name)}</strong>
                <div class="company-public-title-actions">
                    ${renderActivityStatus(activityStatus)}
                    <button class="company-favorite${isFavorite ? ' active' : ''}"
                        data-favorite-company="${company.id}"
                        aria-label="${isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}"
                        aria-pressed="${isFavorite}">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03 6.5 19.92l1.05-6.12L3.1 9.47l6.15-.9Z"/></svg>
                    </button>
                </div>
            </div>
            <div class="company-public-facts">
                <span><b>${company.participants}</b> участников</span>
                <span><b>${company.tournaments_count}</b> турниров</span>
                <span><b>${company.played_matches}/${company.total_matches}</b> матчей</span>
            </div>
            <div class="company-public-footer">
                <small>${formatUpdated(company.updated_at)}</small>
                <div class="company-compact-actions">
                    <button type="button" data-admin-login="${escapeHtml(company.name)}">Войти</button>
                    <button type="button" class="primary" data-company-id="${company.id}" data-watch="${escapeHtml(company.view_slug)}">Смотреть</button>
                </div>
            </div>
        </article>
    `;
}

function renderActivityStatus(status) {
    const statuses = {
        active: '<span class="company-activity-status active"><i></i> Турнир идёт</span>',
        collecting: '<span class="company-activity-status collecting"><i></i> Собирается турнир</span>',
        abandoned: '<span class="company-activity-status abandoned"><i></i> Заброшен</span>',
    };
    return statuses[status] || '';
}

function showCreateForm(dialog, actions) {
    dialog.querySelector('#company-auth-title').textContent = 'Новая компания';
    const body = dialog.querySelector('#company-auth-body');
    body.innerHTML = `
        <form id="company-create-form">
            <p class="company-auth-note">Создайте пространство для участников и нескольких турниров.</p>
            <div class="field">
                <label for="modal-create-name">Название компании</label>
                <input id="modal-create-name" placeholder="Например, Padel Friends" autocomplete="organization">
            </div>
            <button class="btn btn-primary" type="submit">Создать компанию</button>
        </form>
    `;
    openDialog(dialog);
    body.querySelector('#company-create-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const session = await companies.create(body.querySelector('#modal-create-name').value.trim());
            rememberCompany(session.id);
            showCredentials(dialog, session, actions);
        } catch (error) {
            toast(error.message, true);
        }
    });
}

function showLoginForm(dialog, companyName, actions) {
    dialog.querySelector('#company-auth-title').textContent = companyName;
    const body = dialog.querySelector('#company-auth-body');
    body.innerHTML = `
        <form id="company-login-form">
            <p class="company-auth-note">Введите код администратора для управления компанией.</p>
            <div class="field">
                <label for="modal-login-password">Код доступа</label>
                <input id="modal-login-password" inputmode="numeric" placeholder="4–8 цифр" autocomplete="one-time-code">
            </div>
            <button class="btn btn-primary" type="submit">Войти в компанию</button>
            <button class="btn btn-ghost" type="button" id="btn-remind-password">Напомнить пароль</button>
        </form>
    `;
    openDialog(dialog);
    body.querySelector('#company-login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const session = await companies.login(
                companyName,
                body.querySelector('#modal-login-password').value
            );
            actions.enter(session);
        } catch (error) {
            toast(error.message, true);
        }
    });
    body.querySelector('#btn-remind-password').addEventListener('click', () => {
        showRemindForm(dialog, companyName, actions);
    });
}

function showRemindForm(dialog, companyName, actions) {
    dialog.querySelector('#company-auth-title').textContent = 'Напомнить пароль';
    const body = dialog.querySelector('#company-auth-body');
    body.innerHTML = `
        <form id="company-remind-form" novalidate>
            <p class="company-auth-note">Укажите email администратора компании «${escapeHtml(companyName)}».</p>
            <div class="field">
                <label for="modal-remind-email">Email</label>
                <input id="modal-remind-email" type="email" placeholder="admin@example.com" autocomplete="email" required>
                <p class="field-error hidden" id="remind-email-error" role="alert"></p>
            </div>
            <button class="btn btn-primary" type="submit" id="btn-send-remind">Отправить код</button>
            <button class="btn btn-ghost" type="button" id="btn-back-to-login">Назад ко входу</button>
        </form>
    `;
    const form = body.querySelector('#company-remind-form');
    const emailInput = body.querySelector('#modal-remind-email');
    const errorEl = body.querySelector('#remind-email-error');
    const submitBtn = body.querySelector('#btn-send-remind');

    const showFieldError = (message) => {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        emailInput.classList.add('has-error');
        emailInput.focus();
    };
    const clearFieldError = () => {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        emailInput.classList.remove('has-error');
    };

    emailInput.addEventListener('input', clearFieldError);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFieldError();
        const email = emailInput.value.trim();
        if (!email) {
            showFieldError('Укажите email');
            return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';
        try {
            const result = await companies.remindPassword(companyName, email);
            if (!result?.sent) {
                throw new Error('Сервер не подтвердил отправку письма');
            }
            showRemindSent(dialog, companyName, result.email || email, actions);
        } catch (error) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить код';
            showFieldError(error.message || 'Не удалось отправить письмо');
        }
    });
    body.querySelector('#btn-back-to-login').addEventListener('click', () => {
        showLoginForm(dialog, companyName, actions);
    });
}

function showRemindSent(dialog, companyName, maskedEmail, actions) {
    dialog.querySelector('#company-auth-title').textContent = 'Письмо отправлено';
    const body = dialog.querySelector('#company-auth-body');
    body.innerHTML = `
        <div class="company-auth-success">
            <div class="company-auth-success-icon" aria-hidden="true">✓</div>
            <p class="company-auth-note">
                Код администратора отправлен на<br>
                <strong>${escapeHtml(maskedEmail)}</strong>
            </p>
            <p class="company-auth-note">Проверьте входящие и папку «Спам».</p>
            <button class="btn btn-primary" type="button" id="btn-back-to-login">Вернуться ко входу</button>
        </div>
    `;
    body.querySelector('#btn-back-to-login').addEventListener('click', () => {
        showLoginForm(dialog, companyName, actions);
    });
}

function showCredentials(dialog, session, actions) {
    dialog.querySelector('#company-auth-title').textContent = 'Компания создана';
    const body = dialog.querySelector('#company-auth-body');
    body.innerHTML = `
        <div class="modal-credentials">
            <span>Компания</span><strong>${escapeHtml(session.name)}</strong>
            <span>Код администратора</span><b>${escapeHtml(session.password)}</b>
        </div>
        <p class="company-auth-note warning">Сохраните код. Его можно будет запросить на email, если указать email в настройках компании.</p>
        <div class="button-stack">
            <button class="btn btn-secondary" id="btn-modal-save-telegram">Сохранить в Telegram</button>
            <button class="btn btn-ghost" id="btn-modal-share">Поделиться просмотром</button>
            <button class="btn btn-primary" id="btn-modal-enter">Перейти в компанию</button>
        </div>
    `;
    body.querySelector('#btn-modal-save-telegram').addEventListener('click', () => {
        const telegram = new URL('https://t.me/share/url');
        telegram.searchParams.set('url', `${window.location.origin}/`);
        telegram.searchParams.set(
            'text',
            `Компания: ${session.name}\nКод администратора: ${session.password}\nСохраните этот код.`
        );
        window.open(telegram.toString(), '_blank', 'noopener,noreferrer');
    });
    body.querySelector('#btn-modal-share').addEventListener('click', () => {
        shareViewerInvite(session.name, session.view_slug);
    });
    body.querySelector('#btn-modal-enter').addEventListener('click', () => actions.enter(session));
}

function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
}

function closeOnBackdrop(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const outside =
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom;
    if (event.target === event.currentTarget && outside) event.currentTarget.close();
}

function formatUpdated(value) {
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return 'Обновление —';
    return `Обновлено ${new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date)}`;
}
