import { companies } from '../api.js';
import { setSession } from '../storage.js';
import { toast, escapeHtml } from '../ui.js';
import { shareViewerInvite } from '../invite.js';

export function renderHome(container, navigate) {
    let selectedCompany = null;

    container.innerHTML = `
        <section class="auth-shell">
            <div class="brand">
                <div class="brand-mark" aria-hidden="true">A</div>
                <div>
                    <h1>Американо</h1>
                    <p>Падел. Партнёры меняются — очки остаются.</p>
                </div>
            </div>

            <div class="segmented" role="tablist" aria-label="Вход или регистрация">
                <button class="segment active" data-auth-tab="create" role="tab" aria-selected="true">Создать</button>
                <button class="segment" data-auth-tab="login" role="tab" aria-selected="false">Войти</button>
            </div>

            <div class="auth-panel" id="create-panel">
                <div class="section-heading">
                    <h2>Новая компания</h2>
                    <p>Получите код и пригласите участников</p>
                </div>
                <div class="field">
                    <label for="create-name">Название компании</label>
                    <input id="create-name" placeholder="Например, Клуб Ракетка" autocomplete="organization">
                </div>
                <button class="btn btn-primary" id="btn-create">Создать компанию</button>
            </div>

            <div class="auth-panel hidden" id="login-panel">
                <div class="section-heading">
                    <h2>Вход в турнир</h2>
                    <p>Найдите компанию и введите код</p>
                </div>
                <div class="field">
                    <label for="search-name">Название компании</label>
                    <input id="search-name" placeholder="Начните вводить..." autocomplete="off">
                </div>
                <ul id="search-results" class="search-results"></ul>
                <div id="login-block" class="hidden">
                    <div class="field">
                        <label for="login-password">Код доступа</label>
                        <input id="login-password" inputmode="numeric" placeholder="4–6 цифр" autocomplete="one-time-code">
                    </div>
                    <button class="btn btn-primary" id="btn-login">Войти</button>
                </div>
            </div>
            <button class="browse-games" id="btn-browse-games">
                <span>Посмотреть все игры</span><b aria-hidden="true">→</b>
            </button>
        </section>
    `;

    const createName = container.querySelector('#create-name');
    const searchName = container.querySelector('#search-name');
    const searchResults = container.querySelector('#search-results');
    const loginBlock = container.querySelector('#login-block');
    container.querySelector('#btn-browse-games').addEventListener('click', () => navigate('games'));

    const selectCompany = (company) => {
        selectedCompany = { id: company.id, name: company.name };
        searchName.value = company.name;
        loginBlock.classList.remove('hidden');
        searchResults.innerHTML = '';
        container.querySelector('#login-password').focus();
    };

    const searchCompanies = async (query, selectExact = false) => {
        const { companies: list } = await companies.search(query);
        if (selectExact && list.length) {
            const exact = list.find((item) => item.name.toLowerCase() === query.toLowerCase()) || list[0];
            selectCompany(exact);
            return;
        }
        searchResults.innerHTML = list
            .map(
                (company) =>
                    `<li data-id="${company.id}" data-name="${escapeHtml(company.name)}">${escapeHtml(company.name)}</li>`
            )
            .join('');
    };

    container.querySelectorAll('[data-auth-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            const selected = tab.dataset.authTab;
            container.querySelectorAll('[data-auth-tab]').forEach((item) => {
                const active = item.dataset.authTab === selected;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', String(active));
            });
            container.querySelector('#create-panel').classList.toggle('hidden', selected !== 'create');
            container.querySelector('#login-panel').classList.toggle('hidden', selected !== 'login');
        });
    });

    container.querySelector('#btn-create').addEventListener('click', async () => {
        try {
            const data = await companies.create(createName.value.trim());
            showCredentials(container, data, navigate);
        } catch (e) {
            toast(e.message, true);
        }
    });

    let searchTimer;
    searchName.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const q = searchName.value.trim();
            if (q.length < 2) {
                searchResults.innerHTML = '';
                loginBlock.classList.add('hidden');
                return;
            }
            try {
                await searchCompanies(q);
            } catch (e) {
                toast(e.message, true);
            }
        }, 300);
    });

    searchResults.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        selectCompany({ id: li.dataset.id, name: li.dataset.name });
    });

    container.querySelector('#btn-login').addEventListener('click', async () => {
        if (!selectedCompany) return;
        try {
            const data = await companies.login(
                selectedCompany.name,
                container.querySelector('#login-password').value
            );
            setSession(data);
            window.history.replaceState({}, '', '/');
            navigate('players');
        } catch (e) {
            toast(e.message, true);
        }
    });

    const params = new URLSearchParams(window.location.search);
    const shortLink = window.location.pathname.match(/\/v\/([A-Za-z0-9_-]{12})\/?$/);
    const viewKey = shortLink?.[1] || params.get('view');
    if (viewKey) {
        companies
            .view(viewKey)
            .then((session) => {
                setSession(session);
                window.history.replaceState({}, '', '/');
                navigate('rounds');
            })
            .catch((error) => toast(error.message, true));
        return;
    }

    const invitedCompany = params.get('company');
    if (invitedCompany) {
        container.querySelector('[data-auth-tab="login"]').click();
        searchName.value = invitedCompany;
        searchCompanies(invitedCompany, true).catch((error) => toast(error.message, true));
    }
}

function showCredentials(container, data, navigate) {
    container.innerHTML = `
        <section class="auth-shell">
            <div class="brand compact">
                <div class="brand-mark" aria-hidden="true">A</div>
                <div><h1>Компания создана</h1><p>Сохраните код администратора</p></div>
            </div>
            <div class="credentials card">
                <span class="eyebrow">Компания</span>
                <div class="company-name">${escapeHtml(data.name)}</div>
                <span class="eyebrow">Код администратора</span>
                <div class="password">${escapeHtml(data.password)}</div>
            </div>
            <div class="credentials-warning">
                Обязательно сохраните код. Без него нельзя управлять компанией или восстановить доступ.
            </div>
            <div class="button-stack">
                <button class="btn btn-secondary" id="btn-save-telegram">Сохранить себе в Telegram</button>
                <button class="btn btn-ghost" id="btn-share">Поделиться просмотром</button>
                <button class="btn btn-primary" id="btn-enter">Перейти в турнир</button>
            </div>
        </section>
    `;

    container.querySelector('#btn-share').addEventListener('click', async () => {
        await shareViewerInvite(data.name, data.view_slug);
    });

    container.querySelector('#btn-save-telegram').addEventListener('click', () => {
        const text = [
            'Данные администратора Падел Американо',
            `Компания: ${data.name}`,
            `Код администратора: ${data.password}`,
            'Сохраните это сообщение. Код потребуется для управления турниром.',
        ].join('\n');
        const telegram = new URL('https://t.me/share/url');
        telegram.searchParams.set('url', `${window.location.origin}/`);
        telegram.searchParams.set('text', text);
        window.open(telegram.toString(), '_blank', 'noopener,noreferrer');
    });

    container.querySelector('#btn-enter').addEventListener('click', () => {
        setSession(data);
        navigate('players');
    });
}
